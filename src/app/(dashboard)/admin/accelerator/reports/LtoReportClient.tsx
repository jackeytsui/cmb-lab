"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  Keyboard,
  MessageSquare,
  BookOpen,
  Music,
  Ear,
  CheckCircle2,
  Clock,
  TrendingUp,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProgressPair {
  done: number;
  total: number;
}

interface StudentReport {
  id: string;
  name: string | null;
  email: string | null;
  typing: ProgressPair;
  scripts: ProgressPair;
  passages: ProgressPair;
  practicePlan: boolean;
  starterPack: boolean;
  typingKit: boolean;
  tone: ProgressPair | null;
  listening: ProgressPair | null;
  overallPct: number;
  lastActivityAt: string | null;
}

interface ReportData {
  students: StudentReport[];
  totals: {
    typing: number;
    scripts: number;
    passages: number;
    toneClips: number;
    listeningQs: number;
  };
  studentCount: number;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-14 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-cyan-500" : "bg-muted",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
        {value}/{max}
      </span>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className={cn("flex items-center gap-2 text-sm mb-1", color ?? "text-muted-foreground")}>
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {subtext && <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function exportCsv(students: StudentReport[]) {
  const headers = [
    "Name", "Email", "Practice Plan", "Starter Pack", "Typing Kit",
    "Typing Progress", "Scripts Progress", "Passages Progress",
    "Tone Mastery", "Listening Training", "Overall %", "Last Activity",
  ];
  const rows = students.map((s) => [
    s.name ?? "",
    s.email ?? "",
    s.practicePlan ? "Yes" : "No",
    s.starterPack ? "Yes" : "No",
    s.typingKit ? "Yes" : "No",
    `${s.typing.done}/${s.typing.total}`,
    `${s.scripts.done}/${s.scripts.total}`,
    `${s.passages.done}/${s.passages.total}`,
    s.tone ? `${s.tone.done}/${s.tone.total}` : "N/A",
    s.listening ? `${s.listening.done}/${s.listening.total}` : "N/A",
    `${s.overallPct}%`,
    s.lastActivityAt ? new Date(s.lastActivityAt).toLocaleString() : "Never",
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lto-progress-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
      <div className="space-y-6">
        {/* Show empty state with summary cards at zero */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<Users className="w-4 h-4" />} label="LTO Students" value={0} />
          <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Avg Completion" value="0%" />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Fully Completed" value="0" />
          <StatCard icon={<Clock className="w-4 h-4" />} label="Active Today" value="0" />
        </div>

        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            No LTO students found. Students need the{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">LTO_student</code> tag.
          </p>
        </div>

        {/* Content overview even without students */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard icon={<Keyboard className="w-4 h-4" />} label="Typing Items" value={data?.totals.typing ?? 0} />
          <StatCard icon={<MessageSquare className="w-4 h-4" />} label="Script Lines" value={data?.totals.scripts ?? 0} />
          <StatCard icon={<BookOpen className="w-4 h-4" />} label="Passages" value={data?.totals.passages ?? 0} />
          <StatCard icon={<Music className="w-4 h-4" />} label="Tone Clips" value={data?.totals.toneClips ?? 0} />
          <StatCard icon={<Ear className="w-4 h-4" />} label="Listening Qs" value={data?.totals.listeningQs ?? 0} />
        </div>
      </div>
    );
  }

  const avgCompletion =
    data.students.length > 0
      ? Math.round(data.students.reduce((s, st) => s + st.overallPct, 0) / data.students.length)
      : 0;

  const completedStudents = data.students.filter((s) => s.overallPct >= 100).length;
  const activeToday = data.students.filter((s) => {
    if (!s.lastActivityAt) return false;
    const d = new Date(s.lastActivityAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;
  const inactiveStudents = data.students.filter((s) => {
    if (!s.lastActivityAt) return true;
    const diffDays = Math.floor((Date.now() - new Date(s.lastActivityAt).getTime()) / 86400000);
    return diffDays > 7;
  }).length;

  const hasAnyTone = data.students.some((s) => s.tone !== null);
  const hasAnyListening = data.students.some((s) => s.listening !== null);

  return (
    <div className="space-y-6">
      {/* Top summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Users className="w-4 h-4" />} label="LTO Students" value={data.studentCount} />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Avg Completion"
          value={`${avgCompletion}%`}
          color={avgCompletion >= 80 ? "text-emerald-500" : avgCompletion >= 40 ? "text-cyan-500" : "text-muted-foreground"}
        />
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Fully Completed"
          value={`${completedStudents}/${data.studentCount}`}
          color={completedStudents > 0 ? "text-emerald-500" : "text-muted-foreground"}
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="Active Today"
          value={activeToday}
          subtext={inactiveStudents > 0 ? `${inactiveStudents} inactive (7d+)` : undefined}
        />
      </div>

      {/* Content totals */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard icon={<Keyboard className="w-4 h-4" />} label="Typing Items" value={data.totals.typing} />
        <StatCard icon={<MessageSquare className="w-4 h-4" />} label="Script Lines" value={data.totals.scripts} />
        <StatCard icon={<BookOpen className="w-4 h-4" />} label="Passages" value={data.totals.passages} />
        <StatCard icon={<Music className="w-4 h-4" />} label="Tone Clips" value={data.totals.toneClips} />
        <StatCard icon={<Ear className="w-4 h-4" />} label="Listening Qs" value={data.totals.listeningQs} />
      </div>

      {/* Student table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
          <h3 className="text-sm font-semibold text-foreground">Student Progress</h3>
          <button
            type="button"
            onClick={() => exportCsv(data.students)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Student</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground whitespace-nowrap text-[11px]">Plan</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground whitespace-nowrap text-[11px]">Starter</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground whitespace-nowrap text-[11px]">Kit</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground whitespace-nowrap text-[11px]">Typing</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground whitespace-nowrap text-[11px]">Scripts</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground whitespace-nowrap text-[11px]">Passages</th>
                {hasAnyTone && <th className="text-left px-2 py-2 font-medium text-muted-foreground whitespace-nowrap text-[11px]">Tone</th>}
                {hasAnyListening && <th className="text-left px-2 py-2 font-medium text-muted-foreground whitespace-nowrap text-[11px]">Listen</th>}
                <th className="text-center px-2 py-2 font-medium text-muted-foreground whitespace-nowrap text-[11px]">Overall</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground whitespace-nowrap text-[11px]">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((student) => (
                <tr key={student.id} className="border-b border-border last:border-0 hover:bg-accent/30">
                  <td className="px-3 py-2">
                    <div>
                      <p className="font-medium text-foreground text-xs">{student.name || "—"}</p>
                      <p className="text-[11px] text-muted-foreground">{student.email || "—"}</p>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {student.practicePlan ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {student.starterPack ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {student.typingKit ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <ProgressBar value={student.typing.done} max={student.typing.total} />
                  </td>
                  <td className="px-2 py-2">
                    <ProgressBar value={student.scripts.done} max={student.scripts.total} />
                  </td>
                  <td className="px-2 py-2">
                    <ProgressBar value={student.passages.done} max={student.passages.total} />
                  </td>
                  {hasAnyTone && (
                    <td className="px-2 py-2">
                      {student.tone ? (
                        <ProgressBar value={student.tone.done} max={student.tone.total} />
                      ) : (
                        <span className="text-[11px] text-muted-foreground/40">—</span>
                      )}
                    </td>
                  )}
                  {hasAnyListening && (
                    <td className="px-2 py-2">
                      {student.listening ? (
                        <ProgressBar value={student.listening.done} max={student.listening.total} />
                      ) : (
                        <span className="text-[11px] text-muted-foreground/40">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-2 py-2 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                        student.overallPct >= 100
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          : student.overallPct > 0
                            ? "bg-cyan-500/10 text-cyan-500 border border-cyan-500/20"
                            : "bg-muted text-muted-foreground border border-border",
                      )}
                    >
                      {student.overallPct}%
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span className={cn(
                      "text-[11px]",
                      student.lastActivityAt ? "text-foreground" : "text-muted-foreground/50",
                    )}>
                      {formatDate(student.lastActivityAt)}
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
