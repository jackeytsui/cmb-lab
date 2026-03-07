import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { ContentManagementClient } from "./ContentManagementClient";

export default async function ContentManagementPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Content Management</h1>
            <p className="text-zinc-400 mt-1">
              Upload, organize, and manage video content
            </p>
          </div>

          <nav className="flex items-center gap-2 text-sm">
            <a href="/admin" className="text-zinc-400 hover:text-white">
              Admin
            </a>
            <span className="text-zinc-600">/</span>
            <span className="text-white">Content</span>
          </nav>
        </div>

        {/* Client component for interactive features */}
        <ContentManagementClient />
    </div>
  );
}
