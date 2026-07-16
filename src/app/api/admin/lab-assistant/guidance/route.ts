// src/app/api/admin/lab-assistant/guidance/route.ts
// Read/update the Lab Assistant guidance prompt directly from the admin
// block (no need to visit AI Prompts). Creates the ai_prompts row on first
// save, and keeps the same versioning behaviour as the prompts editor.

import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { aiPrompts, aiPromptVersions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { invalidatePromptCache } from "@/lib/prompts";
import {
  DEFAULT_GUIDANCE_PROMPT,
  LAB_ASSISTANT_PROMPT_SLUG,
} from "@/lib/lab-assistant/guidance";

export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const prompt = await db.query.aiPrompts.findFirst({
      where: eq(aiPrompts.slug, LAB_ASSISTANT_PROMPT_SLUG),
      columns: { currentContent: true, currentVersion: true, updatedAt: true },
    });

    return NextResponse.json({
      content: prompt?.currentContent ?? DEFAULT_GUIDANCE_PROMPT,
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

  try {
    const body = await request.json();
    const content =
      typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const currentUser = await getCurrentUser();
    const existing = await db.query.aiPrompts.findFirst({
      where: eq(aiPrompts.slug, LAB_ASSISTANT_PROMPT_SLUG),
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
      // First save: create the prompt row (replaces the db:seed step).
      version = 1;
      await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(aiPrompts)
          .values({
            slug: LAB_ASSISTANT_PROMPT_SLUG,
            name: "CMB Lab Assistant - Guidance",
            type: "chatbot",
            description:
              "Guidance layer for the CMB Lab Assistant support widget (tone, scope, null-state phrasing, escalation rules).",
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

    invalidatePromptCache(LAB_ASSISTANT_PROMPT_SLUG);
    return NextResponse.json({ success: true, version });
  } catch (error) {
    console.error("[Lab Assistant] Guidance update failed:", error);
    return NextResponse.json(
      { error: "Failed to save guidance" },
      { status: 500 }
    );
  }
}
