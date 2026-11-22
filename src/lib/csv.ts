/*
 * CSV downloads that open cleanly in Google Sheets / Excel (no .xlsx).
 */

export const csvMoney = (cents: number) => (cents / 100).toFixed(2);

export const csvWhen = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

// Quote every cell; neutralize spreadsheet formulas (a name like "=HYPERLINK(...)").
function cell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** The BOM makes Excel read the file as UTF-8 (names with accents stay correct). */
export function csvText(header: string[], rows: (string | number)[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
