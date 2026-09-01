export const CLEAN_STUDENT_ROUTE_PREFIXES = [
  "accelerator-extra",
  "accelerator",
  "assessments",
  "assignment-feedback",
  "audio-courses",
  "coaching",
  "course-library",
  "flashcards",
  "grammar",
  "listening",
  "notepad",
  "progress",
  "reader",
  "srs",
  "threads",
  "tone",
  "vocabulary",
] as const;

export const CLEAN_STUDENT_EXACT_ROUTES = [
  { clean: "/home", legacy: "/dashboard" },
  // Keep this exact: /practice/[setId] is an existing, separate route.
  { clean: "/practice", legacy: "/dashboard/practice" },
] as const;

export function getStudentRouteRedirects() {
  return [
    ...CLEAN_STUDENT_EXACT_ROUTES.map(({ clean, legacy }) => ({
      source: legacy,
      destination: clean,
      permanent: true as const,
    })),
    ...CLEAN_STUDENT_ROUTE_PREFIXES.map((prefix) => ({
      source: `/dashboard/${prefix}/:path*`,
      destination: `/${prefix}/:path*`,
      permanent: true as const,
    })),
  ];
}

export function getStudentRouteRewrites() {
  return [
    ...CLEAN_STUDENT_EXACT_ROUTES.map(({ clean, legacy }) => ({
      source: clean,
      destination: legacy,
    })),
    ...CLEAN_STUDENT_ROUTE_PREFIXES.map((prefix) => ({
      source: `/${prefix}/:path*`,
      destination: `/dashboard/${prefix}/:path*`,
    })),
  ];
}

export const CLEAN_STUDENT_PROTECTED_ROUTE_PATTERNS = [
  "/home(.*)",
  ...CLEAN_STUDENT_ROUTE_PREFIXES.map((prefix) => `/${prefix}(.*)`),
] as const;

