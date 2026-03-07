import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { and, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users, roles, roleFeatures, processedWebhooks } from "@/db/schema";
import { featureKeySchema } from "@/lib/permissions";
import { assignRole, removeRole } from "@/lib/user-roles";
import { resolveRoleFromEmail } from "@/lib/access-control";
import { ensureDefaultStudentRoleAssignment } from "@/lib/student-role";

const discordWebhookSchema = z
  .object({
    email: z.string().email(),
    name: z.string().optional(),
    featureKey: featureKeySchema.optional(),
    roleId: z.string().uuid().optional(),
    roleName: z.string().optional(),
    action: z.enum(["assign", "remove"]).default("assign"),
    roleExpiresAt: z.string().datetime().optional(),
    idempotencyKey: z.string().optional(),
  })
  .refine(
    (d) => d.featureKey || d.roleId || d.roleName,
    { message: "At least one of featureKey, roleId, or roleName is required" }
  );

async function resolveRoleId(input: z.infer<typeof discordWebhookSchema>) {
  if (input.roleId) {
    const role = await db.query.roles.findFirst({
      where: and(eq(roles.id, input.roleId), isNull(roles.deletedAt)),
      columns: { id: true },
    });
    return role?.id ?? null;
  }

  if (input.roleName) {
    const role = await db.query.roles.findFirst({
      where: and(ilike(roles.name, input.roleName), isNull(roles.deletedAt)),
      columns: { id: true },
    });
    return role?.id ?? null;
  }

  if (input.featureKey) {
    const matchingRoles = await db
      .select({
        id: roles.id,
        name: roles.name,
      })
      .from(roles)
      .innerJoin(roleFeatures, eq(roleFeatures.roleId, roles.id))
      .where(
        and(
          eq(roleFeatures.featureKey, input.featureKey),
          isNull(roles.deletedAt)
        )
      );

    if (matchingRoles.length === 1) return matchingRoles[0].id;
    if (matchingRoles.length === 0) return null;

    throw new Error(
      `Multiple roles grant feature "${input.featureKey}". Provide roleId or roleName explicitly.`
    );
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-webhook-secret");
    const expectedSecret =
      process.env.DISCORD_WEBHOOK_SECRET ||
      process.env.ENROLLMENT_WEBHOOK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json();
    const parsed = discordWebhookSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const idempotencyKey =
      data.idempotencyKey ||
      `discord:${data.action}:${data.email}:${data.roleId || data.roleName || data.featureKey || ""}`;

    const existing = await db.query.processedWebhooks.findFirst({
      where: eq(processedWebhooks.idempotencyKey, idempotencyKey),
    });
    if (existing) {
      return NextResponse.json(
        {
          success: true,
          message: "Already processed",
          ...(existing.resultData as Record<string, unknown> | null),
        },
        { status: 200 }
      );
    }

    const resolvedRoleId = await resolveRoleId(data);
    if (!resolvedRoleId) {
      return NextResponse.json(
        {
          error: "Role not found for provided identifier",
          roleId: data.roleId,
          roleName: data.roleName,
          featureKey: data.featureKey,
        },
        { status: 404 }
      );
    }

    const clerk = await clerkClient();
    let clerkUser;
    const existingUsers = await clerk.users.getUserList({
      emailAddress: [data.email],
    });
    if (existingUsers.data.length > 0) {
      clerkUser = existingUsers.data[0];
    } else {
      clerkUser = await clerk.users.createUser({
        emailAddress: [data.email],
        firstName: data.name?.split(" ")[0],
        lastName: data.name?.split(" ").slice(1).join(" "),
        skipPasswordRequirement: true,
      });
    }

    let dbUser = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkUser.id),
      columns: { id: true, role: true },
    });
    if (!dbUser) {
      const role = resolveRoleFromEmail(data.email);
      const [created] = await db
        .insert(users)
        .values({
          clerkId: clerkUser.id,
          email: data.email,
          name: data.name || null,
          role,
        })
        .returning({ id: users.id, role: users.role });
      dbUser = created;
      if (role === "student") {
        await ensureDefaultStudentRoleAssignment(dbUser.id);
      }
    } else {
      const role = resolveRoleFromEmail(data.email);
      if (dbUser.role !== role) {
        await db
          .update(users)
          .set({ role })
          .where(eq(users.id, dbUser.id));
      }
      if (role === "student") {
        await ensureDefaultStudentRoleAssignment(dbUser.id);
      }
    }

    let result: Record<string, unknown>;
    if (data.action === "assign") {
      const expiresAt = data.roleExpiresAt ? new Date(data.roleExpiresAt) : undefined;
      const roleResult = await assignRole(dbUser.id, resolvedRoleId, null, expiresAt);
      result = {
        action: "assigned",
        roleAssignment: roleResult,
        userId: dbUser.id,
        roleId: resolvedRoleId,
      };
    } else {
      const removed = await removeRole(dbUser.id, resolvedRoleId);
      result = {
        action: "removed",
        removed,
        userId: dbUser.id,
        roleId: resolvedRoleId,
      };
    }

    await db
      .insert(processedWebhooks)
      .values({
        idempotencyKey,
        source: "discord",
        eventType: data.action === "assign" ? "role_assignment" : "role_removal",
        payload: data,
        result: "success",
        resultData: result,
      })
      .onConflictDoNothing();

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Discord webhook error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
