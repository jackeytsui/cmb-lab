"use client";

import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { NavMain, type NavSection } from "./NavMain";
import { NavUser } from "./NavUser";
import Image from "next/image";
import {
  BookOpenText,
  Users,
  FileText,
  Headphones,
  Keyboard,
  LayoutDashboard,
  UsersRound,
  AudioLines,
  Layers,
  MessageSquare,
  Gift,
  ClipboardList,
  Package,
  Music,
  Ear,
  CalendarCheck,
  CalendarDays,
  NotebookPen,
  Megaphone,
  House,
} from "lucide-react";
import type { Roles } from "@/types/globals";
import { hasMinimumPlatformRole, filterFeaturesForRole } from "@/lib/platform-roles";

type NavSectionWithRole = NavSection & { minRole: Roles };
type FeatureKey =
  | "ai_conversation"
  | "practice_sets"
  | "dictionary_reader"
  | "audio_courses"
  | "listening_lab"
  | "coaching_material"
  | "one_on_one_coaching"
  | "inner_circle_group_coaching"
  | "group_coaching_schedule"
  | "flashcards"
  | "course_library"
  | "video_threads"
  | "certificates"
  | "ai_chat"
  | "mandarin_accelerator"
  | "audio_accelerator_edition"
  | "tone_mastery"
  | "listening_training"
  | "notepad"
  | "assignment_feedback"
  | "assignment_review_text"
  | "assignment_review_vocal"
  | "assignment_review_diary";

type NavItemWithFeature = NavSection["items"][number] & {
  featureKey?: FeatureKey;
  allowedRoles?: Roles[];
  minRole?: Roles;
};
type NavSectionWithRoleAndFeature = Omit<NavSectionWithRole, "items"> & {
  items: NavItemWithFeature[];
};

const navSections: NavSectionWithRoleAndFeature[] = [
  {
    label: "Overview",
    minRole: "student",
    items: [{ title: "Home", url: "/home", icon: House }],
  },
  {
    label: "Admin",
    minRole: "admin",
    items: [
      { title: "Admin Portal", url: "/admin/manage", icon: LayoutDashboard },
      {
        title: "Announcements",
        url: "/admin/announcements",
        icon: Megaphone,
      },
    ],
  },
  {
    label: "Courses",
    minRole: "student",
    items: [
      {
        title: "Course Library",
        url: "/course-library",
        icon: BookOpenText,
        featureKey: "course_library",
      },
      {
        title: "Audio Course",
        url: "/audio-courses",
        icon: AudioLines,
        featureKey: "audio_courses",
      },
    ],
  },
  {
    label: "Learning Tools",
    minRole: "student",
    items: [
      {
        title: "Mandarin AI Reader",
        url: "/reader/mandarin",
        icon: BookOpenText,
        featureKey: "dictionary_reader",
      },
      {
        title: "Cantonese AI Reader",
        url: "/reader/cantonese",
        icon: BookOpenText,
        featureKey: "dictionary_reader",
      },
      {
        title: "YouTube Listening Lab",
        url: "/listening",
        icon: Headphones,
        featureKey: "listening_lab",
      },
      {
        title: "Notepad",
        url: "/notepad",
        icon: NotebookPen,
        featureKey: "notepad",
      },
    ],
  },
  {
    label: "My Material",
    minRole: "student",
    items: [
      {
        title: "1:1 Coaching",
        url: "/coaching/one-on-one",
        icon: FileText,
        featureKey: "one_on_one_coaching",
      },
      {
        title: "Inner Circle Group Coaching",
        url: "/coaching/inner-circle",
        icon: UsersRound,
        featureKey: "inner_circle_group_coaching",
      },
      {
        title: "Group Coaching Schedule",
        url: "/coaching/group-schedule",
        icon: CalendarDays,
        featureKey: "group_coaching_schedule",
      },
      {
        title: "Assignment Feedback",
        url: "/assignment-feedback",
        icon: ClipboardList,
        featureKey: "assignment_feedback",
      },
    ],
  },
  {
    label: "Mandarin Accelerator",
    minRole: "student",
    items: [
      {
        title: "My Progress",
        url: "/accelerator",
        icon: LayoutDashboard,
        featureKey: "mandarin_accelerator",
      },
      {
        title: "Practice Plan",
        url: "/accelerator/practice-plan",
        icon: ClipboardList,
        featureKey: "mandarin_accelerator",
      },
      {
        title: "Typing Unlock Kit",
        url: "/accelerator/typing",
        icon: Keyboard,
        featureKey: "mandarin_accelerator",
      },
      {
        title: "Conversation Scripts",
        url: "/accelerator/scripts",
        icon: MessageSquare,
        featureKey: "mandarin_accelerator",
      },
      {
        title: "AI Reader",
        url: "/accelerator/reader",
        icon: BookOpenText,
        featureKey: "mandarin_accelerator",
      },
      {
        title: "Starter Pack",
        url: "/accelerator/starter-pack",
        icon: Package,
        featureKey: "mandarin_accelerator",
      },
      {
        title: "Book a Call",
        url: "/accelerator/book-a-call",
        icon: CalendarCheck,
        featureKey: "mandarin_accelerator",
      },
    ],
  },
  {
    label: "Mandarin Accelerator Extra Pack",
    minRole: "student",
    items: [
      {
        title: "Audio Accelerator Edition",
        url: "/accelerator-extra/audio",
        icon: AudioLines,
        featureKey: "audio_accelerator_edition",
      },
      {
        title: "Tone Mastery",
        url: "/accelerator-extra/tone-mastery",
        icon: Music,
        featureKey: "tone_mastery",
      },
      {
        title: "Listening Training",
        url: "/accelerator-extra/listening-training",
        icon: Ear,
        featureKey: "listening_training",
      },
    ],
  },
  {
    label: "Review",
    minRole: "student",
    items: [
      {
        title: "Flashcards",
        url: "/flashcards",
        icon: Layers,
        featureKey: "flashcards",
      },
    ],
  },
  {
    label: "Coach Tools",
    minRole: "coach",
    items: [
      { title: "Admin Portal", url: "/admin/manage", icon: LayoutDashboard, allowedRoles: ["coach"] },
      { title: "Edit Course Content", url: "/admin/course-library", icon: BookOpenText, allowedRoles: ["coach", "admin"] },
      { title: "Assignment Submissions", url: "/admin/content/assignment-submissions", icon: ClipboardList, allowedRoles: ["coach", "admin"] },
      { title: "Coach Dashboard", url: "/coach", icon: LayoutDashboard },
      { title: "Students", url: "/coach/students", icon: Users },
      { title: "Internal Docs", url: "/coach/internal-docs", icon: FileText },
    ],
  },
];

export function AppSidebar({
  role,
  enabledFeatures,
  assignmentFeedbackUnread = 0,
  viewAsUser,
}: {
  role: Roles;
  enabledFeatures?: string[];
  /** Unread reviewed-assignment count shown beside "Assignment Feedback". */
  assignmentFeedbackUnread?: number;
  viewAsUser?: {
    name: string | null;
    email: string;
    role: Roles;
  } | null;
}) {
  const featureSet = new Set(filterFeaturesForRole(role, enabledFeatures ?? []));

  const filteredSections: NavSection[] = navSections
    .filter(
      (section) => hasMinimumPlatformRole(role, section.minRole)
    )
    .map((section) => {
      const items = section.items
        .filter((item) => !item.allowedRoles || item.allowedRoles.includes(role))
        .filter(
          (item) =>
            !item.minRole || hasMinimumPlatformRole(role, item.minRole),
        )
        .filter((item) => !item.featureKey || featureSet.has(item.featureKey))
        .map((item) =>
          item.url === "/assignment-feedback"
            ? { ...item, badge: assignmentFeedbackUnread }
            : item,
        );
      return { label: section.label, items };
    })
    .filter((section) => section.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="px-3 py-4">
        {/* Expanded: logo + text + collapse button */}
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
          <Link
            href="/home"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-sidebar-accent/30"
          >
            <div className="-translate-y-1 h-10 w-10 shrink-0 overflow-hidden rounded-lg">
              <Image
                src="/canto-to-mando-logo.png"
                alt="Canto to Mando Blueprint Lab"
                width={96}
                height={96}
                className="h-full w-full origin-top scale-[1.45] object-cover object-top"
                priority
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="whitespace-nowrap text-[13px] font-semibold leading-none tracking-[0.01em] text-sidebar-foreground">
                Canto to Mando Lab
              </div>
            </div>
          </Link>
          <SidebarTrigger className="size-7 shrink-0 rounded-md border border-border bg-sidebar-accent/50 text-sidebar-foreground hover:bg-sidebar-accent" />
        </div>
        {/* Collapsed: centered expand button only */}
        <div className="hidden items-center justify-center group-data-[collapsible=icon]:flex">
          <SidebarTrigger className="size-8 rounded-md border border-border bg-sidebar-accent/50 text-sidebar-foreground hover:bg-sidebar-accent" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain sections={filteredSections} />
      </SidebarContent>
      <div className="px-3 pb-2 group-data-[collapsible=icon]:px-2">
        <a
          href="https://www.thecmblueprint.com/student-referral"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <Gift className="w-4 h-4 shrink-0 text-amber-500" />
          <span className="group-data-[collapsible=icon]:hidden">Refer a Friend</span>
        </a>
        {role === "admin" && (
          <Link
            href="/admin/internal-docs"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <FileText className="w-4 h-4 shrink-0 text-sidebar-foreground/50" />
            <span className="group-data-[collapsible=icon]:hidden">Internal Docs</span>
          </Link>
        )}
      </div>
      <NavUser role={role} viewAsUser={viewAsUser} />
      <SidebarRail />
    </Sidebar>
  );
}
