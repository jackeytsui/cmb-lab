import { cn } from "@/lib/utils";

interface StudentSubmissionRecordingProps {
  src: string;
  sticky?: boolean;
}

export function StudentSubmissionRecording({
  src,
  sticky = false,
}: StudentSubmissionRecordingProps) {
  return (
    <section
      data-testid="student-submission-recording"
      data-sticky={sticky ? "true" : "false"}
      className={cn(
        "rounded-lg border border-border bg-card p-5 shadow-sm",
        sticky &&
          "sticky top-3 z-30 border-primary/30 bg-card/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/90",
      )}
      aria-labelledby="student-submission-recording-heading"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="student-submission-recording-heading"
          className="text-sm font-semibold text-foreground"
        >
          Student&apos;s recording
        </h2>
        {sticky && (
          <span className="text-[11px] text-muted-foreground">
            Stays visible while you review
          </span>
        )}
      </div>
      <audio
        controls
        preload="metadata"
        controlsList="nodownload"
        src={src}
        className="w-full"
      />
    </section>
  );
}
