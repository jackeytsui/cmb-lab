"use client";

import { SignOutButton, UserButton } from "@clerk/nextjs";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { FileText, KeyRound, LayoutDashboard, LogOut, Settings, Wrench } from "lucide-react";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

export function NavUser() {
  const { user } = useUser();
  const roleRaw = user?.publicMetadata?.role;
  const role =
    typeof roleRaw === "string" && roleRaw.trim().length > 0
      ? roleRaw.charAt(0).toUpperCase() + roleRaw.slice(1)
      : "Account";
  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "";
  const normalizedEmail = email.trim().toLowerCase();
  const isAdminEmail =
    normalizedEmail === "jackey.tsui@thecmblueprint.com" ||
    normalizedEmail === "contact@thecmblueprint.com";
  const isAdminRole = typeof roleRaw === "string" && roleRaw.toLowerCase() === "admin";
  const isCoachRole = typeof roleRaw === "string" && roleRaw.toLowerCase() === "coach";
  const isStudentRole = !isAdminRole && !isCoachRole;
  const showAdminMenu = isAdminEmail || isAdminRole;
  const displayRole = showAdminMenu ? "Admin" : role;

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
            {isStudentRole ? (
              <SignOutButton redirectUrl="/sign-in">
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sidebar-border/60 px-2.5 text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent/40"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign out</span>
                </button>
              </SignOutButton>
            ) : (
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
                      label="Dev Toolkit"
                      labelIcon={<Wrench className="h-4 w-4" />}
                      href="/admin/dev-toolkit"
                    />
                  </UserButton.MenuItems>
                ) : null}
              </UserButton>
            )}
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
