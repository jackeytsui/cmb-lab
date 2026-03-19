"use client";

import { UserButton } from "@clerk/nextjs";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SearchBar } from "@/components/search/SearchBar";

interface AppHeaderProps {
  title: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <div className="flex items-center gap-4">
        <SearchBar />
        <NotificationBell />
        <UserButton afterSignOutUrl="/sign-in" />
      </div>
    </header>
  );
}
