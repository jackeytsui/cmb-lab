"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Mail, Send, Copy, CheckCircle2, AlertTriangle, Upload, ChevronDown } from "lucide-react";

type InviteResponse = {
  summary: { action: string; total: number; succeeded: number; failed: number };
  results: Array<{ email: string; success: boolean; error?: string; message?: string }>;
};

type InviteCsvRecord = {
  firstName: string;
  lastName: string;
  email: string;
  role?: string;
  tags?: string[];
  courseEndDate?: string;
};

const STORAGE_KEYS = {
  subject: "cmb.invitation.subject.v2",
  body: "cmb.invitation.body.v2",
};

const DEFAULT_SUBJECT = "Welcome to Canto to Mando Lab - Your Access Is Ready";
const DEFAULT_BODY = `Hi {{first_name}},

Welcome to Canto to Mando Lab, a new learning experience the CMB team has been creating internally to give you a smoother, smarter Chinese learning experience.

This is a beta test version, and we are inviting you to try it out for fun.

Here is the link to access:
{{portal_link}}

Simply use your email address to log in. You can continue with Google or receive a one-time password (OTP) by email.

On first login, you will see an onboarding walkthrough automatically.

Hope you enjoy it, and we would really appreciate your comments and feedback.

Our team is also working on more new features on top of this, so thank you in advance.

Best,
Jackey
Head of Operations`;

function parseEmailList(input: string) {
  const emails = input
    .split(/[\n,;\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(emails));
}

function parseCsvText(csvText: string): InviteCsvRecord[] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current.trim());
      current = "";
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  if (rows.length === 0) return [];

  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const firstNameIndex = header.findIndex((h) => h === "first name" || h === "first_name" || h === "firstname");
  const lastNameIndex = header.findIndex((h) => h === "last name" || h === "last_name" || h === "lastname");
  const emailIndex = header.findIndex((h) => h === "email" || h === "email address" || h === "email_address" || h === "emailaddress");
  const roleIndex = header.findIndex((h) => h === "role");
  const tagsIndex = header.findIndex((h) => h === "tags" || h === "tag");
  const courseEndDateIndex = header.findIndex(
    (h) =>
      h === "course end date" ||
      h === "course_end_date" ||
      h === "courseenddate"
  );

  if (
    [firstNameIndex, lastNameIndex, emailIndex, roleIndex, tagsIndex, courseEndDateIndex].some(
      (index) => index < 0
    )
  ) {
    throw new Error(
      "CSV headers must include: first name, last name, email address, role, tags, course end date"
    );
  }

  const results: InviteCsvRecord[] = [];
  const invalidRows: number[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    const email = (cells[emailIndex] || "").trim().toLowerCase();
    if (!email) continue;
    const firstName = (cells[firstNameIndex] || "").trim();
    const lastName = (cells[lastNameIndex] || "").trim();
    if (!firstName || !lastName) {
      invalidRows.push(i + 1);
      continue;
    }
    const tags = (cells[tagsIndex] || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    results.push({
      firstName,
      lastName,
      email,
      role: (cells[roleIndex] || "").trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      courseEndDate: (cells[courseEndDateIndex] || "").trim() || undefined,
    });
  }

  if (invalidRows.length > 0) {
    throw new Error(`Missing first name or last name in CSV row(s): ${invalidRows.join(", ")}`);
  }

  const uniqueByEmail = new Map<string, InviteCsvRecord>();
  for (const item of results) {
    uniqueByEmail.set(item.email, item);
  }
  return Array.from(uniqueByEmail.values());
}

function buildTemplateHtml(subject: string, body: string) {
  const safeBody = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7fb;font-family:Inter,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 8px 24px;">
                <img src="/canto-to-mando-logo.png" alt="Canto to Mando Blueprint" width="180" style="display:block;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 8px 24px;">
                <h1 style="margin:0;font-size:22px;line-height:1.3;">${subject}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 24px 24px;font-size:15px;line-height:1.7;color:#374151;">
                ${safeBody}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function StudentInvitePanel({
  defaultCollapsed = true,
}: {
  defaultCollapsed?: boolean;
}) {
  const [emailsInput, setEmailsInput] = useState("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<InviteResponse | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [error, setError] = useState<string | null>(null);
  const [csvRecords, setCsvRecords] = useState<InviteCsvRecord[]>([]);
  const [htmlEditorValue, setHtmlEditorValue] = useState("");
  const [isHtmlEdited, setIsHtmlEdited] = useState(false);
  const [activeAction, setActiveAction] = useState<
    "upload_only" | "upload_and_invite" | "resend_invite" | "remove_access" | ""
  >("");
  const [sendInviteEmails, setSendInviteEmails] = useState(false);
  const [batchRole, setBatchRole] = useState<"" | "student" | "coach" | "admin">("student");
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [previewEmail, setPreviewEmail] = useState("");
  const [previewFirstName, setPreviewFirstName] = useState("");
  const [previewLastName, setPreviewLastName] = useState("");

  const parsedEmails = useMemo(() => parseEmailList(emailsInput), [emailsInput]);
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "") ||
    "http://localhost:3000";
  const signInUrl = `${appUrl.replace(/\/$/, "")}/sign-in`;

  const draftHtml = useMemo(
    () => buildTemplateHtml(subject, body.replaceAll("{{portal_link}}", signInUrl)),
    [subject, body, signInUrl]
  );
  const previewStudentName = `${previewFirstName} ${previewLastName}`.trim();
  const previewHtml = useMemo(() => {
    const source = htmlEditorValue || draftHtml;
    return source
      .replaceAll("{{first_name}}", previewFirstName || "Student")
      .replaceAll("{{last_name}}", previewLastName || "")
      .replaceAll("{{student_name}}", previewStudentName || previewEmail || "Student")
      .replaceAll("{{portal_link}}", signInUrl);
  }, [
    draftHtml,
    htmlEditorValue,
    previewEmail,
    previewFirstName,
    previewLastName,
    previewStudentName,
    signInUrl,
  ]);

  useEffect(() => {
    if (!isHtmlEdited) {
      setHtmlEditorValue(draftHtml);
    }
  }, [draftHtml, isHtmlEdited]);

  useEffect(() => {
    const savedSubject = window.localStorage.getItem(STORAGE_KEYS.subject);
    const savedBody = window.localStorage.getItem(STORAGE_KEYS.body);
    if (savedSubject) setSubject(savedSubject);
    if (savedBody) setBody(savedBody);
  }, []);

  useEffect(() => {
    if (!previewEmail) return;
    const match = csvRecords.find((record) => record.email === previewEmail.toLowerCase());
    if (match) {
      setPreviewFirstName(match.firstName ?? "");
      setPreviewLastName(match.lastName ?? "");
      return;
    }
    const local = previewEmail.split("@")[0] ?? "";
    const tokens = local
      .split(/[._-]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (tokens.length > 0 && !previewFirstName) {
      setPreviewFirstName(tokens[0].charAt(0).toUpperCase() + tokens[0].slice(1));
    }
    if (tokens.length > 1 && !previewLastName) {
      setPreviewLastName(tokens[1].charAt(0).toUpperCase() + tokens[1].slice(1));
    }
  }, [csvRecords, previewEmail, previewFirstName, previewLastName]);

  const handleRunAction = async (
    action: "upload_only" | "upload_and_invite" | "resend_invite" | "remove_access"
  ) => {
    setError(null);
    setResult(null);
    setActiveAction(action);

    if (parsedEmails.length === 0 && csvRecords.length === 0) {
      setError("Please add at least one valid email.");
      return;
    }
    if ((action === "upload_only" || action === "upload_and_invite") && csvRecords.length === 0) {
      setError("Upload actions require CSV with first name, last name, and email for each user.");
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEYS.subject, subject);
      window.localStorage.setItem(STORAGE_KEYS.body, body);
    }

    setIsSending(true);
    try {
      const response = await fetch("/api/admin/students/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(csvRecords.length > 0 ? { records: csvRecords } : { emails: parsedEmails }),
          batchRole: batchRole || undefined,
          redirectUrl: signInUrl,
          expiresInDays: 14,
          ...(action === "upload_and_invite" || action === "resend_invite"
            ? {
                invitationEmail: {
                  subject,
                  body,
                  html: htmlEditorValue || draftHtml,
                },
              }
            : {}),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to send invitations");
      }
      setResult(data as InviteResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invitations");
    } finally {
      setIsSending(false);
      setActiveAction("");
    }
  };

  const handleCopyHtml = async () => {
    await navigator.clipboard.writeText(htmlEditorValue || draftHtml);
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 1200);
  };

  const handleCsvUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);

    try {
      const text = await file.text();
      const parsed = parseCsvText(text);
      if (parsed.length === 0) {
        throw new Error("No valid rows found in CSV.");
      }
      setCsvRecords(parsed);
      setEmailsInput(parsed.map((row) => row.email).join("\n"));
    } catch (err) {
      setCsvRecords([]);
      setError(err instanceof Error ? err.message : "Failed to parse CSV.");
    }
  };

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5">
      <button
        type="button"
        onClick={() => setIsCollapsed((value) => !value)}
        className="mb-3 flex w-full items-start justify-between gap-3 text-left"
      >
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Mail className="h-4 w-4" />
            Invitation And Access Tools
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload users, assign role, send invites, or resend/disable access.
          </p>
        </div>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-180"}`}
        />
      </button>

      {!isCollapsed ? <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">
            1) Bulk Upload Users (CSV columns: first name, last name, email address, role, tags, course end date)
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground hover:bg-accent hover:text-accent-foreground">
            <Upload className="h-3.5 w-3.5" />
            Upload CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleCsvUpload}
            />
          </label>
          {csvRecords.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              CSV loaded: {csvRecords.length} row{csvRecords.length === 1 ? "" : "s"} ready.
            </p>
          ) : null}

          <label className="block text-xs font-medium text-muted-foreground">
            User Emails (comma/new-line separated)
          </label>
          <textarea
            value={emailsInput}
            onChange={(e) => setEmailsInput(e.target.value)}
            rows={8}
            placeholder="student1@example.com&#10;student2@example.com"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          <p className="text-xs text-muted-foreground">
            {parsedEmails.length} unique email{parsedEmails.length === 1 ? "" : "s"} detected
          </p>
          <label className="block text-xs font-medium text-muted-foreground">
            Batch Role (applies to upload/invite)
          </label>
          <select
            value={batchRole}
            onChange={(e) => setBatchRole(e.target.value as "" | "student" | "coach" | "admin")}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <option value="student">Student</option>
            <option value="coach">Coach</option>
            <option value="admin">Admin</option>
          </select>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sendInviteEmails}
                onChange={(e) => setSendInviteEmails(e.target.checked)}
                className="rounded border-border"
              />
              Send invitation emails
            </label>
            <button
              type="button"
              onClick={() => handleRunAction(sendInviteEmails ? "upload_and_invite" : "upload_only")}
              disabled={isSending || csvRecords.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendInviteEmails && <Send className="h-4 w-4" />}
              {isSending && (activeAction === "upload_only" || activeAction === "upload_and_invite")
                ? "Processing..."
                : sendInviteEmails
                  ? "Upload + Send Invites"
                  : "Upload Only"}
            </button>
            <button
              type="button"
              onClick={() => handleRunAction("resend_invite")}
              disabled={isSending || (csvRecords.length === 0 && parsedEmails.length === 0)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSending && activeAction === "resend_invite" ? "Running..." : "Resend Invite Only"}
            </button>
            <button
              type="button"
              onClick={() => handleRunAction("remove_access")}
              disabled={isSending || (csvRecords.length === 0 && parsedEmails.length === 0)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSending && activeAction === "remove_access" ? "Running..." : "Remove Access"}
            </button>
          </div>
          {error ? (
            <p className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              {error}
            </p>
          ) : null}
          {result ? (
            <div className="rounded-lg border border-border bg-background/70 px-3 py-2 text-xs text-foreground">
              Action: <span className="font-medium">{result.summary.action}</span>. Success {result.summary.succeeded}/{result.summary.total}, Failed {result.summary.failed}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">
            2) Invitation Email Template (optional, only when you choose send invitation)
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Invitation Email Subject (brand draft)
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          <label className="block text-xs font-medium text-muted-foreground">
            Invitation Email Body (editable draft)
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
            Use placeholders: <code>{"{{first_name}}"}</code>, <code>{"{{last_name}}"}</code>, <code>{"{{student_name}}"}</code>, <code>{"{{portal_link}}"}</code>
            </p>
          </div>
          <label className="block text-xs font-medium text-muted-foreground">
            HTML Editor
          </label>
          <textarea
            value={htmlEditorValue}
            onChange={(e) => {
              setHtmlEditorValue(e.target.value);
              setIsHtmlEdited(true);
            }}
            rows={10}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setHtmlEditorValue(draftHtml);
                setIsHtmlEdited(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Reset HTML
            </button>
            <button
              type="button"
              onClick={handleCopyHtml}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {copyState === "copied" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copyState === "copied" ? "Copied" : "Copy HTML"}
            </button>
          </div>
          <label className="block text-xs font-medium text-muted-foreground">
            HTML Preview
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              type="email"
              value={previewEmail}
              onChange={(e) => setPreviewEmail(e.target.value.trim().toLowerCase())}
              placeholder="Preview email"
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <input
              type="text"
              value={previewFirstName}
              onChange={(e) => setPreviewFirstName(e.target.value)}
              placeholder="First name"
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <input
              type="text"
              value={previewLastName}
              onChange={(e) => setPreviewLastName(e.target.value)}
              placeholder="Last name"
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>
          <iframe
            title="Invitation email preview"
            srcDoc={previewHtml}
            className="h-64 w-full rounded-lg border border-border bg-white"
          />
          <p className="text-xs text-muted-foreground">
            This template is now sent directly from Admin Portal for invite actions.
          </p>
        </div>
      </div> : null}
    </section>
  );
}
