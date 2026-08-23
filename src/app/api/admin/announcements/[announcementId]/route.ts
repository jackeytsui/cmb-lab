import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { announcements } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ announcementId: string }> },
) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { announcementId } = await context.params;
  const [archived] = await db
    .update(announcements)
    .set({ isActive: false, archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(announcements.id, announcementId),
        eq(announcements.isActive, true),
      ),
    )
    .returning({ id: announcements.id });

  if (!archived) {
    return NextResponse.json(
      { error: "Active announcement not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ archived: true });
}
