const watchItems = [
  {
    label: "Manual tracking",
    value: "Holdings, cash, and watchlist setup will be added in upcoming milestones.",
  },
  {
    label: "Deterministic checks",
    value: "Future labels will come from transparent rules before any AI explanation.",
  },
  {
    label: "Educational language",
    value: "The app will help structure review decisions without trading instructions.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16 sm:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-300">
            Portfolio intelligence
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-normal text-white sm:text-6xl">
            Assets Watcher
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-300">
            A foundation for tracking US stock holdings, reviewing portfolio
            exposure, and explaining rule-based valuation checks in cautious,
            educational language.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {watchItems.map((item) => (
            <article
              className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5"
              key={item.label}
            >
              <h2 className="text-base font-semibold text-white">{item.label}</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-400">{item.value}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
