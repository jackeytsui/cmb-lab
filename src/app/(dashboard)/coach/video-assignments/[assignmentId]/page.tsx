import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { ArrowLeft, Calendar, ExternalLink } from "lucide-react";
import { hasMinimumRole } from "@/lib/auth";
import { getVideoAssignmentProgress } from "@/lib/video-assignments";
import { VideoAssignmentProgress } from "@/components/coach/VideoAssignmentProgress";

/**
 * Coach progress detail page for a single video assignment.
 * Server component — direct DB query (v7-14 pattern).
 */
export default async function CoachVideoAssignmentProgressPage(props: {
  params: Promise<{ assignmentId: string }>;
}) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const { assignmentId } = await props.params;
  const data = await getVideoAssignmentProgress(assignmentId);

  if (!data) {
    redirect("/coach/video-assignments");
  }

  const displayTitle = data.assignment.title || "Untitled Video";

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href="/coach/video-assignments"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Video Assignments
      </Link>

      {/* Header */}
      <div className="flex gap-6 mb-8">
        {/* Thumbnail */}
        <div className="relative w-48 aspect-video shrink-0 rounded-lg overflow-hidden bg-muted">
          <Image
            src={`https://img.youtube.com/vi/${data.assignment.youtubeVideoId}/mqdefault.jpg`}
            alt={displayTitle}
            fill
            className="object-cover"
            unoptimized
          />
        </div>

        {/* Info */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{displayTitle}</h1>
          <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
            <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
              {data.assignment.youtubeVideoId}
            </span>
            <a
              href={data.assignment.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              YouTube
            </a>
            {data.assignment.dueDate && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Due: {format(new Date(data.assignment.dueDate), "MMM d, yyyy")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress table */}
      <VideoAssignmentProgress data={data} />
    </div>
  );
}
