import { getCurrentUser } from "@/lib/auth";
import { isStaffRole } from "@/lib/platform-roles";
import Link from "next/link";
import { Pencil } from "lucide-react";

export async function AdminEditLink({ href }: { href: string }) {
  const user = await getCurrentUser();
  if (!isStaffRole(user?.role)) return null;

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
