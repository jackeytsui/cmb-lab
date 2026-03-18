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
      { title: "Students", url: "/coach/students", icon: Users },
    ],
  },
  {
    label: "Admin",
    minRole: "coach",
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
      <SidebarHeader className="px-3 py-4">
        {/* Expanded: logo + text + collapse button */}
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
          <Link
            href="/dashboard"
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
      <NavUser />
      <SidebarRail />
    </Sidebar>
  );
}
