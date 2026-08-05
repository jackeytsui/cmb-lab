import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  videoaskInventoryForms,
  videoaskInventoryScans,
} from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import {
  getVideoAskConnection,
  listAllVideoAskForms,
} from "@/lib/videoask/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function optionalDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET() {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let scanId: string | null = null;
  try {
    const connection = await getVideoAskConnection();
    if (!connection) {
      return NextResponse.json(
        { error: "VideoAsk is not connected" },
        { status: 409 },
      );
    }

    const [scan] = await db
      .insert(videoaskInventoryScans)
      .values({ organizationId: connection.organizationId })
      .returning({ id: videoaskInventoryScans.id });
    scanId = scan.id;

    const forms = await listAllVideoAskForms();
    const scannedAt = new Date();
    if (forms.length > 0) {
      await db
        .insert(videoaskInventoryForms)
        .values(
          forms.map((form) => ({
            organizationId: connection.organizationId,
            sourceFormId: form.id,
            title: form.title,
            folderId: form.folderId,
            folderName: form.folderName,
            shareUrl: form.shareUrl,
            sourceCreatedAt: optionalDate(form.createdAt),
            sourceUpdatedAt: optionalDate(form.updatedAt),
            lastScanId: scan.id,
            lastSeenAt: scannedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [
            videoaskInventoryForms.organizationId,
            videoaskInventoryForms.sourceFormId,
          ],
          set: {
            title: sql`excluded.title`,
            folderId: sql`excluded.folder_id`,
            folderName: sql`excluded.folder_name`,
            shareUrl: sql`excluded.share_url`,
            sourceCreatedAt: sql`excluded.source_created_at`,
            sourceUpdatedAt: sql`excluded.source_updated_at`,
            lastScanId: sql`excluded.last_scan_id`,
            lastSeenAt: scannedAt,
            updatedAt: scannedAt,
          },
        });
    }

    await db
      .update(videoaskInventoryScans)
      .set({
        status: "completed",
        formCount: forms.length,
        completedAt: scannedAt,
        lastError: null,
      })
      .where(eq(videoaskInventoryScans.id, scan.id));

    return NextResponse.json({
      count: forms.length,
      forms,
      scan: { id: scan.id, completedAt: scannedAt.toISOString() },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not scan VideoAsk";
    if (scanId) {
      await db
        .update(videoaskInventoryScans)
        .set({
          status: "failed",
          lastError: message.slice(0, 2_000),
          completedAt: new Date(),
        })
        .where(eq(videoaskInventoryScans.id, scanId));
    }
    console.error("[videoask/forms] Scan failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
