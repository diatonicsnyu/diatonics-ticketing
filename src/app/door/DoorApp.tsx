"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import type { ScanResponse } from "@/app/api/door/scan/route";
import type { LookupTicket } from "@/app/api/door/lookup/route";
import { doorLogout } from "./actions";
import {
  applyQueue,
  loadList,
  loadQueue,
  newCid,
  saveList,
  saveQueue,
  searchList,
  verifyTokenOffline,
  type GuestList,
  type Queue,
  type SyncResponse,
} from "./offline";

/*
 * The door scanner (spec §3.7, §12 "Door scanner", D1, D13–D17, D32).
 * Camera always on, no "tap to scan". Each result fills the screen in
 * green / yellow / red (traffic-light colors, never brand colors) and
 * clears by itself so the next person can step up.
 *
 * Online: every scan is checked by the server (first scan wins).
 * Offline: scans are checked against the guest list saved on this phone and
 * queued; they sync as soon as there's signal (see ./offline.ts).
 * This component only runs in the browser (see DoorClient.tsx).
 */

type Stats = { sold: number; checkedIn: number; doorSales: number; doorSalesMine: number };
type Shown =
  | { kind: "ok"; name: string; type: string; offline: boolean }
  | { kind: "used"; name: string; type: string; when: string; by: string }
  | { kind: "bad"; title: string; detail: string }
  | { kind: "notfound" }
  | { kind: "nosignal" };
type HistoryItem = { at: number; kind: "ok" | "used" | "bad"; text: string };

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };

const SHOW_MS = { ok: 1500, used: 3500, bad: 3500, notfound: 4000, nosignal: 3000 } as const;
/** The same QR again within this time after its result cleared is ignored (they're still holding it up). */
const SAME_CODE_PAUSE_MS = 4000;
const HISTORY_MAX = 300;
/** How often the app checks the signal / syncs, and how old the guest list may get while online. */
const TICK_MS = 10_000;
const LIST_MAX_AGE_MS = 60_000;
/** An online scan waits this long before falling back to the offline list. */
const SCAN_TIMEOUT_MS = 4000;

function nyTime(iso: string | number) {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
}

async function api<T>(url: string, init?: RequestInit, timeoutMs = 8000): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const r = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: (await r.json()) as T };
  } catch {
    return { ok: false, status: 0 }; // no signal / timed out
  }
}

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

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
  const historyKey = `door-history:${eventId}`;

  // ---------- state kept on this phone ----------
  const [list, setListState] = useState<GuestList | null>(() => loadList(eventId));
  const listRef = useRef(list);
  const [queue, setQueueState] = useState<Queue>(() => loadQueue(eventId));
  const queueRef = useRef<Queue>(queue);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(historyKey) ?? "[]") as HistoryItem[];
    } catch {
      return [];
    }
  });

  // Server counts (the last ones we got). Before the first answer, use the saved list's.
  const [serverStats, setServerStats] = useState<Stats>(() => {
    const l = loadList(eventId);
    return l
      ? {
          sold: l.tickets.length,
          checkedIn: l.tickets.filter((t) => t.s === "checked_in").length,
          doorSales: l.doorSales,
          doorSalesMine: l.doorSalesMine,
        }
      : initialStats;
  });
  const [online, setOnlineState] = useState(true);
  const onlineRef = useRef(true);
  const [shown, setShown] = useState<Shown | null>(null);
  const [panel, setPanel] = useState<null | "help" | "history" | "lookup">(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [camError, setCamError] = useState<string | null>(null);
  const [camKey, setCamKey] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const syncing = useRef(false);
  const lastCode = useRef<{ text: string; clearedAt: number }>({ text: "", clearedAt: 0 });
  const pausedRef = useRef(false);

  const setOnline = useCallback((v: boolean) => {
    onlineRef.current = v;
    setOnlineState(v);
  }, []);

  const setList = useCallback((next: GuestList) => {
    listRef.current = next;
    setListState(next);
    saveList(next);
  }, []);

  const setQueue = useCallback(
    (next: Queue) => {
      queueRef.current = next;
      setQueueState(next);
      saveQueue(eventId, next);
    },
    [eventId],
  );

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

  /** Marks a ticket as checked in on this phone's copy of the list. */
  const markLocal = useCallback(
    (ticketId: string, at: string, by: string) => {
      const l = listRef.current;
      if (!l) return;
      setList({ ...l, tickets: l.tickets.map((t) => (t.id === ticketId ? { ...t, s: "checked_in", at, by } : t)) });
    },
    [setList],
  );

  // Scanning pauses while a result or a panel is on screen.
  useEffect(() => {
    pausedRef.current = shown !== null || panel !== null;
    if (!shown) lastCode.current.clearedAt = Date.now();
  }, [shown, panel]);

  // Results clear by themselves.
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), SHOW_MS[shown.kind]);
    return () => clearTimeout(t);
  }, [shown]);

  // ---------- results ----------
  const showOk = useCallback(
    (name: string, type: string, offline: boolean) => {
      setShown({ kind: "ok", name, type, offline });
      addHistory({ at: Date.now(), kind: "ok", text: `${name} · ${type} · checked in${offline ? " (offline)" : ""}` });
      navigator.vibrate?.(120);
    },
    [addHistory],
  );
  const showUsed = useCallback(
    (name: string, type: string, atIso: string | null | undefined, by: string | null | undefined) => {
      const when = atIso ? nyTime(atIso) : "earlier";
      setShown({ kind: "used", name, type, when, by: by || "another phone" });
      addHistory({ at: Date.now(), kind: "used", text: `${name} · already used (${when})` });
      navigator.vibrate?.([80, 60, 80]);
    },
    [addHistory],
  );
  const showBad = useCallback(
    (title: string, detail: string) => {
      setShown({ kind: "bad", title, detail });
      addHistory({ at: Date.now(), kind: "bad", text: title.charAt(0) + title.slice(1).toLowerCase() });
      navigator.vibrate?.([200, 80, 200]);
    },
    [addHistory],
  );

  // ---------- offline check (against the list on this phone) ----------
  const checkInOffline = useCallback(
    async (input: { token: string } | { ticketId: string }, method: "scan" | "lookup") => {
      const l = listRef.current;
      if (!l) {
        setShown({ kind: "nosignal" });
        return;
      }
      let ticketId: string | null;
      if ("token" in input) {
        ticketId = await verifyTokenOffline(input.token, l.key);
        if (!ticketId) {
          showBad("NOT A TICKET", `This QR code isn't a ticket for ${eventName}. Ask them to show their ticket email.`);
          return;
        }
      } else {
        ticketId = input.ticketId;
      }
      const t = l.tickets.find((x) => x.id === ticketId);
      if (!t) {
        setShown({ kind: "notfound" });
        addHistory({ at: Date.now(), kind: "bad", text: "Not found offline (bought recently?)" });
        navigator.vibrate?.([80, 60, 80]);
        return;
      }
      if (t.s === "checked_in") {
        showUsed(t.n, t.t, t.at, t.by);
        return;
      }
      const at = new Date().toISOString();
      markLocal(t.id, at, deviceName);
      setQueue({ ...queueRef.current, checkIns: [...queueRef.current.checkIns, { cid: newCid(), ticketId: t.id, at, method }] });
      showOk(t.n, t.t, true);
    },
    [addHistory, deviceName, eventName, markLocal, setQueue, showBad, showOk, showUsed],
  );

  // ---------- check a ticket in: server first, the phone's list if there's no signal ----------
  const checkIn = useCallback(
    async (input: { token: string } | { ticketId: string }) => {
      if (busy.current) return;
      busy.current = true;
      const method = "token" in input ? "scan" : "lookup";
      try {
        if (onlineRef.current) {
          const res = await api<ScanResponse>("/api/door/scan", postJson(input), SCAN_TIMEOUT_MS);
          if (res.ok) {
            const r = res.data;
            if (r.stats) setServerStats(r.stats);
            if (r.result === "ok") {
              if (r.ticketId) markLocal(r.ticketId, new Date().toISOString(), deviceName);
              showOk(r.name ?? "", r.type ?? "", false);
            } else if (r.result === "used") {
              if (r.ticketId && r.checkedInAt) markLocal(r.ticketId, r.checkedInAt, r.deviceName ?? "");
              showUsed(r.name ?? "", r.type ?? "", r.checkedInAt, r.deviceName);
            } else if (r.result === "wrong_event") {
              showBad("WRONG SHOW", `This ticket is for ${r.eventName ?? "a different show"}, not ${eventName}.`);
            } else if (r.result === "void") {
              showBad("CANCELLED TICKET", `${r.name ? `${r.name}'s` : "This"} ticket was cancelled. Send them to the group leader.`);
            } else {
              showBad("NOT A TICKET", "This QR code isn't a Diatonics ticket. Ask them to show their ticket email.");
            }
            return;
          }
          if (res.status === 401) {
            location.reload(); // logged out (PIN changed / expired). Anything queued stays saved on the phone.
            return;
          }
          if (res.status === 0) setOnline(false);
        }
        // No signal (or the server had a hiccup): use the list on this phone.
        await checkInOffline(input, method);
      } finally {
        busy.current = false;
      }
    },
    [checkInOffline, deviceName, eventName, markLocal, setOnline, showBad, showOk, showUsed],
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

  // ---------- sync + guest list ----------
  const refreshList = useCallback(async () => {
    const r = await api<GuestList>("/api/door/list", undefined, 15_000);
    if (r.ok) {
      setList(applyQueue(r.data, queueRef.current, deviceName));
      setServerStats((s) => ({ ...s, doorSales: r.data.doorSales, doorSalesMine: r.data.doorSalesMine }));
    } else if (r.status === 401) location.reload();
    return r.ok;
  }, [deviceName, setList]);

  const sync = useCallback(async () => {
    const q = queueRef.current;
    if (syncing.current || (q.checkIns.length === 0 && q.sales.length === 0)) return;
    syncing.current = true;
    try {
      const sentIns = new Set(q.checkIns.map((c) => c.cid));
      const sentSales = new Set(q.sales.map((s) => s.cid));
      const r = await api<SyncResponse>("/api/door/sync", postJson(q), 20_000);
      if (!r.ok) {
        if (r.status === 401) location.reload();
        else if (r.status === 0) setOnline(false);
        return;
      }
      // Taps made while this was sending stay in the queue for next time.
      const now = queueRef.current;
      setQueue({ checkIns: now.checkIns.filter((c) => !sentIns.has(c.cid)), sales: now.sales.filter((s) => !sentSales.has(s.cid)) });
      setServerStats(r.data.stats);
      setOnline(true);

      const problems: string[] = [];
      for (const c of r.data.checkIns) {
        if (c.result === "duplicate") {
          problems.push(
            `${c.name} was let in twice: on this phone while offline, and earlier${c.first_by ? ` by ${c.first_by}` : ""}${c.first_at ? ` at ${nyTime(c.first_at)}` : ""}.`,
          );
          addHistory({ at: Date.now(), kind: "used", text: `${c.name} · let in twice (found when syncing)` });
        } else if (c.result === "void") {
          problems.push(`${c.name ?? "Someone"}'s ticket was cancelled, but it was let in while offline.`);
        }
      }
      if (problems.length) setNotices((n) => [...n, ...problems]);
      await refreshList();
    } finally {
      syncing.current = false;
    }
  }, [addHistory, refreshList, setOnline, setQueue]);

  // Every 10 s: check the signal, sync anything waiting, keep the list fresh.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const r = await api<Stats>("/api/door/stats", undefined, 5000);
      if (stopped) return;
      if (r.ok) {
        setServerStats(r.data);
        setOnline(true);
        await sync();
        const l = listRef.current;
        if (!l || Date.now() - l.fetchedAt > LIST_MAX_AGE_MS) await refreshList();
      } else if (r.status === 401) {
        location.reload();
      } else {
        setOnline(false);
      }
    };
    void tick();
    const t = setInterval(tick, TICK_MS);
    const onOnline = () => void tick();
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      stopped = true;
      clearInterval(t);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refreshList, setOnline, sync]);

  // ---------- door-sale counter: always queued, synced right away when online ----------
  const pendingSales = queue.sales.reduce((s, x) => s + x.delta, 0);
  const doorSales = serverStats.doorSales + pendingSales;
  const doorSalesMine = serverStats.doorSalesMine + pendingSales;

  function changeSales(delta: 1 | -1) {
    if (delta === -1 && doorSalesMine <= 0) return;
    setQueue({ ...queueRef.current, sales: [...queueRef.current.sales, { cid: newCid(), delta }] });
    if (onlineRef.current) void sync();
  }

  // ---------- the app opens with no signal: cache it on the phone ----------
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/door-sw.js", { scope: "/door" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Save this page and every file it loaded, so /door opens offline next time.
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin) && /\/(_next\/static|_next\/image|door-icon|door\.webmanifest)/.test(u));
        reg.active?.postMessage({ type: "cache", urls: ["/door", ...urls] });
      })
      .catch(() => {
        /* no offline page load on this browser; scanning offline still works while the app stays open */
      });
  }, []);

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

  // ---------- what the top bar shows ----------
  const localCheckedIn = list ? list.tickets.filter((t) => t.s === "checked_in").length : null;
  const sold = online || !list ? serverStats.sold : list.tickets.length;
  const checkedIn = online || localCheckedIn === null ? serverStats.checkedIn : localCheckedIn;
  const waiting = queue.checkIns.length + queue.sales.length;

  return (
    <div className="flex min-h-dvh flex-col bg-page text-ink">
      {/* top bar: show + live count + online/offline + help */}
      <header className="border-b border-line bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-muted">{eventName}</p>
            <p className="text-xl font-bold">
              {checkedIn} / {sold} checked in
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`flex items-center gap-1 text-sm font-semibold ${online ? "text-green-700" : "text-red-700"}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-green-600" : "bg-red-600"}`} aria-hidden />
              {online ? "Online" : "Offline"}
            </span>
            <button
              onClick={() => setPanel("help")}
              aria-label="Get help"
              className="h-11 w-11 rounded-sm border border-line bg-white text-xl font-bold"
            >
              ?
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          {list ? `Ready offline: ${list.tickets.length} ticket${list.tickets.length === 1 ? "" : "s"} loaded` : "Downloading the guest list…"}
          {waiting > 0 && <strong className="text-ink"> · {waiting} waiting to sync</strong>}
        </p>
      </header>

      {/* problems found while syncing (two people in on one ticket) */}
      {notices.length > 0 && (
        <div className="border-b border-yellow-500 bg-yellow-100 px-4 py-3 text-sm" role="status">
          {notices.map((n, i) => (
            <p key={i}>⚠️ {n}</p>
          ))}
          <p className="mt-1">Let the group leader know.</p>
          <button onClick={() => setNotices([])} className="mt-2 rounded-sm border border-yellow-600 bg-white px-3 py-1.5 font-semibold">
            OK
          </button>
        </div>
      )}

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
            <p className="font-bold">Door sales: {doorSales}</p>
            <p className="text-xs text-muted">People who paid at the door · this phone: {doorSalesMine}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => changeSales(-1)}
              disabled={doorSalesMine <= 0}
              aria-label="Door sales minus one"
              className="h-12 w-12 rounded-sm border border-line bg-white text-2xl font-bold disabled:opacity-40"
            >
              −
            </button>
            <button
              onClick={() => changeSales(1)}
              aria-label="Door sales plus one"
              className="h-12 w-12 rounded-sm bg-burgundy text-2xl font-bold text-white"
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
      {shown && <ResultScreen shown={shown} onTap={() => setShown(null)} />}

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
          list={list}
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
              <strong>&ldquo;Offline&rdquo; at the top?</strong> Keep scanning. It still works with no signal, and everything is sent once
              the signal comes back. Try to keep at least one phone online.
            </p>
            <p>
              <strong>&ldquo;Not found offline&rdquo;?</strong> They probably bought their ticket just now. Look at their ticket email and
              let them in if it&apos;s for this show, or check again once there&apos;s signal.
            </p>
            <p>
              <strong>Someone paid at the door?</strong> Tap <strong>+</strong> under &ldquo;Door sales&rdquo;. Tapped by mistake? Tap{" "}
              <strong>−</strong>.
            </p>
            <p className="text-base text-muted">Logged in as {deviceName}. Only the group leader can undo a check-in.</p>
            {waiting > 0 ? (
              <p className="rounded-sm border border-line bg-page p-3 text-base">
                Don&apos;t log out yet: {waiting} check-in{waiting === 1 ? "" : "s"} / tap{waiting === 1 ? "" : "s"} still need to be sent.
                Wait for signal.
              </p>
            ) : (
              <form action={doorLogout}>
                <button className="w-full rounded-sm border border-line px-4 py-3 text-base font-semibold">Log out of the door app</button>
              </form>
            )}
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
          {shown.offline && <p className="text-base opacity-90">Offline: it&apos;ll sync when there&apos;s signal</p>}
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
      {shown.kind === "notfound" && (
        <>
          <p className="text-8xl" aria-hidden>⚠️</p>
          <p className="text-3xl font-black">NOT FOUND OFFLINE</p>
          <p className="text-xl">
            This ticket is real but isn&apos;t on this phone&apos;s list yet. They probably bought it just now. Check their ticket email,
            or scan again once there&apos;s signal.
          </p>
        </>
      )}
      {shown.kind === "nosignal" && (
        <>
          <p className="text-8xl" aria-hidden>📶</p>
          <p className="text-3xl font-black">NO SIGNAL</p>
          <p className="text-xl">This phone hasn&apos;t downloaded the guest list yet, so it can&apos;t check tickets offline. Find signal and try again.</p>
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

/** Manual lookup (D14). Searches the list on this phone (works offline); asks the server if there's no list yet. */
function Lookup({
  list,
  onClose,
  onCheckIn,
}: {
  list: GuestList | null;
  onClose: () => void;
  onCheckIn: (ticketId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ q: string; tickets: LookupTicket[]; more: boolean; error?: string } | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const t = setTimeout(async () => {
      if (list) {
        const found = await searchList(list, query);
        setState({
          q: query,
          more: found.length > 30,
          tickets: found.slice(0, 30).map((x) => ({
            ticketId: x.id,
            name: x.n,
            type: x.t,
            shortCode: x.c,
            orderNo: x.o,
            status: x.s,
            checkedInAt: x.at,
            deviceName: x.by,
          })),
        });
        return;
      }
      const r = await api<{ tickets: LookupTicket[]; more: boolean }>(`/api/door/lookup?q=${encodeURIComponent(query)}`);
      if (r.ok) setState({ q: query, tickets: r.data.tickets, more: r.data.more });
      else if (r.status === 401) location.reload();
      else setState({ q: query, tickets: [], more: false, error: r.status === 0 ? "No signal. Try again in a moment." : "Something went wrong. Try again." });
    }, 250);
    return () => clearTimeout(t);
  }, [q, list]);

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
        {list && <p className="mt-2 text-xs text-muted">Searches the list on this phone, so it works offline. Emails must be typed in full.</p>}
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
