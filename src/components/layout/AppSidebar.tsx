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
  ClipboardList,
  MessageSquare,
  Users,
  Mic,
  Video,
  FileText,
  Headphones,
  LayoutDashboard,
  AudioLines,
} from "lucide-react";
import type { Roles } from "@/types/globals";

type NavSectionWithRole = NavSection & { minRole: Roles };
type FeatureKey =
  | "ai_conversation"
  | "practice_sets"
  | "dictionary_reader"
  | "audio_courses"
  | "listening_lab"
  | "coaching_material"
  | "video_threads"
  | "certificates"
  | "ai_chat";

type NavItemWithFeature = NavSection["items"][number] & {
  featureKey?: FeatureKey;
};
type NavSectionWithRoleAndFeature = Omit<NavSectionWithRole, "items"> & {
  items: NavItemWithFeature[];
};

const navSections: NavSectionWithRoleAndFeature[] = [
  {
    label: "Courses",
    minRole: "student",
    items: [
      {
        title: "Audio Course",
        url: "/dashboard/audio-courses",
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
        title: "AI Passage Reader",
        url: "/dashboard/reader",
        icon: BookOpenText,
        featureKey: "dictionary_reader",
      },
      {
        title: "YouTube Listening Lab",
        url: "/dashboard/listening",
        icon: Headphones,
        featureKey: "listening_lab",
      },
    ],
  },
  {
    label: "My Material",
    minRole: "student",
    items: [
      {
        title: "1:1 Coaching",
        url: "/dashboard/coaching/one-on-one",
        icon: FileText,
        featureKey: "coaching_material",
      },
      {
        title: "Inner Circle Group Coaching",
        url: "/dashboard/coaching/inner-circle",
        icon: FileText,
        featureKey: "coaching_material",
      },
    ],
  },
  {
    label: "Coach Tools",
    minRole: "coach",
    items: [
      { title: "Coach Dashboard", url: "/coach", icon: Users },
      { title: "Pronunciation", url: "/coach/pronunciation", icon: Mic },
      {
        title: "Conversations",
        url: "/coach/conversations",
        icon: MessageSquare,
      },
      { title: "Students", url: "/coach/students", icon: Users },
      {
        title: "Practice Results",
        url: "/coach/practice-results",
        icon: ClipboardList,
      },
      {
        title: "Video Threads",
        url: "/admin/video-threads",
        icon: Video,
      },
    ],
  },
  {
    label: "Admin",
    minRole: "admin",
    items: [
      { title: "Admin Portal", url: "/admin/manage", icon: LayoutDashboard },
    ],
  },
];

const roleHierarchy: Roles[] = ["student", "coach", "admin"];

export function AppSidebar({
  role,
  enabledFeatures,
}: {
  role: Roles;
  enabledFeatures?: string[];
}) {
  const userLevel = roleHierarchy.indexOf(role);
  const featureSet = new Set(enabledFeatures ?? []);

  const filteredSections: NavSection[] = navSections
    .filter(
      (section) => userLevel >= roleHierarchy.indexOf(section.minRole)
    )
    .map(({ minRole, ...section }) => {
      const items = section.items.filter(
        (item) => !item.featureKey || featureSet.has(item.featureKey)
      );
      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-sidebar-accent/30 group-data-[collapsible=icon]:hidden"
          >
            <div className="-translate-y-1 h-12 w-12 shrink-0 overflow-hidden rounded-lg self-center">
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
          {/* When collapsed: show expand trigger instead of half-cropped logo */}
          <SidebarTrigger className="size-8 shrink-0 rounded-md border border-border bg-sidebar-accent/50 text-sidebar-foreground hover:bg-sidebar-accent" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain sections={filteredSections} />
      </SidebarContent>
      <NavUser />
      <SidebarRail />
    </Sidebar>
  );
}
