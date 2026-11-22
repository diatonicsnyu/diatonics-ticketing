/*
 * "Tickets sold per day" for one show (SPEC §12 Admin "sales over time").
 * One series, so no legend: the title names it. Bars are a deeper sky blue
 * (#3f86bd, passes the chart color checks on white; brand burgundy is too
 * dark for bars). Hover or tab to a bar to see its day and count. A hidden
 * table gives screen readers the same numbers.
 */

const BAR = "#3f86bd";

function label(day: string, withYear = false) {
  const d = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) }).format(d);
}

export function SalesChart({ perDay }: { perDay: { day: string; tickets: number }[] }) {
  if (perDay.length === 0) return <p className="text-sm text-muted">No tickets sold yet, so there&apos;s nothing to chart.</p>;
  const max = Math.max(1, ...perDay.map((d) => d.tickets));
  const best = perDay.reduce((a, b) => (b.tickets > a.tickets ? b : a));

  return (
    <figure>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">Tickets sold per day</span>
        <span className="text-sm text-muted">
          Best day: {label(best.day)} ({best.tickets})
        </span>
      </figcaption>
      <div className="mt-3 flex">
        {/* y axis: just the top value, recessive */}
        <div className="flex h-36 flex-col justify-between pr-2 text-right text-xs text-muted tabular-nums">
          <span>{max}</span>
          <span>0</span>
        </div>
        <div className="flex h-36 flex-1 items-end gap-[2px] border-b border-line" aria-hidden>
          {perDay.map((d) => (
            <div key={d.day} tabIndex={0} className="group relative flex h-full min-w-[4px] flex-1 items-end outline-none">
              {/* hit target is the whole column, bigger than the bar */}
              <div
                className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus:opacity-80"
                style={{ height: `${(d.tickets / max) * 100}%`, minHeight: d.tickets ? 3 : 0, background: BAR }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-sm border border-edge bg-white px-2 py-1 text-xs text-ink shadow-md group-hover:block group-focus:block">
                {label(d.day)}: <strong>{d.tickets}</strong> ticket{d.tickets === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between pl-6 text-xs text-muted">
        <span>{label(perDay[0].day)}</span>
        {perDay.length > 1 && <span>{label(perDay.at(-1)!.day)}</span>}
      </div>
      <table className="sr-only">
        <caption>Tickets sold per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Tickets</th>
          </tr>
        </thead>
        <tbody>
          {perDay.map((d) => (
            <tr key={d.day}>
              <td>{label(d.day, true)}</td>
              <td>{d.tickets}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
