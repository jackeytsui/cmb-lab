import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { submissions, coachNotes } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * POST /api/submissions/[submissionId]/notes
 * Add a note to a submission
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  // 1. Verify user has coach role minimum
  const isCoach = await hasMinimumRole("coach");
  if (!isCoach) {
    return NextResponse.json(
      { error: "Coach access required" },
      { status: 403 }
    );
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const { submissionId } = await params;

  try {
    const body = await request.json();
    const { content, visibility } = body;

    // 2. Validate request body
    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    if (!visibility || !["internal", "shared"].includes(visibility)) {
      return NextResponse.json(
        { error: "Visibility must be 'internal' or 'shared'" },
        { status: 400 }
      );
    }

    // 3. Verify submission exists and get student ID
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
      columns: { id: true, userId: true },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    // 4. Create the note
    const [note] = await db
      .insert(coachNotes)
      .values({
        coachId: currentUser.id,
        studentId: submission.userId,
        submissionId,
        visibility,
        content: content.trim(),
      })
      .returning();

    // Return note with coach info
    return NextResponse.json(
      {
        ...note,
        coach: {
          id: currentUser.id,
          name: currentUser.name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create note error:", error);
    return NextResponse.json(
      { error: "Failed to create note" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/submissions/[submissionId]/notes
 * List all notes for a submission
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  // 1. Verify user has coach role minimum
  const isCoach = await hasMinimumRole("coach");
  if (!isCoach) {
    return NextResponse.json(
      { error: "Coach access required" },
      { status: 403 }
    );
  }

  const { submissionId } = await params;

  try {
    // 2. Get all notes for this submission
    const notes = await db.query.coachNotes.findMany({
      where: eq(coachNotes.submissionId, submissionId),
      with: {
        coach: {
          columns: { id: true, name: true },
        },
      },
      orderBy: (notes, { desc }) => [desc(notes.createdAt)],
    });

    return NextResponse.json(notes);
  } catch (error) {
    console.error("Get notes error:", error);
    return NextResponse.json(
      { error: "Failed to get notes" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/submissions/[submissionId]/notes?noteId=xxx
 * Delete a note (only own notes)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  // 1. Verify user has coach role minimum
  const isCoach = await hasMinimumRole("coach");
  if (!isCoach) {
    return NextResponse.json(
      { error: "Coach access required" },
      { status: 403 }
    );
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const { submissionId } = await params;
  const noteId = request.nextUrl.searchParams.get("noteId");

  if (!noteId) {
    return NextResponse.json(
      { error: "noteId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    // 2. Find the note and verify ownership
    const note = await db.query.coachNotes.findFirst({
      where: and(
        eq(coachNotes.id, noteId),
        eq(coachNotes.submissionId, submissionId)
      ),
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // 3. Only allow deleting own notes
    if (note.coachId !== currentUser.id) {
      return NextResponse.json(
        { error: "Cannot delete another coach's note" },
        { status: 403 }
      );
    }

    // 4. Delete the note
    await db.delete(coachNotes).where(eq(coachNotes.id, noteId));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Delete note error:", error);
    return NextResponse.json(
      { error: "Failed to delete note" },
      { status: 500 }
    );
  }
}
