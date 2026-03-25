import { hasMinimumRole } from "@/lib/auth";
import Link from "next/link";
import { Pencil } from "lucide-react";

export async function AdminEditLink({ href }: { href: string }) {
  const isCoach = await hasMinimumRole("coach");
  if (!isCoach) return null;

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 transition-colors"
    >
      <Pencil className="w-3 h-3" />
      Edit Content
    </Link>
  );
}
