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
    title: "Users & Access",
    items: [
      { id: "user-access", title: "User Management", href: "/admin/users", description: "Manage students, bulk operations, and enrollment." },
      { id: "tag-access", title: "Tag Management", href: "/admin/tag-access", description: "Create, edit, and manage tags and their feature/content access grants." },
      { id: "roles", title: "Roles & Permissions", href: "/admin/roles", description: "Design role templates and feature grants." },
      { id: "api-keys", title: "API Keys", href: "/admin/api-keys", description: "Create and revoke integration keys." },
    ],
  },
  {
    id: "content",
    title: "Content",
    items: [
      { id: "courses", title: "Courses", href: "/admin/courses", description: "Manage courses, modules, lessons, and publication." },
      { id: "course-library", title: "Course Library", href: "/admin/course-library", description: "Build the student-facing course roadmap, modules, and lessons." },
      { id: "exercises", title: "Exercises", href: "/admin/exercises", description: "Practice bank and assignment flows." },
      { id: "audio-course", title: "Audio Course", href: "/admin/audio-course", description: "Manage audio series. Check 'Extra Pack' to make a series appear in Audio Accelerator Edition." },
      { id: "video-uploads", title: "Video Uploads", href: "/admin/content", description: "Upload and assign video/media assets." },
      { id: "accelerator", title: "Mandarin Accelerator", href: "/admin/accelerator/typing", description: "Typing drills, conversation scripts, and curated passages for LTO students." },
      { id: "tone-mastery", title: "Tone Mastery Clips", href: "/admin/accelerator-extra/tone-mastery", description: "Upload and manage video clips for the Advanced Tone Mastery System." },
      { id: "internal-docs", title: "Internal Docs", href: "/admin/internal-docs", description: "Rich-text internal documentation for admin and team reference." },
      { id: "assignment-submissions", title: "Assignment Submissions", href: "/admin/content/assignment-submissions", description: "Review and grade student assignment submissions." },
      { id: "coaching-schedule", title: "Group Coaching Schedule", href: "/admin/coaching-schedule", description: "Publish live sessions and target them to package tags." },
    ],
  },
  {
    id: "lab-assistant",
    title: "CMB Lab Assistant",
    widget: "lab-assistant",
  },
  {
    id: "ai",
    title: "AI & Knowledge",
    items: [
      { id: "knowledge-base", title: "Knowledge Base", href: "/admin/knowledge", description: "Manage KB entries for AI chatbot." },
      { id: "ai-prompts", title: "AI Prompts", href: "/admin/prompts", description: "Production prompts with versioning and rollback." },
      { id: "prompt-lab", title: "Prompt Lab", href: "/admin/prompt-lab", description: "Test and compare prompts before rollout." },
    ],
  },
  {
    id: "ops",
    title: "Operations",
    items: [
      { id: "analytics", title: "Analytics", href: "/admin/analytics", description: "Completion rates, engagement, and at-risk students." },
      { id: "ai-logs", title: "AI Logs", href: "/admin/ai-logs", description: "Inspect model calls and errors." },
      { id: "ghl", title: "GHL Integration", href: "/admin/ghl", description: "CRM sync, field mappings, and webhook events." },
      { id: "dev-toolkit", title: "Dev Toolkit", href: "/admin/dev-toolkit", description: "Launch checklist and operational shortcuts." },
      { id: "migration", title: "Migration", href: "/admin/migration", description: "Access migration and attribution tools." },
    ],
  },
];

/** Sections and items visible to coaches */
const COACH_SECTION_IDS = new Set(["view-as", "access", "ops"]);
const COACH_ITEM_IDS = new Set(["user-access", "analytics"]);

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
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-8 border-b border-border/70 pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Administration
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Admin workspace
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {isAdmin
                ? "Manage people, learning content, integrations, and system health from one place."
                : "Review students, check analytics, and preview the portal as a learner."}
            </p>
          </div>
          <div className="inline-flex w-fit items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
            {isAdmin ? "Administrator access" : "Coach access"}
          </div>
        </div>
      </header>

      <AdminManageGrid sections={sections} />
    </div>
  );
}
