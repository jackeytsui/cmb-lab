"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Types matching API response shapes
// ---------------------------------------------------------------------------

interface CourseTier {
  courseId: string;
  courseTitle: string;
  accessTier: "preview" | "full";
}

interface PatternPreview {
  fingerprint: string;
  courseNames: string[];
  courseTiers: CourseTier[];
  studentCount: number;
  studentEmails: string[];
  suggestedRoleName: string;
}

interface PreviewData {
  alreadyMigrated: boolean;
  existingRoleCount?: number;
  patterns?: PatternPreview[];
  totalStudents?: number;
  totalRolesToCreate?: number;
}

interface MigrationResult {
  migrated?: boolean;
  alreadyMigrated?: boolean;
  rolesCreated?: number;
  studentsAssigned?: number;
  error?: string;
  message?: string;
}

interface VerifyRow {
  studentId: string;
  email: string;
  directCourseIds: string[];
  resolvedCourseIds: string[];
  missingCourses: string[];
  featuresMissing: string[];
  status: "pass" | "fail";
}

interface VerifyResult {
  results: VerifyRow[];
  totalChecked: number;
  totalPassed: number;
  totalFailed: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MigrationPage() {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [migrationResult, setMigrationResult] =
    useState<MigrationResult | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState({
    preview: false,
    execute: false,
    verify: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmExecute, setConfirmExecute] = useState(false);
  const [expandedPatterns, setExpandedPatterns] = useState<Set<string>>(
    new Set()
  );

  // ---- Preview ----

  async function handlePreview() {
    setError(null);
    setLoading((l) => ({ ...l, preview: true }));
    try {
      const res = await fetch("/api/admin/migration");
      if (!res.ok) {
        if (res.status === 403) throw new Error("Forbidden -- admin access required");
        throw new Error(`Preview failed (${res.status})`);
      }
      const data: PreviewData = await res.json();
      setPreviewData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading((l) => ({ ...l, preview: false }));
    }
  }

  // ---- Execute ----

  async function handleExecute() {
    setError(null);
    setConfirmExecute(false);
    setLoading((l) => ({ ...l, execute: true }));
    try {
      const res = await fetch("/api/admin/migration", { method: "POST" });
      if (!res.ok) {
        if (res.status === 403) throw new Error("Forbidden -- admin access required");
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.message || body?.error || `Execute failed (${res.status})`
        );
      }
      const data: MigrationResult = await res.json();
      setMigrationResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execute failed");
    } finally {
      setLoading((l) => ({ ...l, execute: false }));
    }
  }

  // ---- Verify ----

  async function handleVerify() {
    setError(null);
    setLoading((l) => ({ ...l, verify: true }));
    try {
      const res = await fetch("/api/admin/migration?action=verify", {
        method: "POST",
      });
      if (!res.ok) {
        if (res.status === 403) throw new Error("Forbidden -- admin access required");
        throw new Error(`Verify failed (${res.status})`);
      }
      const data: VerifyResult = await res.json();
      setVerifyResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verify failed");
    } finally {
      setLoading((l) => ({ ...l, verify: false }));
    }
  }

  // ---- Toggle expanded student list ----

  function togglePattern(fingerprint: string) {
    setExpandedPatterns((prev) => {
      const next = new Set(prev);
      if (next.has(fingerprint)) next.delete(fingerprint);
      else next.add(fingerprint);
      return next;
    });
  }

  // Derived state
  const hasPatterns =
    previewData &&
    !previewData.alreadyMigrated &&
    previewData.patterns &&
    previewData.patterns.length > 0;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Migration Tool</h1>
        <p className="mt-2 text-zinc-400">
          Migrate existing courseAccess records to RBAC Legacy roles
        </p>
      </div>

      {/* Global error */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* ================================================================ */}
      {/* Step 1: Preview */}
      {/* ================================================================ */}
      <section className="mb-8">
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                1. Preview Migration
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Analyze courseAccess records and preview the Legacy roles that
                will be created
              </p>
            </div>
            <button
              onClick={handlePreview}
              disabled={loading.preview}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {loading.preview ? "Loading..." : "Load Preview"}
            </button>
          </div>

          {/* Existing Legacy role banner */}
          {previewData?.existingRoleCount !== undefined &&
            previewData.existingRoleCount > 0 && (
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm font-medium text-amber-300">
                  {previewData.existingRoleCount} Legacy role(s) already exist.
                  Execute is safe to re-run and will fill missing assignments.
                </p>
              </div>
            )}

          {/* No students to migrate */}
          {previewData &&
            !previewData.alreadyMigrated &&
            previewData.patterns?.length === 0 && (
              <div className="mt-4 rounded-lg border border-zinc-600 bg-zinc-700/50 p-4">
                <p className="text-sm text-zinc-300">
                  No student courseAccess records found. Nothing to migrate.
                </p>
              </div>
            )}

          {/* Pattern cards */}
          {hasPatterns && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-zinc-300">
                {previewData.totalRolesToCreate} role(s) will be created for{" "}
                {previewData.totalStudents} student(s)
              </p>
              {previewData.patterns!.map((pattern) => (
                <div
                  key={pattern.fingerprint}
                  className="rounded-lg border border-zinc-600 bg-zinc-700/50 p-4"
                >
                  <p className="font-semibold text-white">
                    {pattern.suggestedRoleName}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pattern.courseTiers.map((ct) => (
                      <span
                        key={ct.courseId}
                        className="inline-flex items-center rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400"
                      >
                        {ct.courseTitle} ({ct.accessTier})
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">
                    All 7 features will be granted
                  </p>
                  <div className="mt-2">
                    <button
                      onClick={() => togglePattern(pattern.fingerprint)}
                      className="text-xs text-zinc-400 underline hover:text-zinc-300"
                    >
                      {pattern.studentCount} student(s){" "}
                      {expandedPatterns.has(pattern.fingerprint)
                        ? "(hide)"
                        : "(show)"}
                    </button>
                    {expandedPatterns.has(pattern.fingerprint) && (
                      <ul className="mt-1 space-y-0.5">
                        {pattern.studentEmails.map((email) => (
                          <li
                            key={email}
                            className="text-xs text-zinc-400"
                          >
                            {email}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ================================================================ */}
      {/* Step 2: Execute */}
      {/* ================================================================ */}
      <section className="mb-8">
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                2. Execute Migration
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Create Legacy roles and assign students
              </p>
            </div>
            {!confirmExecute ? (
              <button
                onClick={() => setConfirmExecute(true)}
                disabled={!hasPatterns || loading.execute}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Execute Migration
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-300">
                  Create {previewData?.totalRolesToCreate} role(s) and assign{" "}
                  {previewData?.totalStudents} student(s)?
                </span>
                <button
                  onClick={handleExecute}
                  disabled={loading.execute}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {loading.execute ? "Migrating..." : "Confirm"}
                </button>
                <button
                  onClick={() => setConfirmExecute(false)}
                  className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Success result */}
          {migrationResult &&
            (migrationResult.migrated || migrationResult.alreadyMigrated) && (
              <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                <p className="text-sm font-medium text-green-400">
                  {migrationResult.alreadyMigrated
                    ? "Migration was already completed."
                    : `Migration complete. ${migrationResult.rolesCreated} role(s) created, ${migrationResult.studentsAssigned} student(s) assigned.`}
                </p>
              </div>
            )}

          {/* Error result */}
          {migrationResult?.error && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm text-red-400">
                {migrationResult.message || migrationResult.error}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ================================================================ */}
      {/* Step 3: Verify */}
      {/* ================================================================ */}
      <section>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                3. Verify Migration
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Compare courseAccess grants against resolved permissions for each
                student
              </p>
            </div>
            <button
              onClick={handleVerify}
              disabled={loading.verify}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {loading.verify ? "Verifying..." : "Run Verification"}
            </button>
          </div>

          {/* Verify results */}
          {verifyResult && (
            <div className="mt-4">
              {/* Summary bar */}
              <div
                className={`mb-4 rounded-lg border p-3 ${
                  verifyResult.totalFailed === 0
                    ? "border-green-500/30 bg-green-500/10"
                    : "border-red-500/30 bg-red-500/10"
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    verifyResult.totalFailed === 0
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {verifyResult.totalPassed}/{verifyResult.totalChecked}{" "}
                  students passed verification
                </p>
              </div>

              {/* No students to verify */}
              {verifyResult.totalChecked === 0 && (
                <p className="text-sm text-zinc-400">
                  No student courseAccess records found. Nothing to verify.
                </p>
              )}

              {/* Results table */}
              {verifyResult.results.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700 text-left">
                        <th className="px-3 py-2 text-zinc-400">Email</th>
                        <th className="px-3 py-2 text-zinc-400">
                          Direct Courses
                        </th>
                        <th className="px-3 py-2 text-zinc-400">
                          Resolved Courses
                        </th>
                        <th className="px-3 py-2 text-zinc-400">Missing</th>
                        <th className="px-3 py-2 text-zinc-400">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verifyResult.results.map((row) => (
                        <tr
                          key={row.studentId}
                          className="border-b border-zinc-700/50"
                        >
                          <td className="px-3 py-2 text-zinc-300">
                            {row.email}
                          </td>
                          <td className="px-3 py-2 text-zinc-400">
                            {row.directCourseIds.length}
                          </td>
                          <td className="px-3 py-2 text-zinc-400">
                            {row.resolvedCourseIds.length}
                          </td>
                          <td className="px-3 py-2 text-zinc-400">
                            {row.missingCourses.length > 0
                              ? row.missingCourses.join(", ")
                              : "--"}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                row.status === "pass"
                                  ? "bg-green-500/10 text-green-400"
                                  : "bg-red-500/10 text-red-400"
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
