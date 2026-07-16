// src/app/api/admin/lab-assistant/guidance/route.ts
// Read/update the Lab Assistant guidance prompt and per-intent talk tracks
// directly from the admin block. Rows are created on first save and keep the
// same versioning behaviour as the prompts editor.
//
// ?track=<intent> targets a talk track (start_date, end_date, my_coach,
// referral, testimonial_sheldon); no param targets the overall guidance.

import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { aiPrompts, aiPromptVersions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { invalidatePromptCache } from "@/lib/prompts";
import {
  DEFAULT_GUIDANCE_PROMPT,
  LAB_ASSISTANT_PROMPT_SLUG,
  TALK_TRACK_INTENTS,
  TALK_TRACK_LABELS,
  talkTrackSlug,
  type TalkTrackIntent,
} from "@/lib/lab-assistant/guidance";

interface Target {
  slug: string;
  name: string;
  description: string;
  defaultContent: string;
  /** Talk tracks may be saved empty (= cleared); overall guidance may not. */
  allowEmpty: boolean;
}

function resolveTarget(trackParam: string | null): Target | null {
  if (!trackParam) {
    return {
      slug: LAB_ASSISTANT_PROMPT_SLUG,
      name: "CMB Lab Assistant - Guidance",
      description:
        "Guidance layer for the CMB Lab Assistant support widget (tone, scope, null-state phrasing, escalation rules).",
      defaultContent: DEFAULT_GUIDANCE_PROMPT,
      allowEmpty: false,
    };
  }
  if (!(TALK_TRACK_INTENTS as readonly string[]).includes(trackParam)) {
    return null;
  }
  const intent = trackParam as TalkTrackIntent;
  return {
    slug: talkTrackSlug(intent),
    name: `CMB Lab Assistant - Talk Track: ${TALK_TRACK_LABELS[intent]}`,
    description: `Team-authored reply instructions for the "${TALK_TRACK_LABELS[intent]}" intent. Empty = follow the overall guidance only.`,
    defaultContent: "",
    allowEmpty: true,
  };
}

export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target = resolveTarget(request.nextUrl.searchParams.get("track"));
  if (!target) {
    return NextResponse.json({ error: "Unknown track" }, { status: 400 });
  }

  try {
    const prompt = await db.query.aiPrompts.findFirst({
      where: eq(aiPrompts.slug, target.slug),
      columns: { currentContent: true, currentVersion: true, updatedAt: true },
    });

    return NextResponse.json({
      content: prompt?.currentContent ?? target.defaultContent,
      version: prompt?.currentVersion ?? null,
      exists: !!prompt,
      updatedAt: prompt?.updatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("[Lab Assistant] Guidance fetch failed:", error);
    return NextResponse.json(
      { error: "Failed to load guidance" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target = resolveTarget(request.nextUrl.searchParams.get("track"));
  if (!target) {
    return NextResponse.json({ error: "Unknown track" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const content =
      typeof body.content === "string" ? body.content.trim() : "";
    if (!content && !target.allowEmpty) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const currentUser = await getCurrentUser();
    const existing = await db.query.aiPrompts.findFirst({
      where: eq(aiPrompts.slug, target.slug),
      columns: { id: true, currentVersion: true },
    });

    let version: number;
    if (existing) {
      version = existing.currentVersion + 1;
      await db.transaction(async (tx) => {
        await tx.insert(aiPromptVersions).values({
          promptId: existing.id,
          version,
          content,
          changeNote: "Edited from the Lab Assistant admin block",
          createdBy: currentUser?.id || null,
        });
        await tx
          .update(aiPrompts)
          .set({
            currentContent: content,
            currentVersion: version,
            updatedAt: new Date(),
          })
          .where(eq(aiPrompts.id, existing.id));
      });
    } else {
      // First save: create the prompt row (no seeding step needed).
      version = 1;
      await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(aiPrompts)
          .values({
            slug: target.slug,
            name: target.name,
            type: "chatbot",
            description: target.description,
            currentContent: content,
            currentVersion: 1,
          })
          .returning({ id: aiPrompts.id });
        await tx.insert(aiPromptVersions).values({
          promptId: created.id,
          version: 1,
          content,
          changeNote: "Created from the Lab Assistant admin block",
          createdBy: currentUser?.id || null,
        });
      });
    }

    invalidatePromptCache(target.slug);
    return NextResponse.json({ success: true, version });
  } catch (error) {
    console.error("[Lab Assistant] Guidance update failed:", error);
    return NextResponse.json(
      { error: "Failed to save guidance" },
      { status: 500 }
    );
  }
}
