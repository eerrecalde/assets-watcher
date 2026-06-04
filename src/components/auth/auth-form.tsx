"use client";

import { useActionState } from "react";

import type { AuthActionState } from "@/lib/auth/actions";

type AuthFormProps = {
  action: (
    previousState: AuthActionState,
    formData: FormData,
  ) => Promise<AuthActionState>;
  buttonLabel: string;
  mode: "login" | "signup";
  nextPath?: string;
};

const initialState: AuthActionState = {};

export function AuthForm({
  action,
  buttonLabel,
  mode,
  nextPath,
}: AuthFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-8 grid gap-5">
      {nextPath ? <input name="next" type="hidden" value={nextPath} /> : null}

      <label className="grid gap-2 text-sm font-medium text-neutral-200">
        Email
        <input
          autoComplete="email"
          className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-base text-white outline-none transition focus:border-emerald-400"
          name="email"
          required
          type="email"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-neutral-200">
        Password
        <input
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-base text-white outline-none transition focus:border-emerald-400"
          minLength={6}
          name="password"
          required
          type="password"
        />
      </label>

      {state.error ? (
        <p
          aria-live="polite"
          className="rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-200"
        >
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p
          aria-live="polite"
          className="rounded-md border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200"
        >
          {state.message}
        </p>
      ) : null}

      <button
        className="h-11 rounded-md bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Please wait..." : buttonLabel}
      </button>
    </form>
  );
}
