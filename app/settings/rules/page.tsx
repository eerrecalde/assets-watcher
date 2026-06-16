import { redirect } from "next/navigation";

import type { FeedbackSnackbarMessage } from "@/components/feedback-snackbars";
import {
  RulesSettingsPage,
  type SettingsSupabaseClient,
} from "@/lib/settings/rules-page";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getMessageValue(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];

  return typeof value === "string" ? value : undefined;
}

function buildFeedbackMessages(
  params: Record<string, string | string[] | undefined>,
) {
  const messages: FeedbackSnackbarMessage[] = [];
  const noticeId = getMessageValue(params, "notice") ?? "notice";
  const successMessage = getMessageValue(params, "success");
  const errorMessage = getMessageValue(params, "error");

  if (successMessage) {
    messages.push({
      id: `${noticeId}:success`,
      message: successMessage,
      tone: "success",
    });
  }

  if (errorMessage) {
    messages.push({
      id: `${noticeId}:error`,
      message: errorMessage,
      tone: "error",
    });
  }

  return messages;
}

export default async function Page({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};

  return RulesSettingsPage({
    createSupabaseClient: async () =>
      (await createClient()) as unknown as SettingsSupabaseClient,
    feedbackMessages: buildFeedbackMessages(params),
    redirectToLogin: redirect,
  });
}
