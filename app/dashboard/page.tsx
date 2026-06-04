import { redirect } from "next/navigation";

import { signOutAction } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/dashboard")}`);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-neutral-800 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-300">
              Protected workspace
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white">
              Dashboard
            </h1>
          </div>

          <form action={signOutAction}>
            <button
              className="h-10 rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
              type="submit"
            >
              Log out
            </button>
          </form>
        </header>

        <div className="grid flex-1 content-center gap-8 py-14">
          <div>
            <p className="text-sm text-neutral-400">Signed in as</p>
            <p className="mt-2 text-lg font-medium text-white">{user.email}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              "Portfolio setup",
              "Holdings tracking",
              "Watchlist tracking",
            ].map((label) => (
              <article
                className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-5"
                key={label}
              >
                <h2 className="text-base font-semibold text-white">{label}</h2>
                <p className="mt-3 text-sm leading-6 text-neutral-400">
                  This protected area is ready for the upcoming portfolio
                  milestones.
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
