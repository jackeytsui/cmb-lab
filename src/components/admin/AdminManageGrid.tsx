"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  BookOpenText,
  Bot,
  CalendarDays,
  ClipboardCheck,
  FileAudio,
  FileKey2,
  FileText,
  FlaskConical,
  KeyRound,
  LibraryBig,
  ListChecks,
  MessageSquareCode,
  PlugZap,
  ScrollText,
  ShieldCheck,
  Tags,
  UploadCloud,
  Users,
  WandSparkles,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewAsPanel } from "@/components/admin/ViewAsPanel";
import { TranscriptLimitsWidget } from "@/components/admin/TranscriptLimitsWidget";
import { LabAssistantAdminWidget } from "@/components/admin/LabAssistantAdminWidget";

export interface PortalItem {
  id: string;
  title: string;
  href: string;
  description: string;
}

export interface PortalSection {
  id: string;
  title: string;
  items?: PortalItem[];
  /** If set, renders a built-in widget instead of link tiles */
  widget?: "view-as" | "transcript-limits" | "lab-assistant";
}

const WIDGET_MAP: Record<string, React.FC> = {
  "view-as": ViewAsPanel,
  "transcript-limits": TranscriptLimitsWidget,
  "lab-assistant": LabAssistantAdminWidget,
};

const ITEM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "user-access": Users,
  "tag-access": Tags,
  roles: ShieldCheck,
  "api-keys": KeyRound,
  courses: BookOpenText,
  "course-library": LibraryBig,
  exercises: ListChecks,
  "audio-course": FileAudio,
  "video-uploads": UploadCloud,
  accelerator: WandSparkles,
  "tone-mastery": LibraryBig,
  "internal-docs": FileText,
  "assignment-submissions": ClipboardCheck,
  "coaching-schedule": CalendarDays,
  "knowledge-base": LibraryBig,
  "ai-prompts": MessageSquareCode,
  "prompt-lab": FlaskConical,
  analytics: BarChart3,
  "ai-logs": ScrollText,
  ghl: PlugZap,
  "dev-toolkit": Wrench,
  migration: FileKey2,
};

const SECTION_DESCRIPTIONS: Record<string, string> = {
  access: "Accounts, tags, permissions, and integration credentials.",
  content: "Create, publish, and review the learning experience.",
  ai: "Knowledge and prompt controls for AI-powered features.",
  ops: "Health, reporting, synchronization, and launch utilities.",
};

export function AdminManageGrid({ sections: initialSections }: { sections: PortalSection[] }) {
  const widgetSections = initialSections.filter((section) => section.widget);
  const toolSections = initialSections.filter((section) => !section.widget);
  const primaryWidgets = widgetSections.filter(
    (section) => section.widget !== "lab-assistant",
  );
  const assistantWidget = widgetSections.find(
    (section) => section.widget === "lab-assistant",
  );

  return (
    <div className="space-y-10">
      <section aria-labelledby="admin-tools-heading">
        <div className="mb-5">
          <h2 id="admin-tools-heading" className="text-xl font-semibold tracking-tight">
            Workspace tools
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose an area to manage. Related tools stay grouped together.
          </p>
        </div>
        <div className="grid items-start gap-5 xl:grid-cols-2">
          {toolSections.map((section) => (
            <ToolSection key={section.id} section={section} />
          ))}
        </div>
      </section>

      <section aria-labelledby="admin-controls-heading">
        <div className="mb-5">
          <h2 id="admin-controls-heading" className="text-xl font-semibold tracking-tight">
            Controls &amp; system health
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Preview user access, tune limits, and monitor assistant health.
          </p>
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {primaryWidgets.map((section) => (
            <WidgetSection key={section.id} section={section} />
          ))}
        </div>
        {assistantWidget && (
          <div className="mt-5">
            <WidgetSection section={assistantWidget} />
          </div>
        )}
      </section>
    </div>
  );
}

function WidgetSection({ section }: { section: PortalSection }) {
  const WidgetComponent = section.widget ? WIDGET_MAP[section.widget] : null;
  if (!WidgetComponent) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
      <WidgetComponent />
    </div>
  );
}

function ToolSection({ section }: { section: PortalSection }) {
  const isContent = section.id === "content";

  return (
    <article
      className={cn(
        "rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5",
        isContent && "xl:col-span-2",
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground/75">
            {section.title}
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {SECTION_DESCRIPTIONS[section.id]}
          </p>
        </div>
        {section.id === "ai" && <Bot className="size-5 text-primary/70" />}
      </div>
      <div
        className={cn(
          "grid gap-2.5",
          isContent
            ? "sm:grid-cols-2 lg:grid-cols-3"
            : "sm:grid-cols-2",
        )}
      >
        {(section.items ?? []).map((item) => {
          const Icon = ITEM_ICONS[item.id] ?? Wrench;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="group flex min-h-24 items-start gap-3 rounded-xl border border-border/70 bg-background/60 p-3.5 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:bg-background hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary transition-colors group-hover:bg-primary/12">
                <Icon className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {item.title}
                  </span>
                  <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </article>
  );
}
