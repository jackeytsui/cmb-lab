import { ReactNode } from "react";

interface ModuleSectionProps {
  module: {
    id: string;
    title: string;
    description: string | null;
  };
  children: ReactNode;
}

/**
 * ModuleSection component groups lessons under a module heading.
 *
 * Server component - no client-side interactivity needed.
 * Renders module title/description and children (LessonCard components).
 */
export function ModuleSection({ module, children }: ModuleSectionProps) {
  return (
    <section className="space-y-4">
      {/* Module header */}
      <div className="mb-2">
        <h3 className="text-xl font-semibold text-white">{module.title}</h3>
        {module.description && (
          <p className="text-sm text-zinc-400 mt-1">{module.description}</p>
        )}
      </div>

      {/* Lessons container */}
      <div className="space-y-3">{children}</div>
    </section>
  );
}
