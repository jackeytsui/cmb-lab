import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isCoachRoute = createRouteMatcher(["/coach(.*)"]);
const isSignUpRoute = createRouteMatcher(["/sign-up(.*)"]);
const isStudentAllowedRoute = createRouteMatcher([
  "/dashboard/reader(.*)",
  "/dashboard/listening(.*)",
  "/dashboard/coaching(.*)",
  "/dashboard/audio-courses(.*)",
  "/dashboard/flashcards(.*)",
  "/dashboard/accelerator(.*)",
  "/settings(.*)",
]);
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/courses(.*)",
  "/lessons(.*)",
  "/practice(.*)",
  "/settings(.*)",
]);
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/verify(.*)",
  "/api/certificates/(.*)/download",
  "/api/podcast/(.*)/feed",
  "/api/podcast/audio/(.*)",
]);

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeRole(value: unknown) {
  return value === "admin" || value === "coach" || value === "student" ? value : "";
}

function roleFromSessionClaims(sessionClaims: unknown) {
  if (!sessionClaims || typeof sessionClaims !== "object") return "";
  const claims = sessionClaims as Record<string, unknown>;
  return (
    normalizeRole((claims.metadata as Record<string, unknown> | undefined)?.role) ||
    normalizeRole((claims.public_metadata as Record<string, unknown> | undefined)?.role) ||
    normalizeRole((claims.publicMetadata as Record<string, unknown> | undefined)?.role) ||
    normalizeRole(claims.role)
  );
}

function getEmailSet(defaults: string[], envVar?: string) {
  const extra = (envVar || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...defaults, ...extra].map((v) => v.trim().toLowerCase()));
}

const adminEmails = getEmailSet(
  ["contact@thecmblueprint.com", "jackey.tsui@thecmblueprint.com"],
  process.env.ADMIN_EMAILS
);
const coachEmails = getEmailSet(
  ["janelle.wong@thecmblueprint.com", "jackeytsui.wf@gmail.com"],
  process.env.COACH_EMAILS
);

export default clerkMiddleware(async (auth, req) => {
  if (isSignUpRoute(req)) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const { sessionClaims, userId } = await auth();

  // If already signed in and visiting sign-in page, redirect to dashboard
  if (userId && createRouteMatcher(["/sign-in(.*)"])(req)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Allow public routes
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // Require auth for protected routes
  if (!userId && isProtectedRoute(req)) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  // Resolve role in middleware (edge-safe): email allowlist first, then session claims.
  const claimEmail = normalizeEmail(
    sessionClaims?.email ||
      sessionClaims?.primary_email_address ||
      sessionClaims?.email_address
  );
  const claimRole = roleFromSessionClaims(sessionClaims);
  const hasRoleSignals = Boolean(claimRole || claimEmail);
  const forcedStudent = process.env.FORCE_STUDENT_MODE === "true";
  const role = forcedStudent
    ? "student"
    : adminEmails.has(claimEmail)
      ? "admin"
      : coachEmails.has(claimEmail)
        ? "coach"
        : (claimRole || "student");

  // Admin route protection is enforced in server layouts/pages where full user context is available.
  // Avoid edge false negatives when session claims are missing email/role fields.

  // Coach routes - admin or coach (coach has student capabilities too)
  if (isCoachRoute(req) && !["admin", "coach"].includes(role)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Student routes are intentionally limited to the core learning paths.
  if (role === "student" && isProtectedRoute(req) && !isStudentAllowedRoute(req)) {
    return NextResponse.redirect(new URL("/dashboard/reader", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
