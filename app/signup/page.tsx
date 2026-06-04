import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { signUpAction } from "@/lib/auth/actions";

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-16 text-neutral-100">
      <section className="mx-auto grid min-h-[calc(100vh-8rem)] w-full max-w-md content-center">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-300">
          Assets Watcher
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-normal text-white">
          Create account
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          Start with a protected account before holdings, cash, and watchlist
          data are added in the next milestones.
        </p>

        <AuthForm action={signUpAction} buttonLabel="Create account" mode="signup" />

        <p className="mt-6 text-sm text-neutral-400">
          Already have an account?{" "}
          <Link className="font-medium text-emerald-300 hover:text-emerald-200" href="/login">
            Log in
          </Link>
        </p>
      </section>
    </main>
  );
}
