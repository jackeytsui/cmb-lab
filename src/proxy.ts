import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  DEFAULT_PLATFORM_ROLE,
  normalizePlatformRole,
} from "@/lib/platform-roles";

const isCoachRoute = createRouteMatcher(["/coach(.*)"]);
const isSignUpRoute = createRouteMatcher(["/sign-up(.*)"]);
const isStudentAllowedRoute = createRouteMatcher([
  "/dashboard/course-library(.*)",
  "/dashboard/reader(.*)",
  "/dashboard/listening(.*)",
  "/dashboard/coaching(.*)",
  "/dashboard/audio-courses(.*)",
  "/dashboard/flashcards(.*)",
  "/dashboard/grammar(.*)",
  "/dashboard/practice(.*)",
  "/dashboard/srs(.*)",
  "/dashboard/tone(.*)",
  "/dashboard/accelerator(.*)",
  "/dashboard/notepad(.*)",
  "/dashboard/assignment-feedback(.*)",
  "/practice(.*)",
  "/settings(.*)",
]);
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/coach(.*)",
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
  "/api/public(.*)",
  "/verify(.*)",
  "/api/certificates/(.*)/download",
  "/api/podcast/(.*)/feed",
  "/api/podcast/audio/(.*)",
  "/api/podcast/private/(.*)/audio/(.*)",
]);

function normalizeRole(value: unknown) {
  return normalizePlatformRole(value) ?? "";
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

export const proxy = clerkMiddleware(async (auth, req) => {
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

  // Clerk metadata mirrors the database role for edge-only route hints.
  // Server layouts and pages still authorize against the database.
  const claimRole = roleFromSessionClaims(sessionClaims);
  const forcedStudent = process.env.FORCE_STUDENT_MODE === "true";
  const role = forcedStudent
    ? DEFAULT_PLATFORM_ROLE
    : (claimRole || DEFAULT_PLATFORM_ROLE);

  // Admin route protection is enforced in server layouts/pages where full user context is available.
  // Avoid edge false negatives when session claims are missing email/role fields.

  // Coach pages authorize against the database, which is the role source of
  // truth. Clerk metadata is only an edge hint and can lag behind a database
  // role change; let the server page decide instead of rejecting valid staff.
  if (isCoachRoute(req)) {
    return NextResponse.next();
  }

  // Always let the database-backed dashboard page choose the landing page.
  // Clerk role claims are only an edge hint and can be missing or stale; if we
  // intercept the dashboard index here, a valid admin/coach can be mistaken for
  // a student and sent to the reader before the database role is consulted.
  const isDashboardEntry =
    req.nextUrl.pathname === "/dashboard" || req.nextUrl.pathname === "/dashboard/";

  // Student routes are intentionally limited to the core learning paths.
  if (
    role === "student" &&
    isProtectedRoute(req) &&
    !isDashboardEntry &&
    !isStudentAllowedRoute(req)
  ) {
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
