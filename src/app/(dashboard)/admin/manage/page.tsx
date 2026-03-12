import Link from "next/link";
import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { ViewAsPanel } from "@/components/admin/ViewAsPanel";

type PortalItem = {
  title: string;
  href: string;
  description: string;
};

const ACCESS_ITEMS: PortalItem[] = [
  { title: "User Access", href: "/admin/users", description: "Bulk manage users, tags, and enrollment access." },
  { title: "Users", href: "/admin/users?tab=users", description: "Manage all user accounts and non-student roles." },
  { title: "Roles", href: "/admin/roles", description: "Design role templates and feature permissions." },
  { title: "API Keys", href: "/admin/api-keys", description: "Create and revoke integration keys." },
];

const CONTENT_ITEMS: PortalItem[] = [
  { title: "Courses", href: "/admin/courses", description: "Manage courses, modules, lessons, and publication." },
  { title: "Exercises", href: "/admin/exercises", description: "Practice bank and assignment flows." },
  { title: "Audio Course (Preview)", href: "/admin/audio-course", description: "Admin-only preview for HelloAudio and podcast links." },
  { title: "Content", href: "/admin/content", description: "Upload and assign video/media assets." },
  { title: "Knowledge Base", href: "/admin/knowledge", description: "Update KB entries used by AI assistants." },
  { title: "AI Prompts", href: "/admin/prompts", description: "Control production prompts and versions." },
  { title: "Prompt Lab", href: "/admin/prompt-lab", description: "Test prompts before rollout." },
];

const OPS_ITEMS: PortalItem[] = [
  { title: "Analytics", href: "/admin/analytics", description: "View performance, completion, and risk trends." },
  { title: "AI Logs", href: "/admin/ai-logs", description: "Inspect model calls and operational errors." },
  { title: "GHL Settings", href: "/admin/ghl", description: "CRM synchronization and field mappings." },
  { title: "Dev Toolkit", href: "/admin/dev-toolkit", description: "Launch checklist and operational shortcuts." },
  { title: "Migration", href: "/admin/migration", description: "Run migration and access-attribution tools." },
];

function Section({ title, items }: { title: string; items: PortalItem[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-lg border border-border/70 bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <p className="text-sm font-semibold text-foreground">{item.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function AdminManagePortalPage() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Admin Manage Portal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Central command center for admin operations, security, and content governance.
        </p>
      </div>

      <div className="space-y-4">
        <ViewAsPanel />
        <Section title="Access & Security" items={ACCESS_ITEMS} />
        <Section title="Content & Learning Stack" items={CONTENT_ITEMS} />
        <Section title="Operations & Diagnostics" items={OPS_ITEMS} />
      </div>
    </div>
  );
}
