import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { signInAction } from "@/lib/auth/actions";
import { sanitizeRedirectPath } from "@/lib/auth/redirects";

type LoginPageProps = {
  searchParams: Promise<{
    message?: string | string[];
    next?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const message = firstParam(params.message);
  const nextPath = sanitizeRedirectPath(firstParam(params.next)) ?? "/dashboard";

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-16 text-neutral-100">
      <section className="mx-auto grid min-h-[calc(100vh-8rem)] w-full max-w-md content-center">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-300">
          Assets Watcher
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-normal text-white">
          Log in
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          Access your protected portfolio workspace and continue setting up your
          manual stock tracker.
        </p>

        {message ? (
          <p className="mt-6 rounded-md border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">
            {message}
          </p>
        ) : null}

        <AuthForm
          action={signInAction}
          buttonLabel="Log in"
          mode="login"
          nextPath={nextPath}
        />

        <p className="mt-6 text-sm text-neutral-400">
          Need an account?{" "}
          <Link className="font-medium text-emerald-300 hover:text-emerald-200" href="/signup">
            Sign up
          </Link>
        </p>
      </section>
    </main>
  );
}
