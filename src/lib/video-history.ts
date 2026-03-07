// Video Watch History — Server-Side Data Fetching
//
// Direct DB query (NOT self-fetch API route) to avoid the known 401 bug
// where server components that fetch their own API routes don't forward auth cookies.
//
// Consumed by: src/app/(dashboard)/dashboard/listening/history/page.tsx

import { db } from "@/db";
import { videoSessions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export interface WatchHistoryEntry {
  id: string;
  youtubeVideoId: string;
  title: string | null;
  completionPercent: number;
  lastPositionMs: number;
  totalWatchedMs: number;
  updatedAt: Date;
}

export async function getWatchHistory(
  userId: string
): Promise<WatchHistoryEntry[]> {
  return db
    .select({
      id: videoSessions.id,
      youtubeVideoId: videoSessions.youtubeVideoId,
      title: videoSessions.title,
      completionPercent: videoSessions.completionPercent,
      lastPositionMs: videoSessions.lastPositionMs,
      totalWatchedMs: videoSessions.totalWatchedMs,
      updatedAt: videoSessions.updatedAt,
    })
    .from(videoSessions)
    .where(eq(videoSessions.userId, userId))
    .orderBy(desc(videoSessions.updatedAt));
}
