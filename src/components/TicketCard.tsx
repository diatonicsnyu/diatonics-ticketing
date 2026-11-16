import QRCode from "qrcode";
import { formatDate, formatTime } from "@/lib/time";
import { TicketActions } from "@/components/TicketActions";

/**
 * One ticket: QR code + short code + "General admission" (spec §3.4, §12).
 * In the real system (Step 3) the QR holds a signed token; in demo mode it
 * holds the short code.
 */
export async function TicketCard({
  qrText,
  code,
  typeName,
  eventName,
  startsAt,
  venue,
  holder,
  index,
  count,
  actions = false,
}: {
  qrText: string;
  code: string;
  typeName: string;
  eventName: string;
  startsAt: string;
  venue: string;
  holder: string;
  index: number;
  count: number;
  /** Show Download / Text-share buttons (web pages only; emails can't run them). */
  actions?: boolean;
}) {
  const colors = { dark: "#1a1a1f", light: "#ffffff" };
  // SVG generated from our own text; no user HTML goes into it.
  const svg = await QRCode.toString(qrText, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: colors });
  // PNG version for the Download / Share buttons.
  const png = actions ? await QRCode.toDataURL(qrText, { width: 600, margin: 2, errorCorrectionLevel: "M", color: colors }) : null;

  return (
    <div className="overflow-hidden rounded-sm border border-line bg-white shadow-sm">
      <div className="bg-burgundy px-5 py-3 text-white">
        <p className="font-display font-bold">{eventName}</p>
        <p className="text-sm opacity-90">
          {formatDate(startsAt)} · {formatTime(startsAt)}
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 p-5 sm:flex-row sm:items-start">
        <div className="w-44 shrink-0" aria-label={`QR code for ticket ${code}`} role="img" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="space-y-1 text-center sm:text-left">
          <p className="text-sm text-muted">Ticket {index} of {count} · {typeName}</p>
          <p className="font-mono text-2xl font-bold tracking-wider">{code}</p>
          <p className="text-sm">{holder}</p>
          <p className="text-sm text-muted">{venue}</p>
          <p className="mt-2 inline-block rounded-sm bg-sky px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink">
            General admission: first come, first served
          </p>
          {png && (
            <TicketActions
              qrPng={png}
              code={code}
              eventName={eventName}
              dateLine={`${formatDate(startsAt)} · ${formatTime(startsAt)}`}
              detailLine={`${typeName} · ${holder}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
