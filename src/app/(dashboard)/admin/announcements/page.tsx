import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { announcements, users } from "@/db/schema";
import {
  AnnouncementManager,
  type AdminAnnouncement,
} from "@/components/admin/AnnouncementManager";
import { hasMinimumRole } from "@/lib/auth";

export default async function AdminAnnouncementsPage() {
  if (!(await hasMinimumRole("admin"))) redirect("/admin/manage");

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

  const initialAnnouncements: AdminAnnouncement[] = rows.map((row) => ({
    ...row,
    publishedAt: row.publishedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() || null,
  }));

  return <AnnouncementManager initialAnnouncements={initialAnnouncements} />;
}
