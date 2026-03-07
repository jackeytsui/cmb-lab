import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { aiPrompts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ChevronRight, ArrowLeft, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PromptForm } from "@/components/admin/PromptForm";
import { VersionHistory } from "@/components/admin/VersionHistory";

interface PageProps {
  params: Promise<{ promptId: string }>;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  grading_text: {
    label: "Text Grading",
    color: "bg-cyan-500/10 text-cyan-400",
  },
  grading_audio: {
    label: "Audio Grading",
    color: "bg-purple-500/10 text-purple-400",
  },
  voice_ai: {
    label: "Voice AI",
    color: "bg-green-500/10 text-green-400",
  },
  chatbot: {
    label: "Chatbot",
    color: "bg-yellow-500/10 text-yellow-400",
  },
};

/**
 * Admin Prompt Detail page - view and edit AI prompt content.
 *
 * Features:
 * - View prompt details (name, type, description)
 * - Edit prompt content via PromptForm
 * - View version history and restore previous versions
 *
 * Access Control:
 * - Requires coach or admin role
 */
export default async function AdminPromptDetailPage({ params }: PageProps) {
  // Verify user has coach or admin role
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const { promptId } = await params;

  // Fetch prompt with full content
  const prompt = await db.query.aiPrompts.findFirst({
    where: eq(aiPrompts.id, promptId),
  });

  if (!prompt) {
    notFound();
  }

  const typeConfig = typeLabels[prompt.type] || {
    label: prompt.type,
    color: "bg-zinc-500/10 text-zinc-400",
  };

  const lastUpdated = formatDistanceToNow(new Date(prompt.updatedAt), {
    addSuffix: true,
  });

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-zinc-400 mb-6">
          <Link href="/admin" className="hover:text-white transition-colors">
            Admin
          </Link>
          <ChevronRight className="w-4 h-4" />
          <Link
            href="/admin/prompts"
            className="hover:text-white transition-colors"
          >
            AI Prompts
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-white">{prompt.name}</span>
        </nav>

        {/* Back button */}
        <Link
          href="/admin/prompts"
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to AI Prompts
        </Link>

        {/* Header section */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold">{prompt.name}</h1>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${typeConfig.color}`}
            >
              {typeConfig.label}
            </span>
          </div>
          {prompt.description && (
            <p className="text-zinc-400 mb-2">{prompt.description}</p>
          )}
          <p className="text-sm text-zinc-500">
            Version {prompt.currentVersion} - Last updated {lastUpdated}
          </p>
        </header>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Edit form (2/3 width) */}
          <div className="lg:col-span-2">
            <PromptForm
              prompt={{
                id: prompt.id,
                slug: prompt.slug,
                name: prompt.name,
                currentContent: prompt.currentContent,
                currentVersion: prompt.currentVersion,
              }}
            />
          </div>

          {/* Right column: Version history (1/3 width) */}
          <div>
            <VersionHistory
              promptId={prompt.id}
              currentVersion={prompt.currentVersion}
            />
          </div>
        </div>
    </div>
  );
}
