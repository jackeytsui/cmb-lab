// src/app/api/admin/lab-assistant/overview/route.ts
// Data for the Lab Assistant block on the Admin Manage Portal:
// resolution stats, config health, and recent handovers — all derived from
// the sync_events audit trail and existing config tables.
//
// Resilient by design: each section is fetched independently, so one failing
// query degrades that section to a default instead of blanking the whole
// block. Failures are surfaced in `errors` (admin-only endpoint).

import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  aiPrompts,
  ghlFieldMappings,
  ghlLocations,
  syncEvents,
} from "@/db/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { ALLOWLISTED_FIELD_CONCEPTS } from "@/lib/lab-assistant/allowlist";
import { LAB_ASSISTANT_PROMPT_SLUG } from "@/lib/lab-assistant/guidance";
import { isDiscordConfigured } from "@/lib/lab-assistant/notifications";

const STATS_WINDOW_DAYS = 30;
const RECENT_HANDOVER_LIMIT = 5;

const HANDOVER_EVENT_TYPES = [
  "lab_assistant.escalation",
  "lab_assistant.testimonial_request",
];

/** Run a section query; on failure log it, record the message, return the fallback. */
async function section<T>(
  name: string,
  errors: string[],
  fallback: T,
  query: () => Promise<T>
): Promise<T> {
  try {
    return await query();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Lab Assistant] Overview section "${name}" failed:`, message);
    errors.push(`${name}: ${message}`);
    return fallback;
  }
}

export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const errors: string[] = [];
  const windowStart = new Date(
    Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const [
    scanStats,
    intentBreakdown,
    handoverStats,
    recentHandovers,
    mappings,
    activeLocations,
    promptRow,
  ] = await Promise.all([
    section("intent stats", errors, [{ total: 0, resolved: 0, urgent: 0 }], () =>
      db
        .select({
          total: sql<number>`count(*)::int`,
          resolved: sql<number>`count(*) filter (where ${syncEvents.payload}->>'resolved' = 'true')::int`,
          urgent: sql<number>`count(*) filter (where ${syncEvents.payload}->>'urgent' = 'true')::int`,
        })
        .from(syncEvents)
        .where(
          and(
            eq(syncEvents.eventType, "lab_assistant.intent_scan"),
            gte(syncEvents.createdAt, windowStart)
          )
        )
    ),
    section(
      "intent breakdown",
      errors,
      [] as Array<{ intent: string; count: number }>,
      () =>
        db
          .select({
            intent: sql<string>`coalesce(${syncEvents.payload}->>'intent', 'unclassified')`,
            count: sql<number>`count(*)::int`,
          })
          .from(syncEvents)
          .where(
            and(
              eq(syncEvents.eventType, "lab_assistant.intent_scan"),
              gte(syncEvents.createdAt, windowStart)
            )
          )
          .groupBy(sql`coalesce(${syncEvents.payload}->>'intent', 'unclassified')`)
          .orderBy(desc(sql`count(*)`))
    ),
    section(
      "handover stats",
      errors,
      [] as Array<{ eventType: string; status: string; count: number }>,
      () =>
        db
          .select({
            eventType: syncEvents.eventType,
            status: syncEvents.status,
            count: sql<number>`count(*)::int`,
          })
          .from(syncEvents)
          .where(
            and(
              inArray(syncEvents.eventType, HANDOVER_EVENT_TYPES),
              gte(syncEvents.createdAt, windowStart)
            )
          )
          .groupBy(syncEvents.eventType, syncEvents.status)
    ),
    section(
      "recent handovers",
      errors,
      [] as Array<{
        id: string;
        eventType: string;
        status: string;
        payload: unknown;
        createdAt: Date;
      }>,
      () =>
        db
          .select({
            id: syncEvents.id,
            eventType: syncEvents.eventType,
            status: syncEvents.status,
            payload: syncEvents.payload,
            createdAt: syncEvents.createdAt,
          })
          .from(syncEvents)
          .where(inArray(syncEvents.eventType, HANDOVER_EVENT_TYPES))
          .orderBy(desc(syncEvents.createdAt))
          .limit(RECENT_HANDOVER_LIMIT)
    ),
    section("field mappings", errors, null as null | Array<{ lmsConcept: string }>, () =>
      db
        .select({ lmsConcept: ghlFieldMappings.lmsConcept })
        .from(ghlFieldMappings)
        .where(
          and(
            eq(ghlFieldMappings.isActive, true),
            inArray(ghlFieldMappings.lmsConcept, [
              ...ALLOWLISTED_FIELD_CONCEPTS,
            ])
          )
        )
    ),
    section("locations", errors, null as null | Array<{ count: number }>, () =>
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(ghlLocations)
        .where(eq(ghlLocations.isActive, true))
    ),
    section("guidance prompt", errors, null as null | Array<{ id: string }>, () =>
      db
        .select({ id: aiPrompts.id })
        .from(aiPrompts)
        .where(eq(aiPrompts.slug, LAB_ASSISTANT_PROMPT_SLUG))
        .limit(1)
    ),
  ]);

  const mappedConcepts = new Set((mappings ?? []).map((m) => m.lmsConcept));
  const missingMappings =
    mappings === null
      ? []
      : ALLOWLISTED_FIELD_CONCEPTS.filter(
          (concept) => !mappedConcepts.has(concept)
        );

  const stats = scanStats[0] ?? { total: 0, resolved: 0, urgent: 0 };
  const tally = (eventType: string) =>
    handoverStats
      .filter((row) => row.eventType === eventType)
      .reduce(
        (acc, row) => {
          acc.total += row.count;
          if (row.status === "failed") acc.failed += row.count;
          return acc;
        },
        { total: 0, failed: 0 }
      );

  return NextResponse.json({
    windowDays: STATS_WINDOW_DAYS,
    stats: {
      scans: stats.total,
      resolved: stats.resolved,
      resolutionRate:
        stats.total > 0
          ? Math.round((stats.resolved / stats.total) * 100)
          : null,
      urgent: stats.urgent,
      escalations: tally("lab_assistant.escalation"),
      testimonials: tally("lab_assistant.testimonial_request"),
    },
    intentBreakdown,
    recentHandovers: recentHandovers.map((event) => ({
      id: event.id,
      type:
        event.eventType === "lab_assistant.testimonial_request"
          ? "testimonial"
          : "escalation",
      status: event.status,
      // Title carries intent + student name; transcripts stay in GHL tasks.
      title:
        ((event.payload as Record<string, unknown>)?.title as string) ??
        "(untitled)",
      error:
        ((event.payload as Record<string, unknown>)?.error as string) ?? null,
      createdAt: event.createdAt.toISOString(),
    })),
    health: {
      openaiConfigured: !!process.env.OPENAI_API_KEY,
      discordConfigured: await isDiscordConfigured(),
      activeLocations:
        (activeLocations?.[0]?.count ?? 0) ||
        // Legacy env credentials count as one usable location.
        (process.env.GHL_API_TOKEN && process.env.GHL_LOCATION_ID ? 1 : 0),
      promptSeeded: (promptRow?.length ?? 0) > 0,
      missingMappings,
    },
    errors,
  });
}
