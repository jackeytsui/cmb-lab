import Link from "next/link";
import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";

type ToolItem = {
  title: string;
  href: string;
  description: string;
};

const TOOL_ITEMS: ToolItem[] = [
  {
    title: "Students",
    href: "/admin/users",
    description: "Bulk role/tag/access management",
  },
  {
    title: "Roles",
    href: "/admin/roles",
    description: "Feature matrix and role templates",
  },
  {
    title: "AI Logs",
    href: "/admin/ai-logs",
    description: "Model usage and troubleshooting",
  },
  {
    title: "Prompt Lab",
    href: "/admin/prompt-lab",
    description: "Prompt testing and iteration",
  },
  {
    title: "Analytics",
    href: "/admin/analytics",
    description: "Adoption, completion, drop-off",
  },
  {
    title: "Content",
    href: "/admin/content",
    description: "Upload and assign learning assets",
  },
  {
    title: "GHL Settings",
    href: "/admin/ghl",
    description: "CRM sync settings and checks",
  },
  {
    title: "Migration",
    href: "/admin/migration",
    description: "Role/access migration utilities",
  },
];

const CHECKLIST = [
  "Confirm Clerk production keys and domain",
  "Confirm Mux webhook secret and endpoint",
  "Confirm Upstash URL/token (no placeholders)",
  "Confirm CRON_SECRET and enrollment webhook secret",
  "Run production DB migrations",
  "Smoke test Admin/Coach/Student paths",
];

export default async function AdminDevToolkitPage() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Dev Toolkit</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Admin operations hub for launch, diagnostics, and maintenance.
        </p>
      </div>

      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Launch Checklist
        </h2>
        <ul className="space-y-2 text-sm text-foreground/90">
          {CHECKLIST.map((item) => (
            <li key={item} className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Quick Access
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOL_ITEMS.map((tool) => (
            <Link
              key={tool.title}
              href={tool.href}
              className="rounded-lg border border-border/70 bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <p className="text-sm font-semibold text-foreground">{tool.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
