import { and, asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  videoaskFormImports,
  videoaskImportProjects,
  videoaskInventoryForms,
  videoaskInventoryScans,
  videoaskMediaImports,
} from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import { getVideoAskConnection } from "@/lib/videoask/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const connection = await getVideoAskConnection();
    if (!connection) {
      return NextResponse.json({
        project: null,
        inventory: null,
        imports: [],
        media: {},
      });
    }

    const [latestScan] = await db
      .select()
      .from(videoaskInventoryScans)
      .where(
        and(
          eq(videoaskInventoryScans.organizationId, connection.organizationId),
          eq(videoaskInventoryScans.status, "completed"),
        ),
      )
      .orderBy(desc(videoaskInventoryScans.completedAt))
      .limit(1);
    const inventoryForms = latestScan
      ? await db
          .select({
            id: videoaskInventoryForms.sourceFormId,
            title: videoaskInventoryForms.title,
            folderId: videoaskInventoryForms.folderId,
            folderName: videoaskInventoryForms.folderName,
            shareUrl: videoaskInventoryForms.shareUrl,
            createdAt: videoaskInventoryForms.sourceCreatedAt,
            updatedAt: videoaskInventoryForms.sourceUpdatedAt,
          })
          .from(videoaskInventoryForms)
          .where(eq(videoaskInventoryForms.lastScanId, latestScan.id))
          .orderBy(asc(videoaskInventoryForms.title))
      : [];

    const [project] = await db
      .select()
      .from(videoaskImportProjects)
      .where(eq(videoaskImportProjects.organizationId, connection.organizationId))
      .limit(1);

    const imports = project
      ? await db
          .select({
            id: videoaskFormImports.id,
            sourceFormId: videoaskFormImports.sourceFormId,
            sourceFormTitle: videoaskFormImports.sourceFormTitle,
            status: videoaskFormImports.status,
            threadId: videoaskFormImports.threadId,
            lessonId: videoaskFormImports.lessonId,
            stats: videoaskFormImports.stats,
            lastError: videoaskFormImports.lastError,
            completedAt: videoaskFormImports.completedAt,
            updatedAt: videoaskFormImports.updatedAt,
          })
          .from(videoaskFormImports)
          .where(eq(videoaskFormImports.projectId, project.id))
          .orderBy(asc(videoaskFormImports.sourceFormTitle))
      : [];

    const mediaRows = await db
      .select({ status: videoaskMediaImports.status })
      .from(videoaskMediaImports)
      .where(eq(videoaskMediaImports.organizationId, connection.organizationId));
    const media = mediaRows.reduce<Record<string, number>>((counts, row) => {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
      return counts;
    }, {});

    return NextResponse.json({
      project: project
        ? {
            id: project.id,
            courseId: project.courseId,
            courseUrl: `/admin/course-library/${project.courseId}`,
          }
        : null,
      inventory: latestScan
        ? {
            scanId: latestScan.id,
            formCount: latestScan.formCount,
            completedAt: latestScan.completedAt?.toISOString() ?? null,
            forms: inventoryForms.map((form) => ({
              ...form,
              createdAt: form.createdAt?.toISOString() ?? null,
              updatedAt: form.updatedAt?.toISOString() ?? null,
            })),
          }
        : null,
      imports: imports.map((item) => ({
        ...item,
        completedAt: item.completedAt?.toISOString() ?? null,
        updatedAt: item.updatedAt.toISOString(),
      })),
      media,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load import status";
    console.error("[videoask/imports] Failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
