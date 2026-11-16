"use client";

import { useEffect, useRef, useState } from "react";

/**
 * DEMO of the door scanner (the real one, with the camera, is Step 4).
 * Shows the full-screen green / yellow / red results volunteers will see.
 * Result colors are standard traffic-light colors, NOT brand colors, so
 * burgundy is never confused with "invalid" (spec §11).
 */
type Result =
  | { kind: "valid"; name: string; type: string }
  | { kind: "used"; name: string; when: string; device: string }
  | { kind: "invalid"; reason: string };

const SAMPLE_NAMES = ["Maya R.", "Daniel K.", "Sofia G.", "Ethan W.", "Aisha B.", "Noah P.", "Grace L."];
const TOTAL = 180;

export function DoorDemo() {
  const [checkedIn, setCheckedIn] = useState(142);
  const [result, setResult] = useState<Result | null>(null);
  const [help, setHelp] = useState(false);
  const [history, setHistory] = useState<{ text: string; time: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const nameIdx = useRef(0);

  // Results auto-clear after ~1.5 s, ready for the next person (spec §3.7).
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 1500);
    return () => clearTimeout(t);
  }, [result]);

  const now = () => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  function scan(kind: Result["kind"]) {
    let r: Result;
    if (kind === "valid") {
      const name = SAMPLE_NAMES[nameIdx.current++ % SAMPLE_NAMES.length];
      r = { kind, name, type: "General" };
      setCheckedIn((n) => Math.min(TOTAL, n + 1));
      navigator.vibrate?.(120);
    } else if (kind === "used") {
      r = { kind, name: "Jordan M.", when: "7:02 PM", device: "Door phone 2" };
      navigator.vibrate?.([80, 60, 80]);
    } else {
      r = { kind, reason: "This QR code isn't a ticket for this show." };
      navigator.vibrate?.([200, 80, 200]);
    }
    setResult(r);
    const text = r.kind === "valid" ? `✓ ${r.name} · General` : r.kind === "used" ? `! ${r.name} · already used` : "✕ Not a valid ticket";
    setHistory((h) => [{ text, time: now() }, ...h]);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      {/* top bar */}
      <header className="flex items-center justify-between gap-2 border-b border-line bg-white px-4 py-3">
        <div>
          <p className="text-sm text-muted">Winter Concert</p>
          <p className="text-xl font-bold">{checkedIn} / {TOTAL} checked in</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm font-semibold text-green-700">
            <span className="h-2.5 w-2.5 rounded-full bg-green-600" aria-hidden /> Online
          </span>
          <button onClick={() => setHelp(true)} aria-label="Get help"
            className="h-11 w-11 rounded-sm border border-line bg-white text-xl font-bold">?</button>
        </div>
      </header>

      {/* camera area (real camera in Step 4) */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <div className="relative flex aspect-square w-full max-w-sm items-center justify-center rounded-sm bg-slate-200">
          <div className="absolute inset-10 rounded-sm border-4 border-dashed border-white" aria-hidden />
          <p className="px-8 text-center font-semibold text-slate-600">Camera is always on.<br />Point it at a ticket&apos;s QR code.</p>
        </div>

        <div className="w-full max-w-sm rounded-sm border border-dashed border-burgundy bg-white p-3">
          <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted">Demo: pretend to scan</p>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => scan("valid")} className="rounded-sm bg-green-600 px-2 py-3 text-sm font-bold text-white">Good ticket</button>
            <button onClick={() => scan("used")} className="rounded-sm bg-yellow-400 px-2 py-3 text-sm font-bold text-ink">Used ticket</button>
            <button onClick={() => scan("invalid")} className="rounded-sm bg-red-600 px-2 py-3 text-sm font-bold text-white">Fake ticket</button>
          </div>
        </div>
      </div>

      {/* bottom: small fallbacks */}
      <footer className="flex justify-center gap-3 border-t border-line bg-white px-4 py-3">
        <button onClick={() => setShowHistory(true)} className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">See history</button>
        <button onClick={() => alert("Manual lookup: search by name, email, or short code (built in Step 4).")}
          className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">Manual lookup</button>
      </footer>

      {/* full-screen result */}
      {result && (
        <div role="alert" onClick={() => setResult(null)}
          className={`fixed inset-0 z-20 flex flex-col items-center justify-center gap-4 p-8 text-center ${
            result.kind === "valid" ? "bg-green-600 text-white" : result.kind === "used" ? "bg-yellow-400 text-ink" : "bg-red-600 text-white"
          }`}>
          <p className="text-8xl font-black" aria-hidden>{result.kind === "valid" ? "✓" : result.kind === "used" ? "!" : "✕"}</p>
          {result.kind === "valid" && (<>
            <p className="text-4xl font-black">CHECKED IN</p>
            <p className="text-3xl font-bold">{result.name}</p>
            <p className="text-xl">{result.type}</p>
          </>)}
          {result.kind === "used" && (<>
            <p className="text-4xl font-black">ALREADY USED</p>
            <p className="text-2xl font-bold">{result.name}</p>
            <p className="text-xl">Scanned at {result.when} on {result.device}</p>
          </>)}
          {result.kind === "invalid" && (<>
            <p className="text-4xl font-black">NOT VALID</p>
            <p className="text-xl">{result.reason}</p>
          </>)}
        </div>
      )}

      {/* history */}
      {showHistory && (
        <div className="fixed inset-0 z-10 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-line p-4">
            <p className="text-xl font-bold">Scan history (this phone)</p>
            <button onClick={() => setShowHistory(false)} className="rounded-sm border border-line px-4 py-2 font-semibold">Close</button>
          </div>
          <ul className="flex-1 divide-y divide-line overflow-y-auto">
            {history.length === 0 && <li className="p-4 text-muted">No scans yet.</li>}
            {history.map((h, i) => (
              <li key={i} className="flex justify-between p-4"><span>{h.text}</span><span className="text-muted">{h.time}</span></li>
            ))}
          </ul>
        </div>
      )}

      {/* get help: one plain-language screen (spec D17) */}
      {help && (
        <div className="fixed inset-0 z-10 overflow-y-auto bg-white p-6">
          <div className="mx-auto max-w-md space-y-4 text-lg">
            <h2 className="text-2xl font-black">How the door works</h2>
            <p><span className="rounded-sm bg-green-600 px-2 font-bold text-white">GREEN ✓</span> Good ticket. Let them in.</p>
            <p><span className="rounded-sm bg-yellow-400 px-2 font-bold">YELLOW !</span> Already used. It shows when and where. If it&apos;s the same person coming back, let them in. If not, ask them to find the group leader.</p>
            <p><span className="rounded-sm bg-red-600 px-2 font-bold text-white">RED ✕</span> Not a ticket for this show. Ask them to show their email, or send them to the group leader.</p>
            <p><strong>Phone dead / no QR?</strong> Tap <em>Manual lookup</em> and search their name or email.</p>
            <p><strong>&ldquo;Not found&rdquo;?</strong> They may have just bought. Try manual lookup once you have signal.</p>
            <button onClick={() => setHelp(false)} className="w-full rounded-sm bg-burgundy px-6 py-4 font-bold text-white">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
