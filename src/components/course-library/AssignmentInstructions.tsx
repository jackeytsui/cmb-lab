import { BookOpen } from "lucide-react";

// ---------------------------------------------------------------------------
// Labeled "Instructions" card for assignment lesson pages. Renders the lesson's
// rich-text description inside a distinctly-tinted card with a header, so it
// reads as guidance that is clearly separate from the interactive work area
// (which uses the standard bg-card panels) below it.
// ---------------------------------------------------------------------------

export function AssignmentInstructions({ html }: { html: string }) {
  return (
    <section className="rounded-lg border border-border bg-muted/40 p-5">
      <div className="mb-2 flex items-center gap-1.5">
        <BookOpen className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Instructions
        </h2>
      </div>
      <div
        className="prose prose-invert max-w-none text-foreground prose-p:text-foreground prose-li:text-foreground prose-headings:text-foreground prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-headings:font-semibold"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
