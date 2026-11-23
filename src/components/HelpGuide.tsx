/*
 * The layout for the three help guides (buyers at /help, e-board at
 * /admin/help, door volunteers at /door/help): topics on the left as
 * buttons, the answers on the right. On a phone the topics come first.
 */

export type HelpTopic = { id: string; title: string; body: React.ReactNode };

export function HelpGuide({ topics }: { topics: HelpTopic[] }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label="Topics" className="rounded-sm border border-edge bg-panel p-3 lg:sticky lg:top-4">
        <p className="px-1 pb-2 text-xs font-bold uppercase tracking-wider text-muted">Topics</p>
        <ul className="space-y-1.5">
          {topics.map((t) => (
            <li key={t.id}>
              <a
                href={`#${t.id}`}
                className="block rounded-sm border border-edge bg-white px-3 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-px hover:border-burgundy hover:shadow-md"
              >
                {t.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 space-y-4">
        {topics.map((t) => (
          <section key={t.id} id={t.id} className="scroll-mt-4 rounded-sm border border-edge bg-panel p-5 sm:p-6">
            <h2 className="font-display text-xl font-black">{t.title}</h2>
            <div className="mt-3 space-y-3 leading-relaxed [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ul]:list-disc [&_ul]:space-y-1.5">{t.body}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
