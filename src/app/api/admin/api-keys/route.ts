import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminApiKeys } from "@/db/schema";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";
import { apiKeyPrefix, generateApiKeySecret, hashApiKey, maskApiKeyPrefix } from "@/lib/api-key";

const createSchema = z.object({
  name: z.string().min(2).max(80),
  scopes: z.array(z.string().min(1).max(64)).max(20).default([]),
});

export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const keys = await db
    .select({
      id: adminApiKeys.id,
      name: adminApiKeys.name,
      keyPrefix: adminApiKeys.keyPrefix,
      scopes: adminApiKeys.scopes,
      createdAt: adminApiKeys.createdAt,
      lastUsedAt: adminApiKeys.lastUsedAt,
      revokedAt: adminApiKeys.revokedAt,
    })
    .from(adminApiKeys)
    .orderBy(desc(adminApiKeys.createdAt));

  return NextResponse.json({
    keys: keys.map((key) => ({
      ...key,
      keyPrefixMasked: maskApiKeyPrefix(key.keyPrefix),
    })),
  });
}

export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const normalizedName = parsed.data.name.trim();

  const existing = await db.query.adminApiKeys.findFirst({
    where: and(eq(adminApiKeys.name, normalizedName), isNull(adminApiKeys.revokedAt)),
    columns: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An active key with this name already exists" },
      { status: 409 }
    );
  }

  const rawKey = generateApiKeySecret();
  const keyPrefix = apiKeyPrefix(rawKey);
  const keyHash = hashApiKey(rawKey);

  const [created] = await db
    .insert(adminApiKeys)
    .values({
      name: normalizedName,
      keyPrefix,
      keyHash,
      scopes: parsed.data.scopes,
      createdBy: currentUser.id,
    })
    .returning({
      id: adminApiKeys.id,
      name: adminApiKeys.name,
      keyPrefix: adminApiKeys.keyPrefix,
      scopes: adminApiKeys.scopes,
      createdAt: adminApiKeys.createdAt,
      lastUsedAt: adminApiKeys.lastUsedAt,
      revokedAt: adminApiKeys.revokedAt,
    });

  return NextResponse.json(
    {
      key: {
        ...created,
        keyPrefixMasked: maskApiKeyPrefix(created.keyPrefix),
      },
      rawKey,
      message: "Copy this key now. It will not be shown again.",
    },
    { status: 201 }
  );
}
