import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lt,
  or,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { coachingSessions, users, type User } from "@/db/schema";
import { studentAssignedToCoach } from "@/lib/coach-student-sql";
import { sanitizeRecordingUrl } from "@/lib/recording-embed";
import {
  canUseInternalRecordingFinder,
  recordingDateFromTitle,
  recordingMatchesDate,
  safeTimeZone,
  selectStudentCandidate,
  type RecordingStudentCandidate,
} from "./internal-recording-policy";

type RecordingSearchActor = Pick<User, "id" | "role" | "timezone">;

export type RecordingSearchMatch = {
  sessionTitle: string;
  sessionDate: string;
  recordingUrl: string | null;
  recordingAvailable: boolean;
  studentName?: string | null;
  studentEmail?: string;
  pagePath: string;
};

export type RecordingSearchResult =
  | {
      status: "found";
      kind: "one_on_one" | "inner_circle";
      requestedDate: string | null;
      matches: RecordingSearchMatch[];
    }
  | {
      status: "student_not_found_or_not_assigned";
      kind: "one_on_one";
      studentQuery: string;
    }
  | {
      status: "ambiguous_student";
      kind: "one_on_one";
      candidates: Array<{ name: string | null; email: string }>;
    }
  | {
      status: "no_session";
      kind: "one_on_one" | "inner_circle";
      requestedDate: string | null;
      studentName?: string | null;
      studentEmail?: string;
      pagePath: string;
    }
  | { status: "forbidden" };

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function titleDatePatterns(date: string): string[] {
  const [year, month, day] = date.split("-");
  return [
    `%${year}${month}${day}%`,
    `%${year}-${month}-${day}%`,
    `%${year}_${month}_${day}%`,
    `%${month}/${day}/${year}%`,
    `%${month}-${day}-${year}%`,
  ];
}

/**
 * A broad UTC window is filtered again in application code using the staff
 * member's timezone and CMB's Toronto timezone. The extra title predicates
 * preserve imported ICGC history whose lesson date is encoded in its title.
 */
function dateWhere(date: string): SQL {
  const midnightUtc = new Date(`${date}T00:00:00.000Z`);
  const roughStart = new Date(midnightUtc.getTime() - 36 * 60 * 60 * 1000);
  const roughEnd = new Date(midnightUtc.getTime() + 60 * 60 * 60 * 1000);
  return or(
    and(
      gte(coachingSessions.createdAt, roughStart),
      lt(coachingSessions.createdAt, roughEnd),
    ),
    ...titleDatePatterns(date).map((pattern) =>
      ilike(coachingSessions.title, pattern),
    ),
  )!;
}

function humanDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: safeTimeZone(timeZone),
  }).format(date);
}

function titleDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T12:00:00.000Z`));
}

function toMatch(
  session: {
    title: string;
    recordingUrl: string | null;
    createdAt: Date;
  },
  actorTimeZone: string,
  pagePath: string,
  student?: RecordingStudentCandidate,
): RecordingSearchMatch {
  const recordingUrl = session.recordingUrl
    ? sanitizeRecordingUrl(session.recordingUrl)
    : null;
  const titleDate = recordingDateFromTitle(session.title);
  return {
    sessionTitle: session.title,
    sessionDate: titleDate
      ? titleDateLabel(titleDate)
      : humanDate(session.createdAt, actorTimeZone),
    recordingUrl,
    recordingAvailable: Boolean(recordingUrl),
    ...(student
      ? { studentName: student.name, studentEmail: student.email }
      : {}),
    pagePath,
  };
}

async function resolveStudent(
  actor: RecordingSearchActor,
  studentQuery: string,
) {
  const pattern = `%${escapeLike(studentQuery.trim())}%`;
  const scope =
    actor.role === "admin" ? undefined : studentAssignedToCoach(actor.id);
  const candidates = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.role, "student"),
        isNull(users.deletedAt),
        or(ilike(users.name, pattern), ilike(users.email, pattern)),
        scope,
      ),
    )
    .orderBy(asc(users.name), asc(users.email))
    .limit(12);

  return selectStudentCandidate(candidates, studentQuery);
}

export async function findOneOnOneRecordings(
  actor: RecordingSearchActor,
  input: { studentQuery: string; date?: string },
): Promise<RecordingSearchResult> {
  if (!canUseInternalRecordingFinder(actor.role)) {
    return { status: "forbidden" };
  }

  const resolution = await resolveStudent(actor, input.studentQuery);
  if (resolution.status === "not_found") {
    return {
      status: "student_not_found_or_not_assigned",
      kind: "one_on_one",
      studentQuery: input.studentQuery,
    };
  }
  if (resolution.status === "ambiguous") {
    return {
      status: "ambiguous_student",
      kind: "one_on_one",
      candidates: resolution.candidates.map(({ name, email }) => ({
        name,
        email,
      })),
    };
  }

  const student = resolution.student;
  const pagePath = `/coaching/one-on-one?student=${encodeURIComponent(student.email)}`;
  const where = and(
    eq(coachingSessions.type, "one_on_one"),
    ilike(coachingSessions.studentEmail, student.email),
    input.date ? dateWhere(input.date) : undefined,
  );
  const rows = await db
    .select({
      title: coachingSessions.title,
      recordingUrl: coachingSessions.recordingUrl,
      createdAt: coachingSessions.createdAt,
    })
    .from(coachingSessions)
    .where(where)
    .orderBy(desc(coachingSessions.createdAt))
    .limit(input.date ? 24 : 8);
  const matches = input.date
    ? rows.filter((row) =>
        recordingMatchesDate(row, input.date!, actor.timezone),
      )
    : rows;

  if (matches.length === 0) {
    return {
      status: "no_session",
      kind: "one_on_one",
      requestedDate: input.date ?? null,
      studentName: student.name,
      studentEmail: student.email,
      pagePath,
    };
  }

  return {
    status: "found",
    kind: "one_on_one",
    requestedDate: input.date ?? null,
    matches: matches.map((session) =>
      toMatch(session, actor.timezone, pagePath, student),
    ),
  };
}

export async function findIgcRecordings(
  actor: RecordingSearchActor,
  input: { date?: string },
): Promise<RecordingSearchResult> {
  if (!canUseInternalRecordingFinder(actor.role)) {
    return { status: "forbidden" };
  }

  const pagePath = "/coaching/inner-circle";
  const rows = await db
    .select({
      title: coachingSessions.title,
      recordingUrl: coachingSessions.recordingUrl,
      createdAt: coachingSessions.createdAt,
    })
    .from(coachingSessions)
    .where(
      and(
        eq(coachingSessions.type, "inner_circle"),
        input.date ? dateWhere(input.date) : undefined,
      ),
    )
    .orderBy(desc(coachingSessions.createdAt))
    .limit(input.date ? 24 : 8);
  const matches = input.date
    ? rows.filter((row) =>
        recordingMatchesDate(row, input.date!, actor.timezone),
      )
    : rows;

  if (matches.length === 0) {
    return {
      status: "no_session",
      kind: "inner_circle",
      requestedDate: input.date ?? null,
      pagePath,
    };
  }

  return {
    status: "found",
    kind: "inner_circle",
    requestedDate: input.date ?? null,
    matches: matches.map((session) =>
      toMatch(session, actor.timezone, pagePath),
    ),
  };
}
