import { after, NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, getNeonSql } from "@/db";
import { announcements, users } from "@/db/schema";
import { getRealUser, hasMinimumRole } from "@/lib/auth";
import { announcementInputSchema } from "@/lib/announcement-validation";
import { sendAnnouncementPush } from "@/lib/web-push";

export async function GET() {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      linkUrl: announcements.linkUrl,
      linkLabel: announcements.linkLabel,
      isActive: announcements.isActive,
      publishedAt: announcements.publishedAt,
      archivedAt: announcements.archivedAt,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(announcements)
    .innerJoin(users, eq(users.id, announcements.createdBy))
    .orderBy(desc(announcements.publishedAt))
    .limit(50);

  return NextResponse.json({ announcements: rows });
}

export async function POST(request: NextRequest) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = await getRealUser();
  if (!admin || admin.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = announcementInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message || "Invalid announcement",
      },
      { status: 400 },
    );
  }

  const { title, body, linkUrl, linkLabel } = parsed.data;
  const notificationLink = linkUrl || "/dashboard";
  const sql = getNeonSql();

  try {
    const rows = await sql`
      WITH archived AS (
        UPDATE announcements
        SET is_active = false, archived_at = now(), updated_at = now()
        WHERE is_active = true
        RETURNING id
      ), inserted AS (
        INSERT INTO announcements (
          title, body, link_url, link_label, is_active, created_by
        ) VALUES (
          ${title}, ${body}, ${linkUrl ?? null}, ${linkLabel ?? null}, true, ${admin.id}
        )
        RETURNING id, title, body, link_url, link_label, published_at
      ), notified AS (
        INSERT INTO notifications (
          user_id, type, category, title, body, link_url, metadata
        )
        SELECT
          u.id,
          'system'::notification_type,
          'system'::notification_category,
          i.title,
          i.body,
          ${notificationLink},
          json_build_object('announcementId', i.id)::text
        FROM users u
        CROSS JOIN inserted i
        WHERE u.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM notification_preferences np
            WHERE np.user_id = u.id
              AND np.category = 'system'::notification_category
              AND np.muted = true
          )
        RETURNING user_id
      )
      SELECT
        i.id,
        i.title,
        i.body,
        i.link_url AS "linkUrl",
        i.link_label AS "linkLabel",
        i.published_at AS "publishedAt",
        (SELECT count(*)::int FROM notified) AS "notificationCount"
      FROM inserted i
    `;

    const announcement = (rows as unknown as Array<{
      id: string;
      title: string;
      body: string;
      linkUrl: string | null;
      linkLabel: string | null;
      publishedAt: string;
      notificationCount: number;
    }>)[0];
    if (!announcement) throw new Error("Announcement insert returned no row");

    after(async () => {
      try {
        await sendAnnouncementPush(announcement);
      } catch (error) {
        console.error(
          "[announcements] Push delivery job failed:",
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    });

    return NextResponse.json({ announcement }, { status: 201 });
  } catch (error) {
    console.error(
      "[announcements] Publish failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "Could not publish the announcement" },
      { status: 500 },
    );
  }
}
