import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { videoUploads } from "@/db/schema";
import { desc } from "drizzle-orm";
import { ErrorAlert } from "@/components/ui/error-alert";

export default async function UploadsPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  let uploads: (typeof videoUploads.$inferSelect)[] = [];
  let fetchError: string | null = null;

  try {
    // Fetch all uploads for admin view
    uploads = await db
      .select()
      .from(videoUploads)
      .orderBy(desc(videoUploads.createdAt))
      .limit(100);
  } catch (err) {
    console.error("Failed to load uploads:", err);
    fetchError = "Failed to load uploads. Please try again later.";
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">All Uploads</h1>
            <p className="text-zinc-400 mt-1">
              View all uploaded videos and their processing status
            </p>
          </div>

          <nav className="flex items-center gap-2 text-sm">
            <a href="/admin" className="text-zinc-400 hover:text-white">
              Admin
            </a>
            <span className="text-zinc-600">/</span>
            <a href="/admin/content" className="text-zinc-400 hover:text-white">
              Content
            </a>
            <span className="text-zinc-600">/</span>
            <span className="text-white">Uploads</span>
          </nav>
        </div>

        {fetchError ? (
          <ErrorAlert message={fetchError} variant="block" />
        ) : (
          <>
            {/* Uploads table */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
              <table className="w-full">
                <thead className="bg-zinc-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-300">
                      Filename
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-300">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-300">
                      Duration
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-300">
                      Assigned
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-300">
                      Uploaded
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {uploads.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-zinc-400"
                      >
                        No uploads yet. Go to{" "}
                        <a
                          href="/admin/content"
                          className="text-cyan-400 hover:underline"
                        >
                          Content Management
                        </a>{" "}
                        to upload videos.
                      </td>
                    </tr>
                  ) : (
                    uploads.map((upload) => (
                      <tr key={upload.id} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3">
                          <span className="text-white truncate max-w-xs block">
                            {upload.filename}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={upload.status} />
                        </td>
                        <td className="px-4 py-3 text-zinc-400 text-sm">
                          {upload.durationSeconds
                            ? `${Math.floor(upload.durationSeconds / 60)}:${String(
                                upload.durationSeconds % 60
                              ).padStart(2, "0")}`
                            : "\u2014"}
                        </td>
                        <td className="px-4 py-3">
                          {upload.lessonId ? (
                            <span className="text-green-400 text-sm">Yes</span>
                          ) : (
                            <span className="text-zinc-500 text-sm">No</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-400 text-sm">
                          {new Date(upload.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            {uploads.length > 0 && (
              <p className="text-sm text-zinc-500">
                Showing {uploads.length} upload{uploads.length !== 1 ? "s" : ""}
                {" | "}
                {uploads.filter((u) => u.status === "ready").length} ready
                {" | "}
                {uploads.filter((u) => u.status === "processing").length} processing
                {" | "}
                {uploads.filter((u) => u.lessonId).length} assigned
              </p>
            )}
          </>
        )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-zinc-700 text-zinc-300",
    uploading: "bg-blue-500/20 text-blue-400",
    processing: "bg-yellow-500/20 text-yellow-400",
    ready: "bg-green-500/20 text-green-400",
    errored: "bg-red-500/20 text-red-400",
  };

  return (
    <span
      className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
        colors[status] || "bg-zinc-700 text-zinc-300"
      }`}
    >
      {status}
    </span>
  );
}
