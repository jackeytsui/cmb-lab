import { redirect } from "next/navigation";
import { hasMinimumRole, checkRole } from "@/lib/auth";
import { AdminManageGrid, type PortalSection } from "@/components/admin/AdminManageGrid";

const allSections: PortalSection[] = [
  {
    id: "view-as",
    title: "View As User",
    widget: "view-as",
  },
  {
    id: "transcript-limits",
    title: "YouTube Transcript Usage Limits",
    widget: "transcript-limits",
  },
  {
    id: "access",
    title: "Access & Security",
    items: [
      { id: "user-access", title: "User Access", href: "/admin/users", description: "Bulk manage users, tags, and enrollment access." },
      { id: "users", title: "Users", href: "/admin/users?tab=users", description: "Manage all user accounts and non-student roles." },
      { id: "roles", title: "Roles", href: "/admin/roles", description: "Design role templates and feature permissions." },
      { id: "api-keys", title: "API Keys", href: "/admin/api-keys", description: "Create and revoke integration keys." },
    ],
  },
  {
    id: "content",
    title: "Content & Learning Stack",
    items: [
      { id: "courses", title: "Courses", href: "/admin/courses", description: "Manage courses, modules, lessons, and publication." },
      { id: "exercises", title: "Exercises", href: "/admin/exercises", description: "Practice bank and assignment flows." },
      { id: "audio-course", title: "Audio Course (Preview)", href: "/admin/audio-course", description: "Admin-only preview for HelloAudio and podcast links." },
      { id: "content-mgmt", title: "Content", href: "/admin/content", description: "Upload and assign video/media assets." },
      { id: "knowledge-base", title: "Knowledge Base", href: "/admin/knowledge", description: "Update KB entries used by AI assistants." },
      { id: "ai-prompts", title: "AI Prompts", href: "/admin/prompts", description: "Control production prompts and versions." },
      { id: "prompt-lab", title: "Prompt Lab", href: "/admin/prompt-lab", description: "Test prompts before rollout." },
    ],
  },
  {
    id: "ops",
    title: "Operations & Diagnostics",
    items: [
      { id: "analytics", title: "Analytics", href: "/admin/analytics", description: "View performance, completion, and risk trends." },
      { id: "ai-logs", title: "AI Logs", href: "/admin/ai-logs", description: "Inspect model calls and operational errors." },
      { id: "ghl", title: "GHL Settings", href: "/admin/ghl", description: "CRM synchronization and field mappings." },
      { id: "dev-toolkit", title: "Dev Toolkit", href: "/admin/dev-toolkit", description: "Launch checklist and operational shortcuts." },
      { id: "migration", title: "Migration", href: "/admin/migration", description: "Run migration and access-attribution tools." },
    ],
  },
];

/** Sections and items visible to coaches */
const COACH_SECTION_IDS = new Set(["view-as", "access", "ops"]);
const COACH_ITEM_IDS = new Set(["user-access", "users", "analytics"]);

function filterForCoach(sections: PortalSection[]): PortalSection[] {
  return sections
    .filter((s) => COACH_SECTION_IDS.has(s.id))
    .map((s) => {
      if (s.widget) return s; // widgets pass through
      return {
        ...s,
        items: s.items?.filter((item) => COACH_ITEM_IDS.has(item.id)),
      };
    })
    .filter((s) => s.widget || (s.items && s.items.length > 0));
}

export default async function AdminManagePortalPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const isAdmin = await checkRole("admin");
  const sections = isAdmin ? allSections : filterForCoach(allSections);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Admin Manage Portal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAdmin
            ? "Central command center for admin operations, security, and content governance."
            : "Coach portal — view students, analytics, and impersonate users."}
        </p>
      </div>

      <div className="space-y-4">
        <AdminManageGrid sections={sections} />
      </div>
    </div>
  );
}
