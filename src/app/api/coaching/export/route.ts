import { NextResponse } from "next/server";
import { db } from "@/db";
import { coachingSessions, coachingNotes } from "@/db/schema";
import { eq, desc, inArray, ilike, and } from "drizzle-orm";
import { getRealUser } from "@/lib/auth";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

// Allow up to 60s for translation (Vercel serverless default is 10s)
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Server-side batch translation
// ---------------------------------------------------------------------------

const MANDARIN_SYSTEM = `You are a Mandarin Chinese-to-English translator. Translate each sentence to natural, fluent English.
You will receive sentences wrapped in <s> tags like <s>sentence</s>.
Return a JSON array of strings, one translation per input sentence. Return ONLY the JSON array, no other text.`;

const CANTONESE_SYSTEM = `You are a Cantonese-to-English translator. Translate each sentence to natural, fluent English.
You will receive sentences wrapped in <s> tags like <s>sentence</s>.
Return a JSON array of strings, one translation per input sentence. Return ONLY the JSON array, no other text.`;

function extractJsonArray(raw: string): string[] | null {
  const start = raw.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "[") depth++;
    else if (raw[i] === "]") depth--;
    if (depth === 0) {
      try {
        const parsed = JSON.parse(raw.slice(start, i + 1));
        if (Array.isArray(parsed)) return parsed.map((t) => String(t ?? ""));
        return null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Translate an array of Chinese texts to English using OpenAI.
 * Returns an array of the same length, with empty strings for failures.
 */
async function translateTexts(
  texts: string[],
  language: "mandarin" | "cantonese",
): Promise<string[]> {
  if (texts.length === 0) return [];

  const results = Array.from({ length: texts.length }, () => "");
  const CHUNK_SIZE = 25;

  for (let start = 0; start < texts.length; start += CHUNK_SIZE) {
    const chunk = texts.slice(start, start + CHUNK_SIZE);
    const tagged = chunk.map((t) => `<s>${t}</s>`).join("\n");

    try {
      const { text: rawResponse } = await generateText({
        model: openai("gpt-4o-mini"),
        system: language === "cantonese" ? CANTONESE_SYSTEM : MANDARIN_SYSTEM,
        prompt: tagged,
        maxOutputTokens: 4096,
      });

      const parsed = extractJsonArray(rawResponse);
      if (parsed) {
        for (let i = 0; i < chunk.length; i++) {
          results[start + i] = parsed[i] ?? "";
        }
      } else {
        console.error(
          `[coaching-export] Failed to parse GPT response for chunk ${start}:`,
          rawResponse.slice(0, 200),
        );
      }
    } catch (err) {
      console.error(`[coaching-export] Translation chunk ${start} failed:`, err);
      // Continue with next chunk
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const dbUser = await getRealUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCoachOrAdmin = dbUser.role === "coach" || dbUser.role === "admin";
  const isStudent = !isCoachOrAdmin;

  // Students can only export their own sessions; coaches/admins can export any
  if (isStudent && !dbUser.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const studentEmailParam = url.searchParams.get("studentEmail");
  const sessionIdParam = url.searchParams.get("sessionId");
  const includeTranslations = url.searchParams.get("translate") === "1";

  // Students can only export sessions matching their own email
  const effectiveStudentEmail = isStudent ? dbUser.email! : studentEmailParam;

  if (typeParam !== "one_on_one" && typeParam !== "inner_circle") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  // Fetch sessions and notes
  let allNotes: (typeof coachingNotes.$inferSelect)[];
  let sessionList: (typeof coachingSessions.$inferSelect)[];

  if (sessionIdParam) {
    const session = await db.query.coachingSessions.findFirst({
      where: eq(coachingSessions.id, sessionIdParam),
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    // Students can only export their own sessions
    if (isStudent && session.studentEmail?.toLowerCase() !== dbUser.email?.toLowerCase()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    sessionList = [session];
    allNotes = await db
      .select()
      .from(coachingNotes)
      .where(eq(coachingNotes.sessionId, sessionIdParam))
      .orderBy(coachingNotes.order);
  } else {
    let whereClause;
    if (typeParam === "one_on_one") {
      const normalizedEmail = (effectiveStudentEmail ?? "").trim();
      if (normalizedEmail) {
        whereClause = and(
          eq(coachingSessions.type, "one_on_one"),
          ilike(coachingSessions.studentEmail, normalizedEmail),
        );
      } else {
        whereClause = eq(coachingSessions.type, "one_on_one");
      }
    } else {
      whereClause = eq(coachingSessions.type, "inner_circle");
    }

    sessionList = await db
      .select()
      .from(coachingSessions)
      .where(whereClause)
      .orderBy(desc(coachingSessions.updatedAt));

    if (sessionList.length === 0) {
      return NextResponse.json({ sessions: [] });
    }

    const sessionIds = sessionList.map((s) => s.id);
    allNotes = await db
      .select()
      .from(coachingNotes)
      .where(inArray(coachingNotes.sessionId, sessionIds))
      .orderBy(coachingNotes.order);
  }

  // If translation requested, fill in missing translationOverride via OpenAI
  if (includeTranslations) {
    // Collect notes needing translation, grouped by language
    const mandarinItems: Array<{ noteIndex: number; text: string }> = [];
    const cantoneseItems: Array<{ noteIndex: number; text: string }> = [];

    for (let i = 0; i < allNotes.length; i++) {
      const note = allNotes[i];
      if (!note.translationOverride) {
        const text = (note.textOverride || note.text || "").trim();
        if (text) {
          if (note.pane === "mandarin") {
            mandarinItems.push({ noteIndex: i, text });
          } else {
            cantoneseItems.push({ noteIndex: i, text });
          }
        }
      }
    }

    // Translate both languages in parallel
    const [mandarinTranslations, cantoneseTranslations] = await Promise.all([
      translateTexts(
        mandarinItems.map((m) => m.text),
        "mandarin",
      ),
      translateTexts(
        cantoneseItems.map((c) => c.text),
        "cantonese",
      ),
    ]);

    // Apply translations back to note objects
    for (let i = 0; i < mandarinItems.length; i++) {
      if (mandarinTranslations[i]) {
        allNotes[mandarinItems[i].noteIndex] = {
          ...allNotes[mandarinItems[i].noteIndex],
          translationOverride: mandarinTranslations[i],
        };
      }
    }
    for (let i = 0; i < cantoneseItems.length; i++) {
      if (cantoneseTranslations[i]) {
        allNotes[cantoneseItems[i].noteIndex] = {
          ...allNotes[cantoneseItems[i].noteIndex],
          translationOverride: cantoneseTranslations[i],
        };
      }
    }
  }

  // Group notes by session
  const notesBySession = new Map<string, typeof allNotes>();
  for (const note of allNotes) {
    const list = notesBySession.get(note.sessionId) ?? [];
    list.push(note);
    notesBySession.set(note.sessionId, list);
  }

  const responseSessions = sessionList.map((session) => ({
    ...session,
    notes: notesBySession.get(session.id) ?? [],
  }));

  return NextResponse.json({ sessions: responseSessions });
}
