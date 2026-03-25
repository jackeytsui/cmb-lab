"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Keyboard, MessageSquare, BookOpenText, Settings, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/admin/accelerator/content", label: "Content Pages", icon: Settings },
  { href: "/admin/accelerator/typing", label: "Typing Drills", icon: Keyboard },
  { href: "/admin/accelerator/scripts", label: "Conversation Scripts", icon: MessageSquare },
  { href: "/admin/accelerator/reader", label: "Curated Passages", icon: BookOpenText },
  { href: "/admin/accelerator/reports", label: "Reports", icon: BarChart3 },
];

export function AcceleratorAdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 rounded-lg border border-border bg-card p-1">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
