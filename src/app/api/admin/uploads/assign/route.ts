import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { videoUploads, lessons } from "@/db/schema";
import { eq, inArray, and, isNull } from "drizzle-orm";

interface AssignmentPair {
  uploadId: string;
  lessonId: string;
}

/**
 * POST /api/admin/uploads/assign
 * Batch assign uploaded videos to lessons.
 * Updates both the upload record and the lesson record.
 *
 * Body: { assignments: [{ uploadId, lessonId }] }
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const assignments: AssignmentPair[] = body.assignments;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json(
        { error: "assignments array is required" },
        { status: 400 }
      );
    }

    // Validate all assignments have required fields
    for (const { uploadId, lessonId } of assignments) {
      if (!uploadId || !lessonId) {
        return NextResponse.json(
          { error: "Each assignment must have uploadId and lessonId" },
          { status: 400 }
        );
      }
    }

    // Get upload IDs and lesson IDs
    const uploadIds = assignments.map((a) => a.uploadId);
    const lessonIds = assignments.map((a) => a.lessonId);

    // Verify uploads exist and are ready
    const uploads = await db
      .select({ id: videoUploads.id, muxPlaybackId: videoUploads.muxPlaybackId })
      .from(videoUploads)
      .where(
        and(
          inArray(videoUploads.id, uploadIds),
          eq(videoUploads.status, "ready")
        )
      );

    if (uploads.length !== uploadIds.length) {
      return NextResponse.json(
        { error: "One or more uploads not found or not ready" },
        { status: 404 }
      );
    }

    // Verify lessons exist
    const existingLessons = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(
        and(inArray(lessons.id, lessonIds), isNull(lessons.deletedAt))
      );

    if (existingLessons.length !== new Set(lessonIds).size) {
      return NextResponse.json(
        { error: "One or more lessons not found" },
        { status: 404 }
      );
    }

    // Create a map of uploadId -> upload for easy lookup
    const uploadMap = new Map(uploads.map((u) => [u.id, u]));

    // Execute assignments in a transaction
    const results = await db.transaction(async (tx) => {
      const assignmentResults = [];

      for (const { uploadId, lessonId } of assignments) {
        const upload = uploadMap.get(uploadId);
        if (!upload) continue;

        // Update upload with lesson reference
        await tx
          .update(videoUploads)
          .set({ lessonId })
          .where(eq(videoUploads.id, uploadId));

        // Update lesson with Mux playback ID
        const [updatedLesson] = await tx
          .update(lessons)
          .set({
            muxPlaybackId: upload.muxPlaybackId,
            muxAssetId: upload.muxPlaybackId, // Same as playback for now
          })
          .where(eq(lessons.id, lessonId))
          .returning();

        assignmentResults.push({
          uploadId,
          lessonId,
          lessonTitle: updatedLesson.title,
        });
      }

      return assignmentResults;
    });

    return NextResponse.json({
      success: true,
      assigned: results.length,
      assignments: results,
    });
  } catch (error) {
    console.error("Error assigning videos:", error);
    return NextResponse.json(
      { error: "Failed to assign videos" },
      { status: 500 }
    );
  }
}
