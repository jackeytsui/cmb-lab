"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
} from "@/components/ui/sidebar";

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  featureKey?: string;
  /** Optional unread count rendered as a badge next to the item. */
  badge?: number;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

function isActive(pathname: string, url: string): boolean {
  // Home represents the dashboard index, not every nested learning route.
  if (url === "/home") {
    return pathname === "/home";
  }
  // Exact match or prefix match with path separator
  return pathname === url || pathname.startsWith(url + "/");
}

export function NavMain({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();

  return (
    <>
      {sections.map((section) => (
        <SidebarGroup key={section.label}>
          <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(pathname, item.url)}
                    tooltip={item.title}
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {typeof item.badge === "number" && item.badge > 0 && (
                    <SidebarMenuBadge className="rounded-full bg-blue-500 px-1.5 text-[10px] font-semibold text-white">
                      {item.badge > 99 ? "99+" : item.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
