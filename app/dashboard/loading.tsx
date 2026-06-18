export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-10 sm:px-8">
        <div className="border-b border-neutral-800 pb-8">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-300">
            Manual portfolio tracker
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white">
            Dashboard
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            Loading your portfolio snapshot and latest AI take.
          </p>
        </div>

        <div className="grid gap-4 py-8 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              className="h-28 animate-pulse rounded-lg border border-neutral-800 bg-neutral-900/70"
              key={index}
            />
          ))}
        </div>

        <section className="border-t border-neutral-800 pt-8">
          <h2 className="text-lg font-semibold text-white">AI take</h2>
          <div className="mt-5 h-64 animate-pulse rounded-lg border border-neutral-800 bg-neutral-900/70" />
        </section>
      </section>
    </main>
  );
}
