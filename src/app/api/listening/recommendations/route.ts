import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { listeningRecommendations, users } from "@/db/schema";
import { extractVideoId, youtubeUrlSchema } from "@/lib/youtube";
import { hasMinimumRole } from "@/lib/auth";
import { extractChineseCaptions } from "@/lib/captions";

const createSchema = z.object({
  youtubeUrl: youtubeUrlSchema,
});

async function getCurrentDbUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  return user ?? null;
}

async function fetchYouTubeMeta(youtubeUrl: string) {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`;
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to fetch YouTube metadata");
  const payload = await response.json();
  return {
    title: (payload?.title as string) || "Untitled",
    authorName: (payload?.author_name as string) || "Unknown channel",
    thumbnailUrl: (payload?.thumbnail_url as string) || "",
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const canManage = await hasMinimumRole("coach");

  const rows = await db
    .select({
      id: listeningRecommendations.id,
      youtubeUrl: listeningRecommendations.youtubeUrl,
      youtubeVideoId: listeningRecommendations.youtubeVideoId,
      videoTitle: listeningRecommendations.videoTitle,
      channelName: listeningRecommendations.channelName,
      thumbnailUrl: listeningRecommendations.thumbnailUrl,
      pinned: listeningRecommendations.pinned,
      sortOrder: listeningRecommendations.sortOrder,
      createdAt: listeningRecommendations.createdAt,
    })
    .from(listeningRecommendations)
    .orderBy(
      desc(listeningRecommendations.pinned),
      listeningRecommendations.sortOrder,
      desc(listeningRecommendations.createdAt),
    );

  return NextResponse.json({ recommendations: rows, canManage });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canManage = await hasMinimumRole("coach");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
  }

  const youtubeUrl = parsed.data.youtubeUrl.trim();
  const youtubeVideoId = extractVideoId(youtubeUrl);
  if (!youtubeVideoId) {
    return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
  }

  const existing = await db.query.listeningRecommendations.findFirst({
    where: eq(listeningRecommendations.youtubeVideoId, youtubeVideoId),
  });
  if (existing) {
    return NextResponse.json({ error: "Video already recommended" }, { status: 409 });
  }

  const [currentUser, meta] = await Promise.all([
    getCurrentDbUser(),
    fetchYouTubeMeta(youtubeUrl),
  ]);

  const extracted = await extractChineseCaptions(youtubeVideoId);
  if (!extracted || extracted.captions.length === 0) {
    return NextResponse.json(
      {
        error:
          "This video is not currently transcript-ready from server-side. Please choose another video or add subtitles manually first.",
      },
      { status: 400 },
    );
  }

  if (!meta.thumbnailUrl) {
    return NextResponse.json({ error: "Could not fetch video metadata" }, { status: 400 });
  }

  const [{ maxSortOrder }] = await db
    .select({
      maxSortOrder:
        sql<number>`coalesce(max(${listeningRecommendations.sortOrder}), 0)`.mapWith(Number),
    })
    .from(listeningRecommendations);

  const [created] = await db
    .insert(listeningRecommendations)
    .values({
      youtubeUrl,
      youtubeVideoId,
      videoTitle: meta.title,
      channelName: meta.authorName,
      thumbnailUrl: meta.thumbnailUrl,
      pinned: false,
      sortOrder: (maxSortOrder ?? 0) + 1,
      createdBy: currentUser?.id ?? null,
    })
    .returning({
      id: listeningRecommendations.id,
      youtubeUrl: listeningRecommendations.youtubeUrl,
      youtubeVideoId: listeningRecommendations.youtubeVideoId,
      videoTitle: listeningRecommendations.videoTitle,
      channelName: listeningRecommendations.channelName,
      thumbnailUrl: listeningRecommendations.thumbnailUrl,
      pinned: listeningRecommendations.pinned,
      sortOrder: listeningRecommendations.sortOrder,
      createdAt: listeningRecommendations.createdAt,
    });

  return NextResponse.json({ recommendation: created }, { status: 201 });
}

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canManage = await hasMinimumRole("coach");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const parsed = deleteSchema.safeParse({ id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const deleted = await db
    .delete(listeningRecommendations)
    .where(eq(listeningRecommendations.id, parsed.data.id))
    .returning({ id: listeningRecommendations.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("pin"),
    id: z.string().uuid(),
    pinned: z.boolean(),
  }),
  z.object({
    action: z.literal("reorder"),
    ids: z.array(z.string().uuid()).min(1),
  }),
]);

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canManage = await hasMinimumRole("coach");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.action === "pin") {
    const [updated] = await db
      .update(listeningRecommendations)
      .set({ pinned: parsed.data.pinned })
      .where(eq(listeningRecommendations.id, parsed.data.id))
      .returning({ id: listeningRecommendations.id });

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  for (let i = 0; i < parsed.data.ids.length; i++) {
    await db
      .update(listeningRecommendations)
      .set({ sortOrder: i + 1 })
      .where(eq(listeningRecommendations.id, parsed.data.ids[i]));
  }

  return NextResponse.json({ ok: true });
}
