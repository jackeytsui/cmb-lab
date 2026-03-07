import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  kbEntries,
  kbCategories,
  kbFileSources,
  kbChunks,
} from "@/db/schema";
import { asc, count, desc, eq } from "drizzle-orm";
import {
  ChevronRight,
  ArrowLeft,
  BookOpen,
  FileText,
  Database,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { KbEntryForm } from "@/components/admin/KbEntryForm";
import { KbFileUpload } from "@/components/admin/KbFileUpload";
import { ErrorAlert } from "@/components/ui/error-alert";

interface PageProps {
  params: Promise<{ entryId: string }>;
}

/**
 * Edit knowledge base entry page.
 *
 * Features:
 * - Edit form for title, content, category, status
 * - Attached files section with file source list
 * - PDF upload component
 * - Chunk count info
 *
 * Access Control:
 * - Requires coach or admin role
 */
export default async function EditKnowledgeEntryPage({ params }: PageProps) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const { entryId } = await params;

  try {
    // Fetch entry, categories, file sources, and chunk count in parallel
    const [entryRows, categories, fileSources, chunkResult] = await Promise.all([
      db
        .select({
          id: kbEntries.id,
          title: kbEntries.title,
          content: kbEntries.content,
          categoryId: kbEntries.categoryId,
          categoryName: kbCategories.name,
          status: kbEntries.status,
          updatedAt: kbEntries.updatedAt,
        })
        .from(kbEntries)
        .leftJoin(kbCategories, eq(kbEntries.categoryId, kbCategories.id))
        .where(eq(kbEntries.id, entryId)),
      db
        .select({
          id: kbCategories.id,
          name: kbCategories.name,
        })
        .from(kbCategories)
        .orderBy(asc(kbCategories.sortOrder)),
      db
        .select({
          id: kbFileSources.id,
          filename: kbFileSources.filename,
          fileSize: kbFileSources.fileSize,
          chunkCount: kbFileSources.chunkCount,
          createdAt: kbFileSources.createdAt,
        })
        .from(kbFileSources)
        .where(eq(kbFileSources.entryId, entryId))
        .orderBy(desc(kbFileSources.createdAt)),
      db
        .select({ value: count() })
        .from(kbChunks)
        .where(eq(kbChunks.entryId, entryId)),
    ]);

    const entry = entryRows[0];
    if (!entry) {
      notFound();
    }

    const totalChunks = chunkResult[0]?.value ?? 0;
    const lastUpdated = formatDistanceToNow(new Date(entry.updatedAt), {
      addSuffix: true,
    });

    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-zinc-400 mb-6">
            <Link href="/admin" className="hover:text-white transition-colors">
              Admin
            </Link>
            <ChevronRight className="w-4 h-4" />
            <Link
              href="/admin/knowledge"
              className="hover:text-white transition-colors"
            >
              Knowledge Base
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">{entry.title}</span>
          </nav>

          {/* Back button */}
          <Link
            href="/admin/knowledge"
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Knowledge Base
          </Link>

          {/* Header */}
          <header className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-cyan-600/20 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-cyan-400" />
              </div>
              <h1 className="text-2xl font-bold">{entry.title}</h1>
              {entry.categoryName && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400">
                  {entry.categoryName}
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-500">Last updated {lastUpdated}</p>
          </header>

          {/* Entry form */}
          <KbEntryForm
            mode="edit"
            entry={{
              id: entry.id,
              title: entry.title,
              content: entry.content,
              categoryId: entry.categoryId,
              status: entry.status,
            }}
            categories={categories}
          />

          {/* Chunks info */}
          <div className="mt-8 rounded-lg border border-zinc-700 bg-zinc-800 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-medium text-zinc-300">Chunks</h2>
            </div>
            <p className="text-sm text-zinc-500">
              {totalChunks} {totalChunks === 1 ? "chunk" : "chunks"} total across
              manual content and uploaded files.
            </p>
          </div>

          {/* Attached files section */}
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-white mb-4">
              Attached Files
            </h2>

            {/* Existing file sources */}
            {fileSources.length > 0 && (
              <div className="space-y-3 mb-6">
                {fileSources.map((file) => {
                  const uploadedAgo = formatDistanceToNow(
                    new Date(file.createdAt),
                    { addSuffix: true }
                  );
                  const sizeKb = Math.round(file.fileSize / 1024);

                  return (
                    <div
                      key={file.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 p-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-5 h-5 text-zinc-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">
                            {file.filename}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {sizeKb} KB &middot; {file.chunkCount ?? 0}{" "}
                            {(file.chunkCount ?? 0) === 1 ? "chunk" : "chunks"}{" "}
                            &middot; Uploaded {uploadedAgo}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {fileSources.length === 0 && (
              <p className="text-sm text-zinc-500 mb-4">
                No files attached yet. Upload a PDF to extract content.
              </p>
            )}

            {/* Upload new file */}
            <KbFileUpload entryId={entryId} />
          </div>
      </div>
    );
  } catch (err) {
    console.error("Failed to load knowledge base entry:", err);

    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-zinc-400 mb-6">
            <Link href="/admin" className="hover:text-white transition-colors">
              Admin
            </Link>
            <ChevronRight className="w-4 h-4" />
            <Link
              href="/admin/knowledge"
              className="hover:text-white transition-colors"
            >
              Knowledge Base
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">Entry</span>
          </nav>

          {/* Back button */}
          <Link
            href="/admin/knowledge"
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Knowledge Base
          </Link>

          <ErrorAlert
            message="Failed to load this knowledge base entry. Please try again later."
            variant="block"
          />
      </div>
    );
  }
}
