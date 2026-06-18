"use client";

import { useFormStatus } from "react-dom";

export function GenerateAITakeButton() {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-400 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300 aria-disabled:cursor-not-allowed aria-disabled:bg-neutral-700 aria-disabled:text-neutral-300"
      disabled={pending}
      type="submit"
    >
      {pending ? "Generating..." : "Generate AI Take"}
    </button>
  );
}
