import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { getRealUser, hasMinimumRole } from "@/lib/auth";
import {
  exchangeVideoAskAuthorizationCode,
  fetchVideoAskOrganizations,
  saveVideoAskConnection,
  VIDEOASK_OAUTH_STATE_COOKIE,
} from "@/lib/videoask/client";

export const runtime = "nodejs";

function safeStateMatches(expected: string | undefined, received: string | null) {
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function redirectToAdmin(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/admin/integrations/videoask", request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url);
  response.cookies.delete({
    name: VIDEOASK_OAUTH_STATE_COOKIE,
    path: "/api/admin/integrations/videoask",
  });
  return response;
}

export async function GET(request: NextRequest) {
  if (!(await hasMinimumRole("admin"))) {
    return redirectToAdmin(request, { error: "forbidden" });
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(VIDEOASK_OAUTH_STATE_COOKIE)?.value;
  const receivedState = request.nextUrl.searchParams.get("state");
  if (!safeStateMatches(expectedState, receivedState)) {
    return redirectToAdmin(request, { error: "invalid_state" });
  }

  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) {
    return redirectToAdmin(request, { error: "access_denied" });
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return redirectToAdmin(request, { error: "missing_code" });
  }

  try {
    const tokens = await exchangeVideoAskAuthorizationCode(code);
    const organizations = await fetchVideoAskOrganizations(tokens.access_token);
    if (organizations.length === 0) {
      return redirectToAdmin(request, { error: "no_organization" });
    }
    if (organizations.length > 1) {
      return redirectToAdmin(request, { error: "multiple_organizations" });
    }

    const user = await getRealUser();
    await saveVideoAskConnection({
      organization: organizations[0],
      tokens,
      connectedBy: user?.id ?? null,
    });

    return redirectToAdmin(request, { connected: "1" });
  } catch (error) {
    console.error(
      "[videoask/oauth/callback] Connection failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return redirectToAdmin(request, { error: "connection_failed" });
  }
}
