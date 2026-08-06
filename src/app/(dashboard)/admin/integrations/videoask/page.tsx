import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import {
  getVideoAskConfigurationStatus,
  getVideoAskConnection,
} from "@/lib/videoask/client";
import { videoAskDestinationFocusFromSearchParams } from "@/lib/videoask/vocal-hack-routing";
import { VideoAskIntegrationClient } from "./VideoAskIntegrationClient";

export const metadata = {
  title: "VideoAsk Import — Admin",
};

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Your account is not authorized to connect VideoAsk.",
  invalid_state: "The connection request expired. Please try connecting again.",
  access_denied: "VideoAsk access was not approved.",
  missing_code: "VideoAsk did not return an authorization code.",
  no_organization: "No VideoAsk organization was available to this account.",
  multiple_organizations:
    "This account belongs to multiple VideoAsk organizations. Organization selection must be configured before connecting.",
  connection_failed:
    "VideoAsk could not be connected. Check the Vercel variables and callback URL, then try again.",
};

export default async function VideoAskIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string | string[];
    error?: string | string[];
    courseId?: string | string[];
    moduleId?: string | string[];
    lessonId?: string | string[];
  }>;
}) {
  if (!(await hasMinimumRole("admin"))) redirect("/dashboard");

  const params = await searchParams;
  const connected = Array.isArray(params.connected)
    ? params.connected[0]
    : params.connected;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const destinationFocus =
    videoAskDestinationFocusFromSearchParams(params);
  const configuration = getVideoAskConfigurationStatus();
  const configured = Object.values(configuration).every(Boolean);
  let connection = null;
  let databaseError: string | null = null;
  try {
    connection = await getVideoAskConnection();
  } catch {
    databaseError =
      "The VideoAsk database migration has not been applied to Neon yet.";
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          VideoAsk → native CMB Lab
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Replace course VideoAsk links with native Vocal Hack lessons. CMB Lab
          migrates the coach videos, prompts, sentence content, response rules,
          and review workflow without manual downloading or re-uploading.
        </p>
      </header>

      {connected === "1" ? (
        <p className="mb-6 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          VideoAsk is connected. Short-lived access tokens will now refresh automatically.
        </p>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <p className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </p>
      ) : null}
      {databaseError ? (
        <p className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          {databaseError}
        </p>
      ) : null}

      <VideoAskIntegrationClient
        configured={configured && !databaseError}
        connected={Boolean(connection)}
        organizationName={connection?.organizationName ?? null}
        organizationId={connection?.organizationId ?? null}
        expiresAt={connection?.accessTokenExpiresAt.toISOString() ?? null}
        lastValidatedAt={connection?.lastValidatedAt.toISOString() ?? null}
        lastError={connection?.lastError ?? null}
        destinationFocus={destinationFocus}
      />
    </div>
  );
}
