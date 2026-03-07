import { NextRequest, NextResponse } from "next/server";
import { webhookLimiter, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, courseAccess, courses, roles, processedWebhooks } from "@/db/schema";
import { eq, and, ilike, isNull } from "drizzle-orm";
import { assignRole } from "@/lib/user-roles";
import { createNotification } from "@/lib/notifications";
import { z } from "zod";
import { resolveRoleFromEmail } from "@/lib/access-control";
import { ensureDefaultStudentRoleAssignment } from "@/lib/student-role";

const enrollmentSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  // Legacy course enrollment (WEBHOOK-05)
  courseId: z.string().uuid().optional(),
  accessTier: z.enum(["preview", "full"]).default("full"),
  expiresAt: z.string().optional(),
  // RBAC role assignment (WEBHOOK-01, WEBHOOK-02)
  roleId: z.string().uuid().optional(),
  roleName: z.string().optional(),
  roleExpiresAt: z.string().optional(), // WEBHOOK-03
  // Idempotency (WEBHOOK-04)
  idempotencyKey: z.string().optional(),
}).refine(
  (d) => d.courseId || d.roleId || d.roleName,
  { message: "At least one of courseId, roleId, or roleName is required" }
);

export async function POST(req: NextRequest) {
  // Rate limit by IP (before any processing)
  const ip = getClientIp(req);
  const rl = await webhookLimiter.limit(ip);
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  try {
    // Verify webhook secret
    const secret = req.headers.get("x-webhook-secret");
    if (secret !== process.env.ENROLLMENT_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Validate with Zod schema
    const result = enrollmentSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.flatten() },
        { status: 400 }
      );
    }
    const data = result.data;

    // Idempotency check (WEBHOOK-04)
    const idempotencyKey =
      data.idempotencyKey ||
      `enroll:${data.email}:${data.roleId || data.roleName || ""}:${data.courseId || ""}`;

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

    // Role resolution (WEBHOOK-01, WEBHOOK-02, WEBHOOK-06)
    let resolvedRoleId: string | undefined;

    if (data.roleId || data.roleName) {
      let foundRole;

      if (data.roleId) {
        // WEBHOOK-01: Lookup by roleId
        foundRole = await db.query.roles.findFirst({
          where: and(eq(roles.id, data.roleId), isNull(roles.deletedAt)),
        });
      } else if (data.roleName) {
        // WEBHOOK-02: Lookup by roleName (case-insensitive)
        foundRole = await db.query.roles.findFirst({
          where: and(ilike(roles.name, data.roleName), isNull(roles.deletedAt)),
        });
      }

      if (!foundRole) {
        // WEBHOOK-06: Unknown role -- notify all admin users
        const admins = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.role, "admin"));

        for (const admin of admins) {
          await createNotification({
            userId: admin.id,
            type: "system",
            category: "system",
            title: "Unknown role in webhook",
            body: `Enrollment webhook referenced unknown role: "${data.roleId || data.roleName}". Student ${data.email} was NOT assigned a role.`,
            linkUrl: "/admin/roles",
          });
        }

        return NextResponse.json(
          { error: "Role not found", identifier: data.roleId || data.roleName },
          { status: 404 }
        );
      }

      resolvedRoleId = foundRole.id;
    }

    // Find or create Clerk user
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

    // Sync to database
    let dbUser = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkUser.id),
    });

    if (!dbUser) {
      const role = resolveRoleFromEmail(data.email);
      const [newUser] = await db
        .insert(users)
        .values({
          clerkId: clerkUser.id,
          email: data.email,
          name: data.name || null,
          role,
        })
        .returning();
      dbUser = newUser;
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

    // Course access grant (WEBHOOK-05 -- backward compatible)
    if (data.courseId) {
      const course = await db.query.courses.findFirst({
        where: eq(courses.id, data.courseId),
      });

      if (!course) {
        return NextResponse.json(
          { error: "Course not found" },
          { status: 404 }
        );
      }

      const existingAccess = await db.query.courseAccess.findFirst({
        where: and(
          eq(courseAccess.userId, dbUser.id),
          eq(courseAccess.courseId, data.courseId)
        ),
      });

      if (existingAccess) {
        await db
          .update(courseAccess)
          .set({
            accessTier: data.accessTier,
            expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          })
          .where(eq(courseAccess.id, existingAccess.id));
      } else {
        await db.insert(courseAccess).values({
          userId: dbUser.id,
          courseId: data.courseId,
          accessTier: data.accessTier,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          grantedBy: "webhook",
        });
      }
    }

    // Role assignment (WEBHOOK-01, WEBHOOK-02, WEBHOOK-03)
    let roleResult: { action: "created" | "updated"; id: string } | undefined;
    if (resolvedRoleId) {
      const roleExpiration = data.roleExpiresAt
        ? new Date(data.roleExpiresAt)
        : undefined;
      roleResult = await assignRole(
        dbUser.id,
        resolvedRoleId,
        null,
        roleExpiration
      );
    }

    // Record processed webhook (WEBHOOK-04) -- AFTER all mutations
    await db
      .insert(processedWebhooks)
      .values({
        idempotencyKey,
        source: "enrollment",
        eventType: resolvedRoleId ? "role_assignment" : "course_access",
        payload: data,
        result: "success",
        resultData: {
          userId: dbUser.id,
          roleAssignment: roleResult,
          courseId: data.courseId,
        },
      })
      .onConflictDoNothing();

    // Response
    return NextResponse.json({
      success: true,
      userId: dbUser.id,
      courseId: data.courseId,
      roleAssigned: resolvedRoleId ? true : undefined,
      roleAction: roleResult?.action,
    });
  } catch (err) {
    console.error("Enrollment webhook error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
