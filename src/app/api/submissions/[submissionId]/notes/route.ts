import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { submissions, coachNotes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { canStaffAccessStudent } from "@/lib/coach-student-scope";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";

const noteSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  visibility: z.enum(["internal", "shared"]),
}).strict();

async function canAccessSubmission(
  submissionId: string,
  actor: { id: string; role: Parameters<typeof canStaffAccessStudent>[0]["actorRole"] },
) {
  const submission = await db.query.submissions.findFirst({
    where: eq(submissions.id, submissionId),
    columns: { id: true, userId: true },
    with: { user: { columns: { assignedCoachId: true } } },
  });
  if (
    !submission ||
    !canStaffAccessStudent({
      actorUserId: actor.id,
      actorRole: actor.role,
      assignedCoachId: submission.user.assignedCoachId,
    })
  ) {
    return null;
  }
  return submission;
}

/**
 * POST /api/submissions/[submissionId]/notes
 * Add a note to a submission
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json(
      { error: "Coach access required" },
      { status: 403 }
    );
  }
  const currentUser = access.realActor;

  const { submissionId } = await params;
  if (!z.string().uuid().safeParse(submissionId).success) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  try {
    const parsed = noteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid note" },
        { status: 400 }
      );
    }
    const { content, visibility } = parsed.data;

    // 3. Verify the submission belongs to an assigned student.
    const submission = await canAccessSubmission(submissionId, access.actor);

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
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json(
      { error: "Coach access required" },
      { status: 403 }
    );
  }

  const { submissionId } = await params;
  if (!z.string().uuid().safeParse(submissionId).success) {
    return NextResponse.json([]);
  }

  try {
    if (!(await canAccessSubmission(submissionId, access.actor))) {
      return NextResponse.json([], { status: 404 });
    }

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
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json(
      { error: "Coach access required" },
      { status: 403 }
    );
  }
  const currentUser = access.realActor;

  const { submissionId } = await params;
  const noteId = request.nextUrl.searchParams.get("noteId");
  const submissionIdResult = z.string().uuid().safeParse(submissionId);
  const noteIdResult = z.string().uuid().safeParse(noteId);

  if (!submissionIdResult.success || !noteIdResult.success) {
    return NextResponse.json(
      { error: "noteId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    if (!(await canAccessSubmission(submissionIdResult.data, access.actor))) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // 2. Find the note and verify ownership
    const note = await db.query.coachNotes.findFirst({
      where: and(
        eq(coachNotes.id, noteIdResult.data),
        eq(coachNotes.submissionId, submissionIdResult.data)
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
    await db.delete(coachNotes).where(eq(coachNotes.id, noteIdResult.data));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Delete note error:", error);
    return NextResponse.json(
      { error: "Failed to delete note" },
      { status: 500 }
    );
  }
}
