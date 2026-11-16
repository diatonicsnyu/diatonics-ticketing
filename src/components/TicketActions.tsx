"use client";

import { useState } from "react";

/**
 * "Download" and "Text / share" buttons under a ticket's QR code.
 * Both use a PNG of the ticket (show, date, QR, short code, GA line) drawn in the browser,
 * so they need no server and no SMS service:
 *  - Download saves the PNG (works offline at the door later).
 *  - Text / share opens the phone's share sheet (Messages, WhatsApp, AirDrop, Save Image...).
 *    Browsers without file sharing fall back to a text message with the code and a link.
 */
export function TicketActions({
  qrPng,
  code,
  eventName,
  dateLine,
  detailLine,
}: {
  qrPng: string; // data:image/png URL, generated on the server from our own text
  code: string;
  eventName: string;
  dateLine: string;
  detailLine: string; // e.g. "General · Moona"
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const fileName = `diatonics-ticket-${code}.png`;

  async function makePng(): Promise<Blob> {
    const W = 800, H = 980;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const root = getComputedStyle(document.documentElement);
    const display = root.getPropertyValue("--font-cinzel").trim() || "Georgia, serif";
    const body = root.getPropertyValue("--font-figtree").trim() || "system-ui, sans-serif";
    await document.fonts?.ready;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#7b1e2e";
    ctx.fillRect(0, 0, W, 150);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 44px ${display}`;
    ctx.fillText(eventName.toUpperCase(), W / 2, 72, W - 60);
    ctx.font = `400 28px ${body}`;
    ctx.fillText(dateLine, W / 2, 118, W - 60);

    const qr = new Image();
    qr.src = qrPng;
    await qr.decode();
    ctx.drawImage(qr, (W - 540) / 2, 180, 540, 540);

    ctx.fillStyle = "#1a1a1f";
    ctx.font = `700 54px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillText(code, W / 2, 790);
    ctx.fillStyle = "#545460";
    ctx.font = `400 28px ${body}`;
    ctx.fillText(detailLine, W / 2, 840, W - 60);

    ctx.fillStyle = "#a9d6f5";
    ctx.fillRect(100, 875, W - 200, 60);
    ctx.fillStyle = "#1a1a1f";
    ctx.font = `700 24px ${body}`;
    ctx.fillText("GENERAL ADMISSION: FIRST COME, FIRST SERVED", W / 2, 914, W - 220);

    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make the image"))), "image/png"),
    );
  }

  async function download() {
    setBusy(true);
    setNote("");
    try {
      const url = URL.createObjectURL(await makePng());
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNote("Saved. On iPhone, find it in the Files app (or long-press the QR code and tap Save to Photos).");
    } catch {
      setNote("Couldn't save the image. Long-press the QR code and tap Save instead.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    setNote("");
    const text = `My Diatonics ticket for ${eventName} (${dateLine}). Code: ${code}`;
    try {
      const file = new File([await makePng()], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${eventName} ticket`, text });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: `${eventName} ticket`, text, url: location.href });
        return;
      }
      // Laptop browsers without a share sheet: open a text message with the link.
      location.href = `sms:?&body=${encodeURIComponent(`${text} ${location.href}`)}`;
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setNote("Sharing didn't work here. Try Download instead.");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "font-display rounded-sm px-4 py-2.5 text-sm font-bold disabled:opacity-60";
  return (
    <div className="mt-3 w-full">
      <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
        <button type="button" onClick={download} disabled={busy} className={`${btn} bg-burgundy text-white hover:bg-burgundy-bright`}>
          Download
        </button>
        <button type="button" onClick={share} disabled={busy} className={`${btn} border border-burgundy bg-white text-burgundy hover:bg-page`}>
          Text / share
        </button>
      </div>
      {note && <p className="mt-2 text-xs text-muted" role="status">{note}</p>}
    </div>
  );
}
