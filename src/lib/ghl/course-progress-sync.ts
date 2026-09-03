import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, getNeonSql } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryLessonProgress,
  courseLibraryLessons,
  courseLibraryModules,
  ghlContacts,
  ghlFieldMappings,
  ghlLocations,
  studentTags,
  studentTagOverrides,
  syncEvents,
  tags,
  users,
} from "@/db/schema";
import { createGhlClient } from "@/lib/ghl/client";
import {
  BLUEPRINT_COURSE_TITLES,
  GHL_PROGRESS_CONCEPTS,
  buildCourseProgressPlan,
  diffCourseProgressAccess,
  parseGhlCourseProgress,
  type BlueprintLevel,
  type CourseStructure,
  type GhlProgressFieldIds,
} from "@/lib/ghl/course-progress-plan";

interface GhlSearchContact {
  id: string;
  email?: string;
  tags?: string[];
  customFields?: Array<{
    id: string;
    value: unknown;
    fieldValue?: unknown;
  }>;
}

interface GhlSearchResponse {
  contacts?: GhlSearchContact[];
  total?: number;
  totalCount?: number;
}

export interface CourseProgressSyncResult {
  mode: "dry-run" | "applied";
  configured: boolean;
  missingMappings: string[];
  locationsChecked: number;
  contactsChecked: number;
  rosterStudents: number;
  rosterStudentsChecked: number;
  rosterStudentsUnchecked: number;
  contactsWithoutEmail: number;
  contactsWithoutUser: number;
  contactsWithDuplicateUsers: number;
  linkConflicts: number;
  linksToInsert: number;
  linksToUpdate: number;
  tagsToAdd: number;
  courseAccessToAdd: number;
  courseAccessToRemove: number;
  lessonCompletionsPlanned: number;
  lessonCompletionsToAdd: number;
  lessonCompletionsAlreadyPresent: number;
  planStatuses: Record<string, number>;
  rosterPlanStatuses: Record<string, number>;
}

type LinkPlan = {
  action: "insert" | "update" | "none";
  linkId?: string;
  userId: string;
  ghlContactId: string;
  ghlLocationId: string;
  cachedData: {
    email: string;
    tags: string[];
    customFields: Array<{ id: string; value: unknown }>;
  };
};

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function incrementCount(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function normalizeContact(contact: GhlSearchContact): GhlSearchContact {
  return {
    ...contact,
    customFields: (contact.customFields ?? []).map((field) => ({
      id: field.id,
      value: field.value ?? field.fieldValue,
    })),
  };
}

async function fetchContactsWithTag(
  location: {
    ghlLocationId: string;
    apiToken: string;
  },
  tag: string,
): Promise<GhlSearchContact[]> {
  const client = createGhlClient(location.apiToken);
  const contacts: GhlSearchContact[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (contacts.length < total) {
    const response = await client.post<GhlSearchResponse>("/contacts/search", {
      locationId: location.ghlLocationId,
      page,
      pageLimit: 100,
      filters: [{ field: "tags", operator: "contains", value: tag }],
    });
    const batch = (response.data.contacts ?? []).map(normalizeContact);
    contacts.push(...batch);
    total = Number(
      response.data.total ?? response.data.totalCount ?? contacts.length,
    );
    if (batch.length === 0 || batch.length < 100) break;
    page += 1;
  }

  return contacts;
}

async function fetchCmbLabContacts(location: {
  ghlLocationId: string;
  apiToken: string;
}, linkedContactIds: string[]): Promise<GhlSearchContact[]> {
  const client = createGhlClient(location.apiToken);
  const taggedBatches = await Promise.all([
    fetchContactsWithTag(location, "cmb_lab"),
    fetchContactsWithTag(location, "cmb_student"),
  ]);
  const contactsById = new Map(
    taggedBatches.flat().map((contact) => [contact.id, contact]),
  );

  // Local CMB enrollment is the final source of roster coverage. A few valid
  // Course contacts predate one or both discovery tags, so fetch those linked
  // contacts directly instead of silently omitting them from the audit.
  const missingLinkedIds = linkedContactIds.filter(
    (contactId) => !contactsById.has(contactId),
  );
  for (const batch of chunks(missingLinkedIds, 10)) {
    const responses = await Promise.all(
      batch.map((contactId) =>
        client.get<{ contact: GhlSearchContact }>(`/contacts/${contactId}`),
      ),
    );
    for (const response of responses) {
      const contact = normalizeContact(response.data.contact);
      contactsById.set(contact.id, contact);
    }
  }

  return [...contactsById.values()];
}

async function loadProgressFieldIds(): Promise<{
  fieldIds: GhlProgressFieldIds | null;
  missingMappings: string[];
}> {
  const concepts = Object.values(GHL_PROGRESS_CONCEPTS);
  const rows = await db
    .select({
      concept: ghlFieldMappings.lmsConcept,
      fieldId: ghlFieldMappings.ghlFieldId,
    })
    .from(ghlFieldMappings)
    .where(
      and(
        eq(ghlFieldMappings.isActive, true),
        inArray(ghlFieldMappings.lmsConcept, concepts),
      ),
    );
  const byConcept = new Map(rows.map((row) => [row.concept, row.fieldId]));
  const missingMappings = concepts.filter((concept) => !byConcept.has(concept));
  if (missingMappings.length) return { fieldIds: null, missingMappings };

  return {
    fieldIds: {
      level: byConcept.get(GHL_PROGRESS_CONCEPTS.level)!,
      lessonNumber: byConcept.get(GHL_PROGRESS_CONCEPTS.lessonNumber)!,
      foundationsCompletedAt: byConcept.get(
        GHL_PROGRESS_CONCEPTS.foundationsCompletedAt,
      )!,
      intermediateCompletedAt: byConcept.get(
        GHL_PROGRESS_CONCEPTS.intermediateCompletedAt,
      )!,
      advancedCompletedAt: byConcept.get(
        GHL_PROGRESS_CONCEPTS.advancedCompletedAt,
      )!,
    },
    missingMappings: [],
  };
}

async function loadCourseStructures(): Promise<{
  courses: CourseStructure[];
  systemAccessUserIdsByCourse: Map<string, Set<string>>;
}> {
  const rows = await db
    .select({
      courseId: courseLibraryCourses.id,
      courseTitle: courseLibraryCourses.title,
      systemAccessUserIds: courseLibraryCourses.systemAccessUserIds,
      moduleId: courseLibraryModules.id,
      moduleTitle: courseLibraryModules.title,
      lessonId: courseLibraryLessons.id,
    })
    .from(courseLibraryCourses)
    .innerJoin(
      courseLibraryModules,
      and(
        eq(courseLibraryModules.courseId, courseLibraryCourses.id),
        isNull(courseLibraryModules.deletedAt),
      ),
    )
    .innerJoin(
      courseLibraryLessons,
      and(
        eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
        isNull(courseLibraryLessons.deletedAt),
      ),
    )
    .where(
      and(
        inArray(courseLibraryCourses.title, Object.values(BLUEPRINT_COURSE_TITLES)),
        isNull(courseLibraryCourses.deletedAt),
      ),
    )
    .orderBy(
      asc(courseLibraryCourses.sortOrder),
      asc(courseLibraryModules.sortOrder),
      asc(courseLibraryLessons.sortOrder),
    );

  const courses: CourseStructure[] = [];
  const systemAccessUserIdsByCourse = new Map<string, Set<string>>();
  for (const [level, title] of Object.entries(
    BLUEPRINT_COURSE_TITLES,
  ) as Array<[BlueprintLevel, string]>) {
    const courseRows = rows.filter((row) => row.courseTitle === title);
    if (!courseRows.length) continue;
    const moduleMap = new Map<
      string,
      { id: string; title: string; lessonIds: string[] }
    >();
    for (const row of courseRows) {
      const courseModule = moduleMap.get(row.moduleId) ?? {
        id: row.moduleId,
        title: row.moduleTitle,
        lessonIds: [],
      };
      courseModule.lessonIds.push(row.lessonId);
      moduleMap.set(row.moduleId, courseModule);
    }
    courses.push({
      id: courseRows[0].courseId,
      level,
      modules: [...moduleMap.values()],
    });
    systemAccessUserIdsByCourse.set(
      courseRows[0].courseId,
      new Set(courseRows[0].systemAccessUserIds ?? []),
    );
  }
  return { courses, systemAccessUserIdsByCourse };
}

export async function syncGhlCourseProgress({
  apply,
}: {
  apply: boolean;
}): Promise<CourseProgressSyncResult> {
  const mode = apply ? "applied" : "dry-run";
  const { fieldIds, missingMappings } = await loadProgressFieldIds();
  const emptyResult: CourseProgressSyncResult = {
    mode,
    configured: Boolean(fieldIds),
    missingMappings,
    locationsChecked: 0,
    contactsChecked: 0,
    rosterStudents: 0,
    rosterStudentsChecked: 0,
    rosterStudentsUnchecked: 0,
    contactsWithoutEmail: 0,
    contactsWithoutUser: 0,
    contactsWithDuplicateUsers: 0,
    linkConflicts: 0,
    linksToInsert: 0,
    linksToUpdate: 0,
    tagsToAdd: 0,
    courseAccessToAdd: 0,
    courseAccessToRemove: 0,
    lessonCompletionsPlanned: 0,
    lessonCompletionsToAdd: 0,
    lessonCompletionsAlreadyPresent: 0,
    planStatuses: {},
    rosterPlanStatuses: {},
  };
  if (!fieldIds) return emptyResult;
  const configuredLocationId = process.env.GHL_LOCATION_ID?.trim();

  const [
    locations,
    activeUsers,
    existingLinks,
    tagRows,
    assignedTagRows,
    tagOverrideRows,
    courseData,
    linkedRoster,
  ] = await Promise.all([
    db
      .select({
        ghlLocationId: ghlLocations.ghlLocationId,
        apiToken: ghlLocations.apiToken,
        name: ghlLocations.name,
      })
      .from(ghlLocations)
      .where(eq(ghlLocations.isActive, true)),
    db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.role, "student"), isNull(users.deletedAt))),
    db
      .select({
        id: ghlContacts.id,
        userId: ghlContacts.userId,
        ghlContactId: ghlContacts.ghlContactId,
        ghlLocationId: ghlContacts.ghlLocationId,
      })
      .from(ghlContacts),
    db.select({ id: tags.id, name: tags.name }).from(tags),
    db
      .select({ userId: studentTags.userId, tagId: studentTags.tagId })
      .from(studentTags),
    db
      .select({
        userId: studentTagOverrides.userId,
        tagId: studentTagOverrides.tagId,
        isAssigned: studentTagOverrides.isAssigned,
      })
      .from(studentTagOverrides),
    loadCourseStructures(),
    db
      .select({
        userId: ghlContacts.userId,
        contactId: ghlContacts.ghlContactId,
        locationId: ghlContacts.ghlLocationId,
      })
      .from(ghlContacts)
      .innerJoin(users, eq(users.id, ghlContacts.userId))
      .innerJoin(
        ghlLocations,
        eq(ghlLocations.ghlLocationId, ghlContacts.ghlLocationId),
      )
      .where(
        and(
          eq(ghlContacts.syncStatus, "active"),
          eq(ghlLocations.isActive, true),
          eq(users.role, "student"),
          isNull(users.deletedAt),
          configuredLocationId
            ? eq(ghlContacts.ghlLocationId, configuredLocationId)
            : sql`(${ghlLocations.name} ILIKE '%course%' OR ${ghlLocations.name} ILIKE '%cmbp%')`,
          sql`EXISTS (
            SELECT 1
            FROM ${studentTags}
            INNER JOIN ${tags} ON ${tags.id} = ${studentTags.tagId}
            WHERE ${studentTags.userId} = ${ghlContacts.userId}
              AND LOWER(${tags.name}) = 'cmb_student'
          )`,
        ),
      ),
  ]);

  const courseLocations = locations.filter((location) =>
    configuredLocationId
      ? location.ghlLocationId === configuredLocationId
      : /course|cmbp/i.test(location.name),
  );
  const contactsByLocation = await Promise.all(
    courseLocations.map(async (location) => ({
      location,
      contacts: await fetchCmbLabContacts(
        location,
        linkedRoster
          .filter((link) => link.locationId === location.ghlLocationId)
          .map((link) => link.contactId),
      ),
    })),
  );
  const rosterUserIds = new Set(linkedRoster.map((link) => link.userId));
  const checkedRosterUserIds = new Set<string>();

  const usersByEmail = new Map<string, typeof activeUsers>();
  for (const user of activeUsers) {
    const email = normalizeEmail(user.email);
    const matches = usersByEmail.get(email) ?? [];
    matches.push(user);
    usersByEmail.set(email, matches);
  }

  const linksByContact = new Map(
    existingLinks.map((link) => [link.ghlContactId, link]),
  );
  const linksByUserLocation = new Map(
    existingLinks.map((link) => [
      `${link.userId}:${link.ghlLocationId}`,
      link,
    ]),
  );
  const tagByName = new Map(
    tagRows.map((tag) => [tag.name.trim().toLowerCase(), tag]),
  );
  const assignedTagKeys = new Set(
    assignedTagRows.map((row) => `${row.userId}:${row.tagId}`),
  );
  const staffForcedOffTagKeys = new Set(
    tagOverrideRows
      .filter((row) => !row.isAssigned)
      .map((row) => `${row.userId}:${row.tagId}`),
  );

  const linkPlans: LinkPlan[] = [];
  const tagsToAdd = new Map<string, { userId: string; tagId: string }>();
  const expectedAccessByCourse = new Map(
    courseData.courses.map((course) => [course.id, new Set<string>()]),
  );
  const scopedUserIds = new Set<string>();
  const completionPlans = new Map<
    string,
    { userId: string; lessonId: string; completedAt: Date }
  >();
  const result = {
    ...emptyResult,
    locationsChecked: courseLocations.length,
    rosterStudents: rosterUserIds.size,
  };
  const syncedAt = new Date();

  for (const { location, contacts } of contactsByLocation) {
    for (const contact of contacts) {
      result.contactsChecked += 1;
      const email = normalizeEmail(contact.email);
      if (!email) {
        result.contactsWithoutEmail += 1;
        continue;
      }
      const matchedUsers = usersByEmail.get(email) ?? [];
      if (matchedUsers.length === 0) {
        result.contactsWithoutUser += 1;
        continue;
      }
      if (matchedUsers.length > 1) {
        result.contactsWithDuplicateUsers += 1;
        continue;
      }

      const user = matchedUsers[0];
      const byContact = linksByContact.get(contact.id);
      const byUserLocation = linksByUserLocation.get(
        `${user.id}:${location.ghlLocationId}`,
      );
      if (byContact && byContact.userId !== user.id) {
        result.linkConflicts += 1;
        continue;
      }
      if (
        byUserLocation &&
        byUserLocation.ghlContactId !== contact.id &&
        byContact &&
        byContact.id !== byUserLocation.id
      ) {
        result.linkConflicts += 1;
        continue;
      }

      const linkAction = byUserLocation
        ? byUserLocation.ghlContactId === contact.id
          ? "none"
          : "update"
        : byContact
          ? "none"
          : "insert";
      if (linkAction === "insert") result.linksToInsert += 1;
      if (linkAction === "update") result.linksToUpdate += 1;
      linkPlans.push({
        action: linkAction,
        linkId: byUserLocation?.id ?? byContact?.id,
        userId: user.id,
        ghlContactId: contact.id,
        ghlLocationId: location.ghlLocationId,
        cachedData: {
          email,
          tags: contact.tags ?? [],
          customFields: contact.customFields ?? [],
        },
      });

      for (const rawTagName of contact.tags ?? []) {
        const tag = tagByName.get(rawTagName.trim().toLowerCase());
        if (!tag) continue;
        const key = `${user.id}:${tag.id}`;
        if (!assignedTagKeys.has(key) && !staffForcedOffTagKeys.has(key)) {
          tagsToAdd.set(key, { userId: user.id, tagId: tag.id });
        }
      }

      const snapshot = parseGhlCourseProgress(
        contact.customFields ?? [],
        fieldIds,
      );
      const plan = buildCourseProgressPlan(
        snapshot,
        courseData.courses,
        syncedAt,
      );
      incrementCount(result.planStatuses, plan.status);
      if (rosterUserIds.has(user.id)) {
        incrementCount(result.rosterPlanStatuses, plan.status);
        checkedRosterUserIds.add(user.id);
        scopedUserIds.add(user.id);
        for (const courseId of plan.accessCourseIds) {
          expectedAccessByCourse.get(courseId)?.add(user.id);
        }
      }
      for (const completion of plan.lessonCompletions) {
        const key = `${user.id}:${completion.lessonId}`;
        const existing = completionPlans.get(key);
        if (
          !existing ||
          completion.completedAt.getTime() < existing.completedAt.getTime()
        ) {
          completionPlans.set(key, {
            userId: user.id,
            lessonId: completion.lessonId,
            completedAt: completion.completedAt,
          });
        }
      }
    }
  }

  result.tagsToAdd = tagsToAdd.size;
  result.rosterStudentsChecked = checkedRosterUserIds.size;
  result.rosterStudentsUnchecked = rosterUserIds.size - checkedRosterUserIds.size;
  const { toAdd: accessToAdd, toRemove: accessToRemove } =
    diffCourseProgressAccess({
      currentByCourse: courseData.systemAccessUserIdsByCourse,
      expectedByCourse: expectedAccessByCourse,
      scopedUserIds,
    });
  result.courseAccessToAdd = accessToAdd.length;
  result.courseAccessToRemove = accessToRemove.length;
  result.lessonCompletionsPlanned = completionPlans.size;

  const candidateUserIds = [...new Set(
    [...completionPlans.values()].map((row) => row.userId),
  )];
  const existingProgress = candidateUserIds.length
    ? await db
        .select({
          userId: courseLibraryLessonProgress.userId,
          lessonId: courseLibraryLessonProgress.lessonId,
          completedAt: courseLibraryLessonProgress.completedAt,
        })
        .from(courseLibraryLessonProgress)
        .where(inArray(courseLibraryLessonProgress.userId, candidateUserIds))
    : [];
  const alreadyCompleted = new Set(
    existingProgress
      .filter((row) => row.completedAt)
      .map((row) => `${row.userId}:${row.lessonId}`),
  );
  const completionsToAdd = [...completionPlans.values()].filter(
    (row) => !alreadyCompleted.has(`${row.userId}:${row.lessonId}`),
  );
  result.lessonCompletionsToAdd = completionsToAdd.length;
  result.lessonCompletionsAlreadyPresent =
    completionPlans.size - completionsToAdd.length;

  if (!apply) return result;

  for (const plan of linkPlans) {
    if (plan.action === "insert") {
      await db.insert(ghlContacts).values({
        userId: plan.userId,
        ghlContactId: plan.ghlContactId,
        ghlLocationId: plan.ghlLocationId,
        syncStatus: "active",
        cachedData: plan.cachedData,
        lastFetchedAt: syncedAt,
        lastSyncedAt: syncedAt,
      });
    } else if (plan.action === "update" && plan.linkId) {
      await db
        .update(ghlContacts)
        .set({
          ghlContactId: plan.ghlContactId,
          syncStatus: "active",
          cachedData: plan.cachedData,
          lastFetchedAt: syncedAt,
          lastSyncedAt: syncedAt,
        })
        .where(eq(ghlContacts.id, plan.linkId));
    } else if (plan.linkId) {
      await db
        .update(ghlContacts)
        .set({
          syncStatus: "active",
          cachedData: plan.cachedData,
          lastFetchedAt: syncedAt,
          lastSyncedAt: syncedAt,
        })
        .where(eq(ghlContacts.id, plan.linkId));
    }
  }

  for (const batch of chunks([...tagsToAdd.values()], 500)) {
    if (!batch.length) continue;
    await db
      .insert(studentTags)
      .values(batch.map((row) => ({ userId: row.userId, tagId: row.tagId })))
      .onConflictDoNothing();
  }

  const neonSql = getNeonSql();
  for (const course of courseData.courses) {
    const current =
      courseData.systemAccessUserIdsByCourse.get(course.id) ?? new Set<string>();
    const expected = expectedAccessByCourse.get(course.id) ?? new Set<string>();
    const next = new Set(
      [...current].filter((userId) => !scopedUserIds.has(userId)),
    );
    for (const userId of expected) next.add(userId);

    await db
      .update(courseLibraryCourses)
      .set({ systemAccessUserIds: [...next], updatedAt: syncedAt })
      .where(eq(courseLibraryCourses.id, course.id));
  }

  for (const batch of chunks(completionsToAdd, 2_000)) {
    if (!batch.length) continue;
    await neonSql`
      WITH progress_rows AS (
        SELECT user_id, lesson_id, completed_at
        FROM jsonb_to_recordset(${JSON.stringify(
          batch.map((row) => ({
            user_id: row.userId,
            lesson_id: row.lessonId,
            completed_at: row.completedAt.toISOString(),
          })),
        )}::jsonb)
          AS rows(user_id uuid, lesson_id uuid, completed_at timestamptz)
      )
      INSERT INTO course_library_lesson_progress
        (user_id, lesson_id, completed_at, video_watched_percent, started_at, updated_at)
      SELECT user_id, lesson_id, completed_at, 0, completed_at, NOW()
      FROM progress_rows
      ON CONFLICT (user_id, lesson_id) DO UPDATE
      SET completed_at = COALESCE(
        course_library_lesson_progress.completed_at,
        EXCLUDED.completed_at
      ),
      updated_at = NOW()
    `;
  }

  await db.insert(syncEvents).values({
    eventType: "course_progress.reconcile",
    direction: "inbound",
    status: "completed",
    entityType: "course_progress",
    payload: result,
    processedAt: new Date(),
  });

  return result;
}
