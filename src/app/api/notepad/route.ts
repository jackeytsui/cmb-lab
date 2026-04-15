import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { notepadEntries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

type Pane = "mandarin" | "cantonese";

function isPane(v: unknown): v is Pane {
  return v === "mandarin" || v === "cantonese";
}

/**
 * GET /api/notepad
 * Returns this user's notepad state for both panes. Graceful if the
 * notepad_entries table hasn't been migrated yet — returns empty state.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await db
      .select()
      .from(notepadEntries)
      .where(eq(notepadEntries.userId, user.id));

    const byPane: Record<Pane, unknown> = {
      mandarin: null,
      cantonese: null,
    };
    for (const row of rows) {
      if (row.pane === "mandarin" || row.pane === "cantonese") {
        byPane[row.pane] = {
          text: row.text,
          scriptMode: row.scriptMode,
          fontSize: row.fontSize,
          updatedAt: row.updatedAt,
        };
      }
    }
    return NextResponse.json(byPane);
  } catch (err) {
    // Likely the table doesn't exist yet (pre-migration deploy). Respond with
    // empty state so the client can still function.
    console.warn("[notepad GET] query failed, returning empty state:", err);
    return NextResponse.json({ mandarin: null, cantonese: null });
  }
}

/**
 * POST /api/notepad
 * Body: { pane: "mandarin" | "cantonese", text: string,
 *         scriptMode: "simplified" | "traditional", fontSize: number }
 * Upserts this user's notepad state for one pane.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    pane?: unknown;
    text?: unknown;
    scriptMode?: unknown;
    fontSize?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isPane(body.pane)) {
    return NextResponse.json({ error: "Invalid pane" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text : "";
  const scriptMode =
    body.scriptMode === "traditional" ? "traditional" : "simplified";
  const fontSize =
    typeof body.fontSize === "number" && body.fontSize > 0
      ? Math.min(128, Math.max(8, Math.round(body.fontSize)))
      : 32;

  // Cap text size so a misbehaving paste can't bloat the row
  if (text.length > 50_000) {
    return NextResponse.json(
      { error: "Text too large (max 50,000 chars)" },
      { status: 413 },
    );
  }

  try {
    await db
      .insert(notepadEntries)
      .values({
        userId: user.id,
        pane: body.pane,
        text,
        scriptMode,
        fontSize,
      })
      .onConflictDoUpdate({
        target: [notepadEntries.userId, notepadEntries.pane],
        set: { text, scriptMode, fontSize, updatedAt: new Date() },
      });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notepad POST] upsert failed:", err);
    return NextResponse.json(
      { error: "Failed to save notepad state" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/notepad?pane=mandarin
 * Clears one pane (or both if no pane specified).
 */
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pane = req.nextUrl.searchParams.get("pane");

  try {
    if (pane && isPane(pane)) {
      await db
        .delete(notepadEntries)
        .where(
          and(
            eq(notepadEntries.userId, user.id),
            eq(notepadEntries.pane, pane),
          ),
        );
    } else {
      await db
        .delete(notepadEntries)
        .where(eq(notepadEntries.userId, user.id));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notepad DELETE] failed:", err);
    return NextResponse.json(
      { error: "Failed to clear notepad" },
      { status: 500 },
    );
  }
}
