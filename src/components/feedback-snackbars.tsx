"use client";

import { useState } from "react";

export type FeedbackSnackbarMessage = {
  id: string;
  message: string;
  tone: "error" | "success" | "warning";
};

const toneClasses = {
  error: "border-red-800 bg-red-950 text-red-100",
  success: "border-emerald-800 bg-emerald-950 text-emerald-100",
  warning: "border-amber-700 bg-amber-950 text-amber-100",
} satisfies Record<FeedbackSnackbarMessage["tone"], string>;

export function FeedbackSnackbars({
  messages,
}: {
  messages: FeedbackSnackbarMessage[];
}) {
  const [dismissedMessageIds, setDismissedMessageIds] = useState<string[]>([]);
  const visibleMessages = messages.filter(
    (message) => !dismissedMessageIds.includes(message.id),
  );

  if (visibleMessages.length === 0) {
    return null;
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      {visibleMessages.map((message) => (
        <div
          aria-live={message.tone === "success" ? "polite" : "assertive"}
          className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-lg shadow-black/30 ${toneClasses[message.tone]}`}
          key={message.id}
          role={message.tone === "success" ? "status" : "alert"}
        >
          <p className="min-w-0 flex-1 leading-5">{message.message}</p>
          <button
            aria-label="Dismiss notification"
            className="rounded px-2 text-current opacity-70 transition hover:bg-white/10 hover:opacity-100"
            onClick={() =>
              setDismissedMessageIds((currentMessageIds) =>
                currentMessageIds.includes(message.id)
                  ? currentMessageIds
                  : [...currentMessageIds, message.id],
              )
            }
            type="button"
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}
