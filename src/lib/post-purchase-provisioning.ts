import "server-only";
import { portalAccessStatus, setPortalAccess } from "@/lib/portal-access";

import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, ilike, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activeStudents,
  ghlContacts,
  ghlLocations,
  studentTags,
  tags,
  users,
} from "@/db/schema";
import { getGhlClientForLocation } from "@/lib/ghl/client";
import { ensureDefaultStudentRoleAssignment } from "@/lib/student-role";
import { assignTag } from "@/lib/tags";
import { DEFAULT_PLATFORM_ROLE } from "@/lib/platform-roles";
import { composeStudentName } from "@/lib/student-name";
import { syncAssignedCoachFromGhl } from "@/lib/ghl/coach-assignment";
import {
  canReassignAuthoritativeGhlContact,
  aggregatePostPurchaseStudents,
  derivePostPurchaseTags,
  planPostPurchaseTagReconciliation,
  POST_PURCHASE_CONTROLLED_TAGS,
  shouldReconcilePostPurchaseStudent,
  type PostPurchaseControlledTag,
  type PostPurchaseEntitlementInput,
} from "@/lib/post-purchase-entitlements";
import { resolvePostPurchaseTagsWithStaffOverrides } from "@/lib/staff-tag-overrides";

export type PostPurchaseProvisioningInput = PostPurchaseEntitlementInput & {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  ghlContactId?: string | null;
  ghlLocationId?: string | null;
};

type ProvisioningResult = {
  action: "existing_user" | "created_user";
  invitation: "not_needed" | "sent" | "already_pending";
  userId: string;
  expectedTags: PostPurchaseControlledTag[];
  tagsAdded: PostPurchaseControlledTag[];
  tagsRemoved: PostPurchaseControlledTag[];
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function invitationRedirectUrl() {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://cmb-lab.thecmblueprint.com";
  return `${appUrl.replace(/\/$/, "")}/sign-in`;
}

async function ensureCmbUser(params: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  expectedTags: PostPurchaseControlledTag[];
}) {
  const clerk = await clerkClient();
  const lookup = await clerk.users.getUserList({
    emailAddress: [params.email],
    limit: 1,
  });
  let clerkUser = lookup.data[0] ?? null;
  const created = !clerkUser;
  const priorMetadata = clerkUser?.publicMetadata ?? {};
  // Background provisioning must not undo a manual pause or an expired term.
  const existingPortalStatus = portalAccessStatus(priorMetadata);
  const retryPostPurchaseInvitation =
    priorMetadata.invitedBy === "ghl_post_purchase" &&
    typeof priorMetadata.cmbPostPurchaseInviteSentAt !== "string";
  const provisioningMetadata = {
    role: DEFAULT_PLATFORM_ROLE,
    cmbInviteRole: DEFAULT_PLATFORM_ROLE,
    cmbInviteTags: params.expectedTags,
    cmbPortalAccessStatus: existingPortalStatus,
    cmbPortalAccessRevoked: existingPortalStatus !== "active",
  };
  const invitationMetadata = {
    ...provisioningMetadata,
    invitedBy: "ghl_post_purchase",
  };

  if (!clerkUser) {
    clerkUser = await clerk.users.createUser({
      emailAddress: [params.email],
      firstName: params.firstName?.trim() || undefined,
      lastName: params.lastName?.trim() || undefined,
      skipPasswordRequirement: true,
      publicMetadata: invitationMetadata,
    });
  } else {
    const existingInviteTags = Array.isArray(
      clerkUser.publicMetadata?.cmbInviteTags
    )
      ? clerkUser.publicMetadata.cmbInviteTags.filter(
          (value): value is string => typeof value === "string"
        )
      : [];
    const mergedInviteTags = [
      ...new Set([...existingInviteTags, ...params.expectedTags]),
    ];
    await clerk.users.updateUserMetadata(clerkUser.id, {
      publicMetadata: {
        ...(clerkUser.publicMetadata ?? {}),
        ...provisioningMetadata,
        cmbInviteTags: mergedInviteTags,
      },
    });
    await setPortalAccess(clerk, clerkUser.id, { status: existingPortalStatus, reason: "post_purchase_reconciliation" });
  }

  const fullName = composeStudentName(params.firstName, params.lastName);
  const existingByClerk = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkUser.id),
  });
  const existingByEmail = existingByClerk
    ? null
    : await db.query.users.findFirst({
        where: ilike(users.email, params.email),
      });

  let dbUserId: string;
  if (existingByClerk) {
    dbUserId = existingByClerk.id;
    await db
      .update(users)
      .set({
        email: params.email,
        ...(fullName ? { name: fullName } : {}),
        deletedAt: null,
      })
      .where(eq(users.id, dbUserId));
  } else if (existingByEmail) {
    dbUserId = existingByEmail.id;
    await db
      .update(users)
      .set({
        clerkId: clerkUser.id,
        ...(fullName ? { name: fullName } : {}),
        deletedAt: null,
      })
      .where(eq(users.id, dbUserId));
  } else {
    const [inserted] = await db
      .insert(users)
      .values({
        clerkId: clerkUser.id,
        email: params.email,
        name: fullName,
        role: DEFAULT_PLATFORM_ROLE,
      })
      .returning({ id: users.id });
    dbUserId = inserted.id;
  }

  await ensureDefaultStudentRoleAssignment(dbUserId);

  let invitation: ProvisioningResult["invitation"] = "not_needed";
  if (created || retryPostPurchaseInvitation) {
    try {
      await clerk.invitations.createInvitation({
        emailAddress: params.email,
        notify: true,
        ignoreExisting: true,
        redirectUrl: invitationRedirectUrl(),
        expiresInDays: 14,
        publicMetadata: invitationMetadata,
      });
      invitation = "sent";
      await clerk.users.updateUserMetadata(clerkUser.id, {
        publicMetadata: {
          ...clerkUser.publicMetadata,
          ...invitationMetadata,
          cmbPostPurchaseInviteSentAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      const status = (error as { status?: number }).status;
      const code = (error as { errors?: Array<{ code?: string }> }).errors?.[0]
        ?.code;
      if (status === 422 || code === "duplicate_record") {
        invitation = "already_pending";
        await clerk.users.updateUserMetadata(clerkUser.id, {
          publicMetadata: {
            ...clerkUser.publicMetadata,
            ...invitationMetadata,
            cmbPostPurchaseInviteSentAt: new Date().toISOString(),
          },
        });
      } else {
        throw error;
      }
    }
  }

  return { dbUserId, clerkUserId: clerkUser.id, created, invitation };
}

async function updateControlledInviteTags(
  clerkUserId: string,
  expectedTags: PostPurchaseControlledTag[]
) {
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(clerkUserId);
  const existingInviteTags = Array.isArray(
    clerkUser.publicMetadata?.cmbInviteTags
  )
    ? clerkUser.publicMetadata.cmbInviteTags.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  await clerk.users.updateUserMetadata(clerkUserId, {
    publicMetadata: {
      ...(clerkUser.publicMetadata ?? {}),
      cmbInviteTags: [...new Set([...existingInviteTags, ...expectedTags])],
    },
  });
}

async function getControlledTagRows() {
  const rows = await db.select().from(tags);
  const byName = new Map(rows.map((tag) => [tag.name.toLowerCase(), tag]));
  const missing = POST_PURCHASE_CONTROLLED_TAGS.filter(
    (name) => !byName.has(name)
  );
  if (missing.length > 0) {
    throw new Error(`Missing controlled CMB tags: ${missing.join(", ")}`);
  }
  return byName;
}

async function getUserTagNames(userId: string) {
  const rows = await db
    .select({ name: tags.name })
    .from(studentTags)
    .innerJoin(tags, eq(tags.id, studentTags.tagId))
    .where(eq(studentTags.userId, userId));
  return rows.map((row) => row.name);
}

async function applyCmbTags(params: {
  userId: string;
  expectedTags: PostPurchaseControlledTag[];
}) {
  const currentTags = await getUserTagNames(params.userId);
  const plan = planPostPurchaseTagReconciliation({
    currentTags,
    expectedTags: params.expectedTags,
  });
  const tagRows = await getControlledTagRows();

  for (const tagName of plan.add) {
    await assignTag(params.userId, tagRows.get(tagName)!.id, undefined, {
      source: "webhook",
    });
  }
  return plan;
}

async function syncControlledTagsToContact(params: {
  ghlContactId?: string | null;
  ghlLocationId?: string | null;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  expectedTags: PostPurchaseControlledTag[];
}) {
  if (!params.ghlContactId || !params.ghlLocationId) {
    return params.ghlContactId ?? null;
  }
  const client = await getGhlClientForLocation(params.ghlLocationId);
  if (!client) throw new Error("Post-purchase GHL location is unavailable");

  let contactId = params.ghlContactId;
  let response;
  try {
    response = await client.get<{
      contact?: { tags?: string[] };
    }>(`/contacts/${contactId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("contact not found")) throw error;

    const upsert = await client.post<{
      contact?: { id?: string };
    }>("/contacts/upsert", {
      locationId: params.ghlLocationId,
      email: params.email,
      firstName: params.firstName?.trim() || undefined,
      lastName: params.lastName?.trim() || undefined,
      source: "CMB Lab post-purchase reconciliation",
    });
    const resolvedContactId = upsert.data.contact?.id;
    if (!resolvedContactId) {
      throw new Error("GHL contact upsert did not return a contact ID");
    }
    contactId = resolvedContactId;
    response = await client.get<{
      contact?: { tags?: string[] };
    }>(`/contacts/${contactId}`);
  }
  const currentTags = new Set(
    (response.data.contact?.tags ?? []).map((tag) => tag.toLowerCase())
  );
  const tagsToAdd = params.expectedTags.filter((tag) => !currentTags.has(tag));
  if (tagsToAdd.length > 0) {
    await client.post(`/contacts/${contactId}/tags`, {
      tags: tagsToAdd,
    });
  }
  return contactId;
}

async function getCourseGhlLocation() {
  const [courseLocation] = await db
    .select({ locationId: ghlLocations.ghlLocationId })
    .from(ghlLocations)
    .where(
      and(eq(ghlLocations.isActive, true), ilike(ghlLocations.name, "%course%"))
    )
    .limit(1);
  if (!courseLocation) {
    throw new Error("Active course GHL location is unavailable");
  }
  return courseLocation;
}

async function syncControlledTagsToCourseContact(params: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  expectedTags: PostPurchaseControlledTag[];
}) {
  const courseLocation = await getCourseGhlLocation();
  const client = await getGhlClientForLocation(courseLocation.locationId);
  if (!client) {
    throw new Error("Post-purchase course GHL location is unavailable");
  }

  const upsert = await client.post<{
    contact?: { id?: string };
  }>("/contacts/upsert", {
    locationId: courseLocation.locationId,
    email: params.email,
    firstName: params.firstName?.trim() || undefined,
    lastName: params.lastName?.trim() || undefined,
    source: "CMB Lab post-purchase reconciliation",
  });
  const contactId = upsert.data.contact?.id;
  if (!contactId) {
    throw new Error("Course GHL contact upsert did not return a contact ID");
  }

  await syncControlledTagsToContact({
    ghlContactId: contactId,
    ghlLocationId: courseLocation.locationId,
    email: params.email,
    firstName: params.firstName,
    lastName: params.lastName,
    expectedTags: params.expectedTags,
  });
  return { contactId, locationId: courseLocation.locationId };
}

async function ensureGhlContactLink(params: {
  userId: string;
  ghlContactId?: string | null;
  ghlLocationId?: string | null;
  authoritativeEmailUpsert?: boolean;
}) {
  if (!params.ghlContactId || !params.ghlLocationId) return;

  const byContact = await db.query.ghlContacts.findFirst({
    where: eq(ghlContacts.ghlContactId, params.ghlContactId),
  });
  if (byContact) {
    if (byContact.userId === params.userId) {
      await db
        .update(ghlContacts)
        .set({ syncStatus: "active", lastSyncedAt: new Date() })
        .where(eq(ghlContacts.id, byContact.id));
      return;
    }
    if (
      !canReassignAuthoritativeGhlContact({
        authoritativeEmailUpsert: params.authoritativeEmailUpsert ?? false,
        existingLocationId: byContact.ghlLocationId,
        requestedLocationId: params.ghlLocationId,
      })
    ) {
      throw new Error("GHL contact is already linked to a different CMB user");
    }

    const targetLocationLink = await db.query.ghlContacts.findFirst({
      where: and(
        eq(ghlContacts.userId, params.userId),
        eq(ghlContacts.ghlLocationId, params.ghlLocationId)
      ),
    });
    if (targetLocationLink && targetLocationLink.id !== byContact.id) {
      // Neon HTTP does not support interactive transaction callbacks. Remove
      // the conflicting legacy row first, then promote the target's existing
      // location row. If the second statement is interrupted, the next cron
      // safely retries this same email-upsert repair.
      await db.delete(ghlContacts).where(eq(ghlContacts.id, byContact.id));
      await db
        .update(ghlContacts)
        .set({
          ghlContactId: params.ghlContactId!,
          syncStatus: "active",
          lastSyncedAt: new Date(),
        })
        .where(eq(ghlContacts.id, targetLocationLink.id));
    } else {
      await db
        .update(ghlContacts)
        .set({
          userId: params.userId,
          syncStatus: "active",
          lastSyncedAt: new Date(),
        })
        .where(eq(ghlContacts.id, byContact.id));
    }
    console.warn(
      "[Post Purchase] Repaired a legacy course-contact ownership mismatch"
    );
    return;
  }

  const byUserLocation = await db.query.ghlContacts.findFirst({
    where: and(
      eq(ghlContacts.userId, params.userId),
      eq(ghlContacts.ghlLocationId, params.ghlLocationId)
    ),
  });
  if (byUserLocation) {
    await db
      .update(ghlContacts)
      .set({
        ghlContactId: params.ghlContactId,
        syncStatus: "active",
        lastSyncedAt: new Date(),
      })
      .where(eq(ghlContacts.id, byUserLocation.id));
    return;
  }

  await db.insert(ghlContacts).values({
    userId: params.userId,
    ghlContactId: params.ghlContactId,
    ghlLocationId: params.ghlLocationId,
    syncStatus: "active",
    lastSyncedAt: new Date(),
  });
}

export async function provisionPostPurchaseEntitlements(
  input: PostPurchaseProvisioningInput
): Promise<ProvisioningResult> {
  const email = normalizeEmail(input.email);
  const sourceExpectedTags = derivePostPurchaseTags(input);
  if (sourceExpectedTags.length === 0) {
    throw new Error("Post-purchase submission has no recognized package");
  }

  const ensured = await ensureCmbUser({
    email,
    firstName: input.firstName,
    lastName: input.lastName,
    expectedTags: sourceExpectedTags,
  });
  const expectedTags = await resolvePostPurchaseTagsWithStaffOverrides(
    ensured.dbUserId,
    sourceExpectedTags
  );
  await updateControlledInviteTags(ensured.clerkUserId, expectedTags);
  const plan = await applyCmbTags({
    userId: ensured.dbUserId,
    expectedTags,
  });

  let resolvedSourceContactId = input.ghlContactId ?? null;
  if (input.ghlContactId && input.ghlLocationId) {
    resolvedSourceContactId = await syncControlledTagsToContact({
      ghlContactId: input.ghlContactId,
      ghlLocationId: input.ghlLocationId,
      email,
      firstName: input.firstName,
      lastName: input.lastName,
      expectedTags,
    });
    await ensureGhlContactLink({
      userId: ensured.dbUserId,
      ghlContactId: resolvedSourceContactId,
      ghlLocationId: input.ghlLocationId,
    });
  }

  const courseContact = await syncControlledTagsToCourseContact({
    email,
    firstName: input.firstName,
    lastName: input.lastName,
    expectedTags,
  });
  await ensureGhlContactLink({
    userId: ensured.dbUserId,
    ghlContactId: courseContact.contactId,
    ghlLocationId: courseContact.locationId,
    authoritativeEmailUpsert: true,
  });

  let coachBackedOneOnOne = !expectedTags.includes("1on1_student");
  if (expectedTags.includes("1on1_student")) {
    try {
      const coachResult = await syncAssignedCoachFromGhl({
        userId: ensured.dbUserId,
        email,
      });
      coachBackedOneOnOne =
        coachResult.status === "assigned" ||
        coachResult.status === "already_assigned";
    } catch (error) {
      console.error(
        "[Post Purchase] Coach assignment reconciliation failed:",
        error instanceof Error ? error.message : error
      );
      coachBackedOneOnOne = false;
    }
  }

  let finalExpectedTags = expectedTags;
  let correctionPlan: Awaited<ReturnType<typeof applyCmbTags>> = {
    add: [],
    remove: [],
  };
  if (!coachBackedOneOnOne) {
    finalExpectedTags = await resolvePostPurchaseTagsWithStaffOverrides(
      ensured.dbUserId,
      sourceExpectedTags.filter((tag) => tag !== "1on1_student")
    );
    correctionPlan = await applyCmbTags({
      userId: ensured.dbUserId,
      expectedTags: finalExpectedTags,
    });
    if (resolvedSourceContactId && input.ghlLocationId) {
      await syncControlledTagsToContact({
        ghlContactId: resolvedSourceContactId,
        ghlLocationId: input.ghlLocationId,
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        expectedTags: finalExpectedTags,
      });
    }
    await syncControlledTagsToContact({
      ghlContactId: courseContact.contactId,
      ghlLocationId: courseContact.locationId,
      email,
      firstName: input.firstName,
      lastName: input.lastName,
      expectedTags: finalExpectedTags,
    });
    await updateControlledInviteTags(ensured.clerkUserId, finalExpectedTags);
  }

  return {
    action: ensured.created ? "created_user" : "existing_user",
    invitation: ensured.invitation,
    userId: ensured.dbUserId,
    expectedTags: finalExpectedTags,
    tagsAdded: [...new Set([...plan.add, ...correctionPlan.add])],
    tagsRemoved: [...new Set([...plan.remove, ...correctionPlan.remove])],
  };
}

export async function reconcilePostPurchaseEntitlements(params?: {
  dryRun?: boolean;
  limit?: number;
  resyncGhl?: boolean;
}) {
  const dryRun = params?.dryRun ?? false;
  const resyncGhl = params?.resyncGhl ?? false;
  const limit = params?.limit
    ? Math.min(Math.max(params.limit, 1), 5000)
    : null;
  const courseLocation = await getCourseGhlLocation();
  const sourceRows = await db
    .select({
      email: activeStudents.email,
      firstName: activeStudents.firstName,
      lastName: activeStudents.lastName,
      productLine: activeStudents.productLine,
      addOnPurchased: activeStudents.addOnPurchased,
      oneOnOneEligibilityActive: sql<boolean>`
        lower(trim(coalesce(${activeStudents.col1on1Eligibility}, ''))) = 'yes'
        and (
          ${activeStudents.col1on1EndDate} is null
          or ${activeStudents.col1on1EndDate}::date >= current_date
        )
      `,
    })
    .from(activeStudents)
    .where(
      and(
        ilike(activeStudents.courseEligibility, "YES"),
        isNotNull(activeStudents.productLine)
      )
    );
  const validSourceRows = sourceRows.filter(
    (student) => student.email?.trim() && student.productLine?.trim()
  );
  const aggregatedStudents = aggregatePostPurchaseStudents(validSourceRows);
  const students = limit
    ? aggregatedStudents.slice(0, limit)
    : aggregatedStudents;

  const existingTagRows = await db
    .select({
      userId: users.id,
      email: users.email,
      assignedCoachId: users.assignedCoachId,
      tagName: tags.name,
    })
    .from(users)
    .leftJoin(studentTags, eq(studentTags.userId, users.id))
    .leftJoin(tags, eq(tags.id, studentTags.tagId))
    .where(isNull(users.deletedAt));
  const courseContactRows = await db
    .select({ userId: ghlContacts.userId })
    .from(ghlContacts)
    .where(
      and(
        eq(ghlContacts.ghlLocationId, courseLocation.locationId),
        eq(ghlContacts.syncStatus, "active")
      )
    );
  const courseLinkedUserIds = new Set(
    courseContactRows.map((row) => row.userId)
  );
  const usersByEmail = new Map<
    string,
    {
      userId: string;
      assignedCoachId: string | null;
      tags: Set<string>;
      hasCourseContact: boolean;
    }
  >();
  for (const row of existingTagRows) {
    const email = normalizeEmail(row.email);
    const entry = usersByEmail.get(email) ?? {
      userId: row.userId,
      assignedCoachId: row.assignedCoachId,
      tags: new Set<string>(),
      hasCourseContact: courseLinkedUserIds.has(row.userId),
    };
    if (row.tagName) entry.tags.add(row.tagName);
    usersByEmail.set(email, entry);
  }

  const stats = {
    sourceRows: sourceRows.length,
    duplicateSourceRows: validSourceRows.length - aggregatedStudents.length,
    checked: 0,
    alreadyCorrect: 0,
    wouldProvision: 0,
    provisioned: 0,
    usersCreated: 0,
    invitationsSent: 0,
    tagsAdded: 0,
    tagsRemoved: 0,
    skippedInvalid: sourceRows.length - validSourceRows.length,
    failed: 0,
  };

  for (const student of students) {
    stats.checked += 1;
    const email = normalizeEmail(student.email);
    const existing = usersByEmail.get(email);
    const sourceExpectedTags = derivePostPurchaseTags({
      ...student,
      oneOnOneCoachAssigned: Boolean(existing?.assignedCoachId),
    });
    const expectedTags = existing
      ? await resolvePostPurchaseTagsWithStaffOverrides(
          existing.userId,
          sourceExpectedTags
        )
      : sourceExpectedTags;
    if (sourceExpectedTags.length === 0) {
      stats.skippedInvalid += 1;
      continue;
    }
    if (
      !shouldReconcilePostPurchaseStudent({
        userExists: Boolean(existing),
        currentTags: existing?.tags ?? [],
        expectedTags,
        hasCourseContact: existing?.hasCourseContact ?? false,
        resyncGhl,
      })
    ) {
      stats.alreadyCorrect += 1;
      continue;
    }
    stats.wouldProvision += 1;
    if (dryRun) continue;

    try {
      const result = await provisionPostPurchaseEntitlements({
        email,
        firstName: student.firstName,
        lastName: student.lastName,
        productLine: student.productLine,
        addOnPurchased: student.addOnPurchased,
        oneOnOneEligibilityActive: student.oneOnOneEligibilityActive,
      });
      stats.provisioned += 1;
      if (result.action === "created_user") stats.usersCreated += 1;
      if (result.invitation === "sent") stats.invitationsSent += 1;
      stats.tagsAdded += result.tagsAdded.length;
      stats.tagsRemoved += result.tagsRemoved.length;
    } catch (error) {
      stats.failed += 1;
      console.error(
        "[Post Purchase] Reconciliation failed for one student:",
        error instanceof Error ? error.message : error
      );
    }
  }

  return stats;
}
