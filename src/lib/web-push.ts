import "server-only";

import webPush from "web-push";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  notificationPreferences,
  pushSubscriptions,
  users,
} from "@/db/schema";

type AnnouncementPushPayload = {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
};

type CoachingReminderPushPayload = {
  id: string;
  title: string;
  body: string;
  linkUrl: string;
};

export function getWebPushPublicKey() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  return publicKey && privateKey ? publicKey : null;
}

function configureWebPush() {
  const publicKey = getWebPushPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;

  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:contact@thecmblueprint.com",
    publicKey,
    privateKey,
  );
  return true;
}

function getPushStatusCode(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return null;
  }
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" ? statusCode : null;
}

async function sendPush(
  announcement: AnnouncementPushPayload,
  options?: { userIds?: string[]; tagPrefix?: string },
) {
  if (!configureWebPush()) return { sent: 0, removed: 0 };
  if (options?.userIds && options.userIds.length === 0) {
    return { sent: 0, removed: 0 };
  }

  const subscriptions = await db
    .selectDistinct({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .innerJoin(users, eq(users.id, pushSubscriptions.userId))
    .leftJoin(
      notificationPreferences,
      and(
        eq(notificationPreferences.userId, users.id),
        eq(notificationPreferences.category, "system"),
      ),
    )
    .where(
      and(
        isNull(users.deletedAt),
        options?.userIds ? inArray(users.id, options.userIds) : undefined,
        or(
          isNull(notificationPreferences.muted),
          eq(notificationPreferences.muted, false),
        ),
      ),
    );

  const payload = JSON.stringify({
    title: announcement.title,
    body: announcement.body,
    url: announcement.linkUrl || "/dashboard",
    tag: `${options?.tagPrefix || "announcement"}:${announcement.id}`,
  });
  let sent = 0;
  let removed = 0;

  for (let index = 0; index < subscriptions.length; index += 25) {
    const batch = subscriptions.slice(index, index + 25);
    await Promise.allSettled(
      batch.map(async (subscription) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            payload,
          );
          sent += 1;
        } catch (error) {
          const statusCode = getPushStatusCode(error);
          if (statusCode === 404 || statusCode === 410) {
            await db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.id, subscription.id));
            removed += 1;
            return;
          }
          console.error(
            "[announcements] Browser push failed:",
            error instanceof Error ? error.message : "Unknown error",
          );
        }
      }),
    );
  }

  return { sent, removed };
}

export async function sendAnnouncementPush(
  announcement: AnnouncementPushPayload,
  userIds?: string[],
) {
  return sendPush(announcement, { userIds });
}

/** Send an opted-in browser alert only to the supplied ICGC students. */
export async function sendCoachingReminderPush(
  reminder: CoachingReminderPushPayload,
  userIds: string[],
) {
  return sendPush(reminder, { userIds, tagPrefix: "icgc-reminder" });
}
