import { NextRequest, NextResponse } from "next/server";
import { getRealUser } from "@/lib/auth";
import { db } from "@/db";
import { videoUploads, lessons } from "@/db/schema";
import { eq, inArray, and, isNull } from "drizzle-orm";
import { isStaffRole } from "@/lib/platform-roles";
import { z } from "zod";

const assignUploadsSchema = z
  .object({
    assignments: z
      .array(
        z
          .object({
            uploadId: z.string().uuid(),
            lessonId: z.string().uuid(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

/**
 * POST /api/admin/uploads/assign
 * Batch assign uploaded videos to lessons.
 * Updates both the upload record and the lesson record.
 *
 * Body: { assignments: [{ uploadId, lessonId }] }
 */
export async function POST(request: NextRequest) {
  const currentUser = await getRealUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isStaffRole(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const parsed = assignUploadsSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid assignments", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { assignments } = parsed.data;

    // Get upload IDs and lesson IDs
    const uploadIds = assignments.map((a) => a.uploadId);
    const lessonIds = assignments.map((a) => a.lessonId);
    if (
      new Set(uploadIds).size !== uploadIds.length ||
      new Set(lessonIds).size !== lessonIds.length
    ) {
      return NextResponse.json(
        { error: "Each upload and lesson may appear only once" },
        { status: 400 },
      );
    }

    // Verify uploads exist and are ready
    const uploads = await db
      .select({ id: videoUploads.id, muxPlaybackId: videoUploads.muxPlaybackId })
      .from(videoUploads)
      .where(
        and(
          inArray(videoUploads.id, uploadIds),
          eq(videoUploads.status, "ready"),
          currentUser.role === "admin"
            ? undefined
            : eq(videoUploads.uploadedBy, currentUser.clerkId),
        ),
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
