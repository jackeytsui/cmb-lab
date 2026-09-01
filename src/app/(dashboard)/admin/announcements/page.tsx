import { redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { announcements, tags, users } from "@/db/schema";
import {
  AnnouncementManager,
  type AdminAnnouncement,
} from "@/components/admin/AnnouncementManager";
import { hasMinimumRole } from "@/lib/auth";
import { PLATFORM_ROLE_OPTIONS } from "@/lib/platform-roles";

export default async function AdminAnnouncementsPage() {
  if (!(await hasMinimumRole("admin"))) redirect("/admin/manage");

  const [rows, audienceTags] = await Promise.all([
    db
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
      .limit(50),
    db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        type: tags.type,
      })
      .from(tags)
      .orderBy(asc(tags.name)),
  ]);

  const initialAnnouncements: AdminAnnouncement[] = rows.map((row) => ({
    ...row,
    publishedAt: row.publishedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() || null,
  }));

  return (
    <AnnouncementManager
      initialAnnouncements={initialAnnouncements}
      audienceTags={audienceTags}
      audienceRoles={PLATFORM_ROLE_OPTIONS}
    />
  );
}
