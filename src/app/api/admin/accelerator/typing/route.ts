import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { typingSentences } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const singleSentenceSchema = z.object({
  language: z.enum(["mandarin", "cantonese"]),
  chineseText: z.string().min(1),
  englishText: z.string().min(1),
  romanisation: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

const bulkSentenceSchema = z.object({
  sentences: z.array(singleSentenceSchema).min(1),
});

const createSchema = z.union([singleSentenceSchema, bulkSentenceSchema]);

const updateSchema = z.object({
  id: z.string().uuid(),
  language: z.enum(["mandarin", "cantonese"]).optional(),
  chineseText: z.string().min(1).optional(),
  englishText: z.string().min(1).optional(),
  romanisation: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// GET — list all typing sentences
// ---------------------------------------------------------------------------

export async function GET() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const sentences = await db
      .select()
      .from(typingSentences)
      .orderBy(asc(typingSentences.language), asc(typingSentences.sortOrder));

    return NextResponse.json({ sentences });
  } catch (error) {
    console.error("Failed to fetch typing sentences:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — create single sentence or bulk upload
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user = await getCurrentUser();

    // Determine if bulk or single
    if ("sentences" in parsed.data) {
      // Bulk upload
      const rows = parsed.data.sentences.map((s) => ({
        language: s.language as "mandarin" | "cantonese",
        chineseText: s.chineseText,
        englishText: s.englishText,
        romanisation: s.romanisation,
        sortOrder: s.sortOrder ?? 0,
        createdBy: user?.id ?? null,
      }));

      const inserted = await db
        .insert(typingSentences)
        .values(rows)
        .returning();

      return NextResponse.json(
        { sentences: inserted, count: inserted.length },
        { status: 201 }
      );
    } else {
      // Single sentence
      const [inserted] = await db
        .insert(typingSentences)
        .values({
          language: parsed.data.language as "mandarin" | "cantonese",
          chineseText: parsed.data.chineseText,
          englishText: parsed.data.englishText,
          romanisation: parsed.data.romanisation,
          sortOrder: parsed.data.sortOrder ?? 0,
          createdBy: user?.id ?? null,
        })
        .returning();

      return NextResponse.json({ sentence: inserted }, { status: 201 });
    }
  } catch (error) {
    console.error("Failed to create typing sentence(s):", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PUT — update a typing sentence
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, ...updates } = parsed.data;
    const [updated] = await db
      .update(typingSentences)
      .set(updates)
      .where(eq(typingSentences.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Sentence not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ sentence: updated });
  } catch (error) {
    console.error("Failed to update typing sentence:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — remove a typing sentence
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await db
      .delete(typingSentences)
      .where(eq(typingSentences.id, parsed.data.id));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete typing sentence:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
