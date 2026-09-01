import { after, NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db, getNeonSql } from "@/db";
import { announcements, tags, users } from "@/db/schema";
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
      audienceMode: announcements.audienceMode,
      audienceTagIds: announcements.audienceTagIds,
      audienceRoles: announcements.audienceRoles,
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

  const {
    title,
    body,
    linkUrl,
    linkLabel,
    audienceMode,
    audienceTagIds: rawAudienceTagIds,
    audienceRoles: rawAudienceRoles,
  } = parsed.data;
  const audienceTagIds =
    audienceMode === "targeted"
      ? Array.from(new Set(rawAudienceTagIds))
      : [];
  const audienceRoles =
    audienceMode === "targeted"
      ? Array.from(new Set(rawAudienceRoles))
      : [];

  if (audienceTagIds.length > 0) {
    const validTags = await db
      .select({ id: tags.id })
      .from(tags)
      .where(inArray(tags.id, audienceTagIds));
    if (validTags.length !== audienceTagIds.length) {
      return NextResponse.json(
        { error: "One or more audience tags no longer exist" },
        { status: 400 },
      );
    }
  }

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
          title,
          body,
          link_url,
          link_label,
          audience_mode,
          audience_tag_ids,
          audience_roles,
          is_active,
          created_by
        ) VALUES (
          ${title},
          ${body},
          ${linkUrl ?? null},
          ${linkLabel ?? null},
          ${audienceMode},
          ${JSON.stringify(audienceTagIds)}::jsonb,
          ${JSON.stringify(audienceRoles)}::jsonb,
          true,
          ${admin.id}
        )
        RETURNING
          id,
          title,
          body,
          link_url,
          link_label,
          audience_mode,
          audience_tag_ids,
          audience_roles,
          published_at
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
          AND (
            i.audience_mode = 'all'
            OR (
              (
                jsonb_array_length(i.audience_roles) = 0
                OR i.audience_roles ? u.role::text
              )
              AND (
                jsonb_array_length(i.audience_tag_ids) = 0
                OR EXISTS (
                  SELECT 1
                  FROM student_tags st
                  WHERE st.user_id = u.id
                    AND i.audience_tag_ids ? st.tag_id::text
                )
              )
            )
          )
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
        i.audience_mode AS "audienceMode",
        i.audience_tag_ids AS "audienceTagIds",
        i.audience_roles AS "audienceRoles",
        i.published_at AS "publishedAt",
        (SELECT count(*)::int FROM notified) AS "notificationCount",
        COALESCE(
          (SELECT json_agg(notified.user_id) FROM notified),
          '[]'::json
        ) AS "recipientIds"
      FROM inserted i
    `;

    const announcement = (rows as unknown as Array<{
      id: string;
      title: string;
      body: string;
      linkUrl: string | null;
      linkLabel: string | null;
      audienceMode: "all" | "targeted";
      audienceTagIds: string[];
      audienceRoles: string[];
      publishedAt: string;
      notificationCount: number;
      recipientIds: string[];
    }>)[0];
    if (!announcement) throw new Error("Announcement insert returned no row");

    const { recipientIds, ...publicAnnouncement } = announcement;

    after(async () => {
      try {
        await sendAnnouncementPush(
          publicAnnouncement,
          publicAnnouncement.audienceMode === "all" ? undefined : recipientIds,
        );
      } catch (error) {
        console.error(
          "[announcements] Push delivery job failed:",
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    });

    return NextResponse.json(
      { announcement: publicAnnouncement },
      { status: 201 },
    );
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
