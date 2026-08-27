import { FEATURE_DEFINITIONS } from "@/lib/feature-definitions";

/** Human-readable labels shared by server analytics and client components. */
export const FEATURE_LABELS: Record<string, string> = Object.fromEntries(
  FEATURE_DEFINITIONS.map((feature) => [feature.key, feature.label]),
);
