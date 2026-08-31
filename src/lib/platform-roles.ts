export const PLATFORM_ROLES = [
  "student",
  "consultant",
  "temp",
  "coach",
  "operations",
  "admin",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const DEFAULT_PLATFORM_ROLE: PlatformRole = "student";

export type PlatformRoleDefinition = {
  role: PlatformRole;
  label: string;
  description: string;
  accessLevel: 0 | 1 | 2;
  featureAccess: "configurable" | "full";
};

export const PLATFORM_ROLE_DEFINITIONS: readonly PlatformRoleDefinition[] = [
  {
    role: "admin",
    label: "Admin",
    description: "Full platform access. Manages users, content, and settings.",
    accessLevel: 2,
    featureAccess: "full",
  },
  {
    role: "operations",
    label: "Operations",
    description:
      "Runs day-to-day platform operations with configurable learning feature access.",
    accessLevel: 1,
    featureAccess: "configurable",
  },
  {
    role: "coach",
    label: "Coach",
    description:
      "Manages students and course content. Mandarin Accelerator and Extra Pack are excluded.",
    accessLevel: 1,
    featureAccess: "full",
  },
  {
    role: "consultant",
    label: "Consultant",
    description:
      "Consultant staff access with configurable learning feature access.",
    accessLevel: 1,
    featureAccess: "configurable",
  },
  {
    role: "temp",
    label: "Temp",
    description:
      "Temporary staff access with configurable learning feature access.",
    accessLevel: 1,
    featureAccess: "configurable",
  },
  {
    role: "student",
    label: "Student",
    description:
      "Learns and practices. Feature access is based on platform configuration and assigned tiers.",
    accessLevel: 0,
    featureAccess: "configurable",
  },
] as const;

const ROLE_DEFINITION_MAP = new Map(
  PLATFORM_ROLE_DEFINITIONS.map((definition) => [
    definition.role,
    definition,
  ]),
);

export const PLATFORM_ROLE_OPTIONS = PLATFORM_ROLE_DEFINITIONS.map(
  ({ role, label }) => ({ value: role, label }),
);

export function normalizePlatformRole(value: unknown): PlatformRole | null {
  return typeof value === "string" &&
    (PLATFORM_ROLES as readonly string[]).includes(value)
    ? (value as PlatformRole)
    : null;
}

export function getPlatformRoleDefinition(
  role: unknown,
): PlatformRoleDefinition | null {
  const normalized = normalizePlatformRole(role);
  return normalized ? (ROLE_DEFINITION_MAP.get(normalized) ?? null) : null;
}

export function hasMinimumPlatformRole(
  role: unknown,
  minimumRole: PlatformRole,
): boolean {
  const definition = getPlatformRoleDefinition(role);
  const minimumDefinition = ROLE_DEFINITION_MAP.get(minimumRole);
  return Boolean(
    definition &&
      minimumDefinition &&
      definition.accessLevel >= minimumDefinition.accessLevel,
  );
}

export function isStaffRole(role: unknown): boolean {
  return hasMinimumPlatformRole(role, "coach");
}

export function hasHigherPlatformAccess(
  candidateRole: unknown,
  currentRole: unknown,
): boolean {
  const candidate = getPlatformRoleDefinition(candidateRole);
  const current = getPlatformRoleDefinition(currentRole);
  return Boolean(candidate && current && candidate.accessLevel > current.accessLevel);
}

/** Preserve an existing role unless the candidate strictly raises access. */
export function resolveNonDowngradingPlatformRole(
  currentRole: PlatformRole,
  candidateRole: PlatformRole,
): PlatformRole {
  return hasHigherPlatformAccess(candidateRole, currentRole)
    ? candidateRole
    : currentRole;
}

/** Default package bypass; explicit role exclusions still take precedence. */
export function hasFullFeatureAccess(role: unknown): boolean {
  return getPlatformRoleDefinition(role)?.featureAccess === "full";
}

const COACH_DISABLED_FEATURES = new Set<string>([
  "mandarin_accelerator",
  "audio_accelerator_edition",
  "tone_mastery",
  "listening_training",
]);

/** Role exclusions cannot be re-enabled by package grants or tag overrides. */
export function isFeatureDisabledForRole(role: unknown, feature: string): boolean {
  return role === "coach" && COACH_DISABLED_FEATURES.has(feature);
}

export function filterFeaturesForRole<T extends string>(
  role: unknown,
  features: readonly T[],
): T[] {
  return features.filter((feature) => !isFeatureDisabledForRole(role, feature));
}

/** Preserve existing staff permissions, except coaches no longer use Accelerator. */
export function canManageAcceleratorContent(role: unknown): boolean {
  return isStaffRole(role) && role !== "coach";
}

/** Content authoring is explicit: peer staff roles do not inherit Coach access. */
export function canManageCourseContent(role: unknown): boolean {
  return role === "admin" || role === "coach";
}
