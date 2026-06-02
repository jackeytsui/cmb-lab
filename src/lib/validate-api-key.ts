import "server-only";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { adminApiKeys } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { hashApiKey } from "./api-key";

export async function validateBearerApiKey(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) return null;

  const keyHash = hashApiKey(rawKey);

  const key = await db.query.adminApiKeys.findFirst({
    where: and(eq(adminApiKeys.keyHash, keyHash), isNull(adminApiKeys.revokedAt)),
  });

  if (!key) return null;

  // Fire-and-forget lastUsedAt stamp
  db.update(adminApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(adminApiKeys.id, key.id))
    .catch(() => {});

  return key;
}
