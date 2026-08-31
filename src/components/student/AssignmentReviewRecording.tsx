import { ExternalLink, Video } from "lucide-react";
import { parseRecordingEmbed } from "@/lib/recording-embed";

export function AssignmentReviewRecording({ url }: { url: string }) {
  const embed = parseRecordingEmbed(url);
  if (!embed) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">
        Review Recording
      </h2>
      {embed.kind === "link" ? (
        <a
          href={embed.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md border border-border bg-background p-3 hover:bg-muted/50 transition-colors"
        >
          <Video className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-foreground flex-1 truncate">
            Watch your review recording
          </span>
          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
        </a>
      ) : (
        <div className="rounded-lg overflow-hidden border border-border bg-black aspect-video">
          <iframe
            src={embed.embedUrl}
            title="Review recording"
            className="w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}
    </section>
  );
}
