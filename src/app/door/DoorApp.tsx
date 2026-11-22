"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import type { ScanResponse } from "@/app/api/door/scan/route";
import type { LookupTicket } from "@/app/api/door/lookup/route";
import { doorLogout } from "./actions";

/*
 * The door scanner (spec §3.7, §12 "Door scanner", D1, D14–D17, D32).
 * Camera always on, no "tap to scan". Each result fills the screen in
 * green / yellow / red (traffic-light colors, never brand colors) and
 * clears by itself so the next person can step up.
 */

type Stats = { sold: number; checkedIn: number; doorSales: number; doorSalesMine: number };
type Shown =
  | { kind: "ok"; name: string; type: string }
  | { kind: "used"; name: string; type: string; when: string; by: string }
  | { kind: "bad"; title: string; detail: string }
  | { kind: "nosignal" };
type HistoryItem = { at: number; kind: "ok" | "used" | "bad"; text: string };

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };

const SHOW_MS = { ok: 1500, used: 3500, bad: 3500, nosignal: 3000 } as const;
/** The same QR again within this time after its result cleared is ignored (they're still holding it up). */
const SAME_CODE_PAUSE_MS = 4000;
const HISTORY_MAX = 300;

function nyTime(iso: string | number) {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
}

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const r = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: (await r.json()) as T };
  } catch {
    return { ok: false, status: 0 }; // no signal / timed out
  }
}

export function DoorApp({
  eventId,
  eventName,
  deviceName,
  initialStats,
}: {
  eventId: string;
  eventName: string;
  deviceName: string;
  initialStats: Stats;
}) {
  const [stats, setStats] = useState<Stats>(initialStats);
  const [online, setOnline] = useState(true);
  const [shown, setShown] = useState<Shown | null>(null);
  const [panel, setPanel] = useState<null | "help" | "history" | "lookup">(null);
  const historyKey = `door-history:${eventId}`;
  // This phone's scans, newest first (kept in the browser; only shown after a tap, so no hydration issue).
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(historyKey) ?? "[]") as HistoryItem[];
    } catch {
      return []; // on the server, or private mode: start empty
    }
  });
  const [camError, setCamError] = useState<string | null>(null);
  const [camKey, setCamKey] = useState(0);
  const [salesBusy, setSalesBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const lastCode = useRef<{ text: string; clearedAt: number }>({ text: "", clearedAt: 0 });
  const pausedRef = useRef(false);
  // Scanning pauses while a result or a panel is on screen.
  useEffect(() => {
    pausedRef.current = shown !== null || panel !== null;
    if (!shown) lastCode.current.clearedAt = Date.now();
  }, [shown, panel]);

  const addHistory = useCallback(
    (item: HistoryItem) => {
      setHistory((h) => {
        const next = [item, ...h].slice(0, HISTORY_MAX);
        try {
          localStorage.setItem(historyKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [historyKey],
  );

  // ---------- results clear by themselves ----------
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), SHOW_MS[shown.kind]);
    return () => clearTimeout(t);
  }, [shown]);

  function dismiss() {
    setShown(null);
  }

  // ---------- check a ticket in ----------
  const checkIn = useCallback(
    async (body: { token: string } | { ticketId: string }) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await api<ScanResponse>("/api/door/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          if (res.status === 401) {
            location.reload(); // logged out (PIN changed / expired): back to the login screen
            return;
          }
          setOnline(res.status !== 0);
          setShown({ kind: "nosignal" });
          navigator.vibrate?.([60, 60, 60, 60, 60]);
          return;
        }
        setOnline(true);
        const r = res.data;
        if (r.stats) setStats(r.stats);
        const now = Date.now();
        if (r.result === "ok") {
          setShown({ kind: "ok", name: r.name ?? "", type: r.type ?? "" });
          addHistory({ at: now, kind: "ok", text: `${r.name} · ${r.type} · checked in` });
          navigator.vibrate?.(120);
        } else if (r.result === "used") {
          const when = r.checkedInAt ? nyTime(r.checkedInAt) : "earlier";
          setShown({ kind: "used", name: r.name ?? "", type: r.type ?? "", when, by: r.deviceName ?? "another phone" });
          addHistory({ at: now, kind: "used", text: `${r.name} · already used (${when})` });
          navigator.vibrate?.([80, 60, 80]);
        } else {
          const [title, detail] =
            r.result === "wrong_event"
              ? ["WRONG SHOW", `This ticket is for ${r.eventName ?? "a different show"}, not ${eventName}.`]
              : r.result === "void"
                ? ["CANCELLED TICKET", `${r.name ? `${r.name}'s ` : "This "}ticket was cancelled. Send them to the group leader.`]
                : ["NOT A TICKET", "This QR code isn't a Diatonics ticket. Ask them to show their ticket email."];
          setShown({ kind: "bad", title, detail });
          addHistory({ at: now, kind: "bad", text: title.toLowerCase().replace(/^./, (c) => c.toUpperCase()) });
          navigator.vibrate?.([200, 80, 200]);
        }
      } finally {
        busy.current = false;
      }
    },
    [addHistory, eventName],
  );

  const onCode = useCallback(
    (text: string) => {
      if (pausedRef.current || busy.current) return;
      const last = lastCode.current;
      if (text === last.text && Date.now() - last.clearedAt < SAME_CODE_PAUSE_MS) return;
      lastCode.current = { text, clearedAt: Number.POSITIVE_INFINITY };
      void checkIn({ token: text });
    },
    [checkIn],
  );

  // ---------- camera: always on ----------
  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function start() {
      setCamError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError("This browser can't use the camera. Open the door app in Safari (iPhone) or Chrome (Android).");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        const name = (err as Error)?.name;
        setCamError(
          name === "NotAllowedError"
            ? "Camera access is blocked. Allow the camera for this site (iPhone: Settings → Safari → Camera → Allow), then tap Try again."
            : "Couldn't start the camera. Tap Try again.",
        );
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});

      // Android Chrome can read QR codes itself (fast); everyone else uses jsQR.
      let detector: Detector | null = null;
      const BD = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (BD) {
        try {
          if ((await BD.getSupportedFormats()).includes("qr_code")) detector = new BD({ formats: ["qr_code"] });
        } catch {
          detector = null;
        }
      }

      const tick = async () => {
        if (stopped) return;
        if (!pausedRef.current && !busy.current && video.readyState >= 2 && video.videoWidth > 0) {
          try {
            let text: string | null = null;
            if (detector) {
              const codes = await detector.detect(video);
              text = codes[0]?.rawValue ?? null;
            } else if (ctx) {
              // Center square of the picture, scaled down: plenty for a phone held up to the camera.
              const side = Math.min(video.videoWidth, video.videoHeight);
              const size = Math.min(side, 640);
              canvas.width = size;
              canvas.height = size;
              ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, size, size);
              const img = ctx.getImageData(0, 0, size, size);
              text = jsQR(img.data, size, size, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
            if (text) onCode(text);
          } catch {
            /* a bad frame: try the next one */
          }
        }
        timer = setTimeout(tick, 100);
      };
      void tick();
    }

    void start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camKey, onCode]);

  // iPhones stop the camera when the app goes to the background: restart it on return.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const s = videoRef.current?.srcObject as MediaStream | null;
      if (!s || s.getVideoTracks().every((t) => t.readyState === "ended")) setCamKey((k) => k + 1);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Keep the screen on while the door app is open.
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    async function grab() {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
        if (wl && document.visibilityState === "visible") lock = await wl.request("screen");
      } catch {
        /* not supported / denied: fine */
      }
    }
    void grab();
    document.addEventListener("visibilitychange", grab);
    return () => {
      document.removeEventListener("visibilitychange", grab);
      void lock?.release().catch(() => {});
    };
  }, []);

  // ---------- live counts ----------
  useEffect(() => {
    const refresh = async () => {
      const r = await api<Stats>("/api/door/stats");
      if (r.ok) setStats(r.data);
      else if (r.status === 401) location.reload();
      setOnline(r.ok);
    };
    const t = setInterval(refresh, 15_000);
    const goOnline = () => void refresh();
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  async function changeSales(delta: 1 | -1) {
    if (salesBusy) return;
    setSalesBusy(true);
    const r = await api<Stats>("/api/door/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta }),
    });
    if (r.ok) {
      setStats(r.data);
      setOnline(true);
    } else if (r.status === 401) location.reload();
    else {
      setOnline(r.status !== 0);
      setShown({ kind: "nosignal" });
    }
    setSalesBusy(false);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-page text-ink">
      {/* top bar: show + live count + online + help */}
      <header className="flex items-center justify-between gap-2 border-b border-line bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted">{eventName}</p>
          <p className="text-xl font-bold">
            {stats.checkedIn} / {stats.sold} checked in
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`flex items-center gap-1 text-sm font-semibold ${online ? "text-green-700" : "text-red-700"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-green-600" : "bg-red-600"}`} aria-hidden />
            {online ? "Online" : "No signal"}
          </span>
          <button
            onClick={() => setPanel("help")}
            aria-label="Get help"
            className="h-11 w-11 rounded-sm border border-line bg-white text-xl font-bold"
          >
            ?
          </button>
        </div>
      </header>

      {/* camera */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
        <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-sm bg-slate-200">
          <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-8 rounded-sm border-4 border-white/90" aria-hidden />
          {camError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-100 p-6 text-center">
              <p className="font-semibold">{camError}</p>
              <button onClick={() => setCamKey((k) => k + 1)} className="rounded-sm bg-burgundy px-5 py-3 font-bold text-white">
                Try again
              </button>
            </div>
          )}
        </div>
        {!camError && <p className="text-center font-semibold text-muted">Point the camera at a ticket&apos;s QR code.</p>}

        {/* door-sale counter (D32): count only */}
        <div className="flex w-full max-w-sm items-center justify-between gap-3 rounded-sm border border-line bg-white p-3">
          <div>
            <p className="font-bold">Door sales: {stats.doorSales}</p>
            <p className="text-xs text-muted">People who paid at the door · this phone: {stats.doorSalesMine}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => changeSales(-1)}
              disabled={salesBusy || stats.doorSalesMine <= 0}
              aria-label="Door sales minus one"
              className="h-12 w-12 rounded-sm border border-line bg-white text-2xl font-bold disabled:opacity-40"
            >
              −
            </button>
            <button
              onClick={() => changeSales(1)}
              disabled={salesBusy}
              aria-label="Door sales plus one"
              className="h-12 w-12 rounded-sm bg-burgundy text-2xl font-bold text-white disabled:opacity-60"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* small fallbacks */}
      <footer className="flex flex-wrap items-center justify-center gap-3 border-t border-line bg-white px-4 py-3">
        <button onClick={() => setPanel("lookup")} className="rounded-sm border border-line px-4 py-2.5 font-semibold">
          Manual lookup
        </button>
        <button onClick={() => setPanel("history")} className="rounded-sm border border-line px-4 py-2.5 font-semibold">
          See history
        </button>
      </footer>

      {/* full-screen result */}
      {shown && <ResultScreen shown={shown} onTap={dismiss} />}

      {panel === "history" && (
        <Panel title="Scan history (this phone)" onClose={() => setPanel(null)}>
          <ul className="divide-y divide-line">
            {history.length === 0 && <li className="p-4 text-muted">No scans yet.</li>}
            {history.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-3 p-4">
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm font-black ${
                      h.kind === "ok" ? "bg-green-600 text-white" : h.kind === "used" ? "bg-yellow-400 text-ink" : "bg-red-600 text-white"
                    }`}
                    aria-hidden
                  >
                    {h.kind === "ok" ? "✓" : h.kind === "used" ? "!" : "✕"}
                  </span>
                  {h.text}
                </span>
                <span className="shrink-0 text-muted">{nyTime(h.at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {panel === "lookup" && (
        <Lookup
          onClose={() => setPanel(null)}
          onCheckIn={(ticketId) => {
            setPanel(null);
            void checkIn({ ticketId });
          }}
        />
      )}

      {panel === "help" && (
        <Panel title="How the door works" onClose={() => setPanel(null)} closeLabel="Got it">
          <div className="mx-auto max-w-md space-y-4 p-5 text-lg">
            <p>Hold each ticket&apos;s QR code up to the camera. No buttons needed.</p>
            <p>
              <span className="rounded-sm bg-green-600 px-2 font-bold text-white">GREEN ✓</span> Good ticket. Let them in.
            </p>
            <p>
              <span className="rounded-sm bg-yellow-400 px-2 font-bold">YELLOW !</span> Already used. It shows when and who scanned it.
              If it&apos;s the same person coming back in, let them in. If not, send them to the group leader.
            </p>
            <p>
              <span className="rounded-sm bg-red-600 px-2 font-bold text-white">RED ✕</span> Not a ticket for this show. Ask them to
              show their ticket email, or send them to the group leader.
            </p>
            <p>
              <strong>Phone dead / no QR code?</strong> Tap <em>Manual lookup</em> and search their name, email, order number (like KM47)
              or ticket code.
            </p>
            <p>
              <strong>&ldquo;No signal&rdquo;?</strong> Move closer to the door or a window and try again, or use Manual lookup.
            </p>
            <p>
              <strong>Someone paid at the door?</strong> Tap <strong>+</strong> under &ldquo;Door sales&rdquo;. Tapped by mistake? Tap{" "}
              <strong>−</strong>.
            </p>
            <p className="text-base text-muted">
              Logged in as {deviceName}. Only the group leader can undo a check-in.
            </p>
            <form action={doorLogout}>
              <button className="w-full rounded-sm border border-line px-4 py-3 text-base font-semibold">Log out of the door app</button>
            </form>
          </div>
        </Panel>
      )}
    </div>
  );
}

function ResultScreen({ shown, onTap }: { shown: Shown; onTap: () => void }) {
  const style =
    shown.kind === "ok"
      ? "bg-green-600 text-white"
      : shown.kind === "used"
        ? "bg-yellow-400 text-ink"
        : shown.kind === "bad"
          ? "bg-red-600 text-white"
          : "bg-white text-ink";
  return (
    <div
      role="alert"
      onClick={onTap}
      className={`fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 p-8 text-center ${style}`}
    >
      {shown.kind === "ok" && (
        <>
          <p className="text-9xl font-black" aria-hidden>✓</p>
          <p className="text-4xl font-black">CHECKED IN</p>
          <p className="text-3xl font-bold">{shown.name}</p>
          <p className="text-xl">{shown.type}</p>
        </>
      )}
      {shown.kind === "used" && (
        <>
          <p className="text-9xl font-black" aria-hidden>!</p>
          <p className="text-4xl font-black">ALREADY USED</p>
          <p className="text-3xl font-bold">{shown.name}</p>
          <p className="text-xl">
            Scanned at {shown.when} by {shown.by}
          </p>
        </>
      )}
      {shown.kind === "bad" && (
        <>
          <p className="text-9xl font-black" aria-hidden>✕</p>
          <p className="text-4xl font-black">{shown.title}</p>
          <p className="text-xl">{shown.detail}</p>
        </>
      )}
      {shown.kind === "nosignal" && (
        <>
          <p className="text-8xl" aria-hidden>📶</p>
          <p className="text-3xl font-black">NO SIGNAL</p>
          <p className="text-xl">Couldn&apos;t check this ticket. Try again, or use Manual lookup.</p>
        </>
      )}
      <p className="mt-6 text-sm opacity-80">Tap anywhere to continue</p>
    </div>
  );
}

function Panel({
  title,
  onClose,
  closeLabel = "Close",
  children,
}: {
  title: string;
  onClose: () => void;
  closeLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-line p-4">
        <p className="text-xl font-bold">{title}</p>
        <button onClick={onClose} className="rounded-sm bg-burgundy px-5 py-2.5 font-bold text-white">
          {closeLabel}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function Lookup({ onClose, onCheckIn }: { onClose: () => void; onCheckIn: (ticketId: string) => void }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ q: string; tickets: LookupTicket[]; more: boolean; error?: string } | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const t = setTimeout(async () => {
      const r = await api<{ tickets: LookupTicket[]; more: boolean }>(`/api/door/lookup?q=${encodeURIComponent(query)}`);
      if (r.ok) setState({ q: query, tickets: r.data.tickets, more: r.data.more });
      else if (r.status === 401) location.reload();
      else setState({ q: query, tickets: [], more: false, error: r.status === 0 ? "No signal. Try again in a moment." : "Something went wrong. Try again." });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = q.trim();
  const results = query.length >= 2 && state?.q === query ? state : null;

  return (
    <Panel title="Manual lookup" onClose={onClose}>
      <div className="p-4">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, email, order number or ticket code"
          className="w-full rounded-sm border border-line bg-white px-3 py-3 text-lg"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        {query.length >= 2 && !results && <p className="mt-4 text-muted">Searching…</p>}
        {results?.error && <p className="mt-4 font-semibold text-red-700">{results.error}</p>}
        {results && !results.error && results.tickets.length === 0 && (
          <p className="mt-4 text-muted">Nobody found for &ldquo;{query}&rdquo;. Check the spelling, or try their email or order number.</p>
        )}
        <ul className="mt-4 divide-y divide-line">
          {results?.tickets.map((t) => (
            <li key={t.ticketId} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-bold">{t.name}</p>
                <p className="text-sm text-muted">
                  {t.type} · Order {t.orderNo} · <span className="font-mono">{t.shortCode}</span>
                </p>
              </div>
              {t.status === "valid" ? (
                <button onClick={() => onCheckIn(t.ticketId)} className="shrink-0 rounded-sm bg-green-600 px-4 py-3 font-bold text-white">
                  Check in
                </button>
              ) : (
                <span className="shrink-0 rounded-sm bg-yellow-400 px-3 py-2 text-sm font-bold">
                  In at {t.checkedInAt ? nyTime(t.checkedInAt) : "?"}
                </span>
              )}
            </li>
          ))}
        </ul>
        {results?.more && <p className="mt-2 text-sm text-muted">More matches: type more of the name.</p>}
      </div>
    </Panel>
  );
}
