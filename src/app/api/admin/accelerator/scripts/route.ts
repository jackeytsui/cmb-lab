import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import {
  conversationScripts,
  scriptLines,
} from "@/db/schema/accelerator";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const lineSchema = z.object({
  role: z.enum(["speaker", "responder"]),
  cantoneseText: z.string().min(1),
  mandarinText: z.string().min(1),
  cantoneseRomanisation: z.string().min(1),
  mandarinRomanisation: z.string().min(1),
  englishText: z.string().min(1),
  cantoneseAudioUrl: z.string().nullable().optional(),
  mandarinAudioUrl: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const createScriptSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  speakerRole: z.string().min(1),
  responderRole: z.string().min(1),
  sortOrder: z.number().int().optional(),
  lines: z.array(lineSchema),
});

const updateScriptSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  speakerRole: z.string().min(1).optional(),
  responderRole: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  lines: z.array(lineSchema).optional(),
});

const deleteScriptSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// GET — fetch all scripts with lines
// ---------------------------------------------------------------------------

export async function GET() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const scripts = await db.query.conversationScripts.findMany({
      orderBy: [asc(conversationScripts.sortOrder)],
      with: {
        lines: {
          orderBy: [asc(scriptLines.sortOrder)],
        },
      },
    });

    return NextResponse.json({ scripts });
  } catch (error) {
    console.error("Error fetching scripts:", error);
    return NextResponse.json(
      { error: "Failed to fetch scripts" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — create script with lines (single or bulk)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();

    // Support bulk upload: array of scripts
    const items = Array.isArray(body) ? body : [body];
    const createdScripts = [];

    for (const item of items) {
      const parsed = createScriptSchema.safeParse(item);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { lines, ...scriptData } = parsed.data;

      const [script] = await db
        .insert(conversationScripts)
        .values({
          title: scriptData.title,
          description: scriptData.description,
          speakerRole: scriptData.speakerRole,
          responderRole: scriptData.responderRole,
          sortOrder: scriptData.sortOrder ?? 0,
          createdBy: user.id,
        })
        .returning();

      if (lines.length > 0) {
        await db.insert(scriptLines).values(
          lines.map((line, idx) => ({
            scriptId: script.id,
            role: line.role,
            cantoneseText: line.cantoneseText,
            mandarinText: line.mandarinText,
            cantoneseRomanisation: line.cantoneseRomanisation,
            mandarinRomanisation: line.mandarinRomanisation,
            englishText: line.englishText,
            cantoneseAudioUrl: line.cantoneseAudioUrl ?? null,
            mandarinAudioUrl: line.mandarinAudioUrl ?? null,
            sortOrder: line.sortOrder ?? idx,
          }))
        );
      }

      // Refetch with lines
      const created = await db.query.conversationScripts.findFirst({
        where: eq(conversationScripts.id, script.id),
        with: {
          lines: { orderBy: [asc(scriptLines.sortOrder)] },
        },
      });

      createdScripts.push(created);
    }

    return NextResponse.json(
      { scripts: createdScripts.length === 1 ? createdScripts[0] : createdScripts },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating script:", error);
    return NextResponse.json(
      { error: "Failed to create script" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PUT — update script metadata and optionally replace lines
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = updateScriptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, lines, ...updates } = parsed.data;

    // Update script metadata
    const updateData: Record<string, unknown> = {};
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.speakerRole !== undefined) updateData.speakerRole = updates.speakerRole;
    if (updates.responderRole !== undefined) updateData.responderRole = updates.responderRole;
    if (updates.sortOrder !== undefined) updateData.sortOrder = updates.sortOrder;

    if (Object.keys(updateData).length > 0) {
      await db
        .update(conversationScripts)
        .set(updateData)
        .where(eq(conversationScripts.id, id));
    }

    // Replace all lines if provided
    if (lines) {
      await db.delete(scriptLines).where(eq(scriptLines.scriptId, id));
      if (lines.length > 0) {
        await db.insert(scriptLines).values(
          lines.map((line, idx) => ({
            scriptId: id,
            role: line.role,
            cantoneseText: line.cantoneseText,
            mandarinText: line.mandarinText,
            cantoneseRomanisation: line.cantoneseRomanisation,
            mandarinRomanisation: line.mandarinRomanisation,
            englishText: line.englishText,
            cantoneseAudioUrl: line.cantoneseAudioUrl ?? null,
            mandarinAudioUrl: line.mandarinAudioUrl ?? null,
            sortOrder: line.sortOrder ?? idx,
          }))
        );
      }
    }

    // Refetch
    const updated = await db.query.conversationScripts.findFirst({
      where: eq(conversationScripts.id, id),
      with: {
        lines: { orderBy: [asc(scriptLines.sortOrder)] },
      },
    });

    return NextResponse.json({ script: updated });
  } catch (error) {
    console.error("Error updating script:", error);
    return NextResponse.json(
      { error: "Failed to update script" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — remove a script (cascade deletes lines)
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = deleteScriptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await db
      .delete(conversationScripts)
      .where(eq(conversationScripts.id, parsed.data.id));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting script:", error);
    return NextResponse.json(
      { error: "Failed to delete script" },
      { status: 500 }
    );
  }
}
