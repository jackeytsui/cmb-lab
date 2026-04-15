import { NextRequest, NextResponse } from "next/server";
import { and, eq, desc, max } from "drizzle-orm";
import { db } from "@/db";
import { notepadNotes } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

type Pane = "mandarin" | "cantonese";

function isPane(v: unknown): v is Pane {
  return v === "mandarin" || v === "cantonese";
}

/**
 * GET /api/notepad/notes[?pane=mandarin|cantonese]
 * Returns current user's notes (newest order first).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paneParam = req.nextUrl.searchParams.get("pane");
  try {
    const rows = await db
      .select()
      .from(notepadNotes)
      .where(
        paneParam && isPane(paneParam)
          ? and(
              eq(notepadNotes.userId, user.id),
              eq(notepadNotes.pane, paneParam),
            )
          : eq(notepadNotes.userId, user.id),
      )
      .orderBy(desc(notepadNotes.order));

    return NextResponse.json({ notes: rows });
  } catch (err) {
    // Pre-migration fallback — return empty list
    console.warn("[notepad/notes GET] failed, returning empty:", err);
    return NextResponse.json({ notes: [] });
  }
}

/**
 * POST /api/notepad/notes
 * Body: { pane, text }
 * Appends a new note to the given pane with order = max(order)+1.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { pane?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isPane(body.pane)) {
    return NextResponse.json({ error: "Invalid pane" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Text required" }, { status: 400 });
  }
  if (text.length > 10_000) {
    return NextResponse.json(
      { error: "Text too large (max 10,000 chars)" },
      { status: 413 },
    );
  }

  try {
    const [{ maxOrder }] = await db
      .select({ maxOrder: max(notepadNotes.order) })
      .from(notepadNotes)
      .where(
        and(
          eq(notepadNotes.userId, user.id),
          eq(notepadNotes.pane, body.pane),
        ),
      );

    const nextOrder = (maxOrder ?? 0) + 1;

    const [note] = await db
      .insert(notepadNotes)
      .values({
        userId: user.id,
        pane: body.pane,
        text,
        order: nextOrder,
      })
      .returning();

    return NextResponse.json({ note });
  } catch (err) {
    console.error("[notepad/notes POST] failed:", err);
    return NextResponse.json(
      { error: "Failed to create note" },
      { status: 500 },
    );
  }
}
