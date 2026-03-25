"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, Keyboard, MessageSquare, BookOpen } from "lucide-react";

interface StudentReport {
  id: string;
  name: string | null;
  email: string | null;
  typing: { done: number; total: number };
  scripts: { done: number; total: number };
  passages: { done: number; total: number };
  overallPct: number;
}

interface ReportData {
  students: StudentReport[];
  totals: { typing: number; scripts: number; passages: number };
  studentCount: number;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-cyan-500" : "bg-muted"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {value}/{max}
      </span>
    </div>
  );
}

export default function LtoReportClient() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/accelerator/reports");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  if (loading) {
    return <p className="text-muted-foreground text-sm py-8">Loading report...</p>;
  }

  if (!data || data.students.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">
          No LTO students found. Students need the <code className="text-xs bg-muted px-1 py-0.5 rounded">LTO_student</code> tag.
        </p>
      </div>
    );
  }

  const avgCompletion =
    data.students.length > 0
      ? Math.round(
          data.students.reduce((s, st) => s + st.overallPct, 0) /
            data.students.length
        )
      : 0;

  const completedStudents = data.students.filter(
    (s) => s.overallPct >= 100
  ).length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Users className="w-4 h-4" />
            LTO Students
          </div>
          <p className="text-2xl font-bold text-foreground">
            {data.studentCount}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Keyboard className="w-4 h-4" />
            Typing Items
          </div>
          <p className="text-2xl font-bold text-foreground">
            {data.totals.typing}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <MessageSquare className="w-4 h-4" />
            Script Lines
          </div>
          <p className="text-2xl font-bold text-foreground">
            {data.totals.scripts}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <BookOpen className="w-4 h-4" />
            Passages
          </div>
          <p className="text-2xl font-bold text-foreground">
            {data.totals.passages}
          </p>
        </div>
      </div>

      {/* Aggregate stats */}
      <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Average completion rate
          </p>
          <p className="text-xl font-bold text-foreground">{avgCompletion}%</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Fully completed</p>
          <p className="text-xl font-bold text-foreground">
            {completedStudents}/{data.studentCount}
          </p>
        </div>
      </div>

      {/* Student table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Student
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Typing
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Scripts
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Passages
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Overall
                </th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((student) => (
                <tr
                  key={student.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-foreground">
                        {student.name || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {student.email || "—"}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ProgressBar
                      value={student.typing.done}
                      max={student.typing.total}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <ProgressBar
                      value={student.scripts.done}
                      max={student.scripts.total}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <ProgressBar
                      value={student.passages.done}
                      max={student.passages.total}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        student.overallPct >= 100
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          : student.overallPct > 0
                            ? "bg-cyan-500/10 text-cyan-500 border border-cyan-500/20"
                            : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {student.overallPct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
