"use client";

import { SignOutButton, UserButton, useUser } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SearchBar } from "@/components/search/SearchBar";

interface AppHeaderProps {
  title: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  const { user } = useUser();
  const roleRaw = user?.publicMetadata?.role;
  const role = typeof roleRaw === "string" ? roleRaw.toLowerCase() : "student";
  const isStudentRole = role !== "admin" && role !== "coach";

  return (
    <header className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <div className="flex items-center gap-4">
        <SearchBar />
        <NotificationBell />
        {isStudentRole ? (
          <SignOutButton redirectUrl="/sign-in">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 text-xs font-medium text-zinc-100 hover:bg-zinc-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          </SignOutButton>
        ) : (
          <UserButton afterSignOutUrl="/sign-in" />
        )}
      </div>
    </header>
  );
}
