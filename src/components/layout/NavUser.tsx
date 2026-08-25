"use client";

import { UserButton } from "@clerk/nextjs";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import {
  FileText,
  KeyRound,
  LayoutDashboard,
  PlugZap,
  Settings,
  Wrench,
} from "lucide-react";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import type { Roles } from "@/types/globals";

export function NavUser({ role }: { role: Roles }) {
  const { user } = useUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "";
  const showAdminMenu = role === "admin";
  const displayRole = role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="Settings">
            <Link href="/settings">
              <Settings />
              <span>Settings</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="Terms and Conditions">
            <Link href="/settings/terms">
              <FileText />
              <span>Terms and Conditions</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <UserButton afterSignOutUrl="/sign-in">
              {showAdminMenu ? (
                <UserButton.MenuItems>
                  <UserButton.Link
                    label="Admin Portal"
                    labelIcon={<LayoutDashboard className="h-4 w-4" />}
                    href="/admin/manage"
                  />
                  <UserButton.Link
                    label="API Keys"
                    labelIcon={<KeyRound className="h-4 w-4" />}
                    href="/admin/api-keys"
                  />
                  <UserButton.Link
                    label="VideoAsk Import"
                    labelIcon={<PlugZap className="h-4 w-4" />}
                    href="/admin/integrations/videoask"
                  />
                  <UserButton.Link
                    label="Dev Toolkit"
                    labelIcon={<Wrench className="h-4 w-4" />}
                    href="/admin/dev-toolkit"
                  />
                </UserButton.MenuItems>
              ) : null}
            </UserButton>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <div className="truncate text-sm font-medium text-sidebar-foreground">
                {displayRole}
              </div>
              <div className="truncate text-xs text-sidebar-foreground/60">
                {email}
              </div>
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
