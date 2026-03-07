"use client";

/**
 * InteractionOverlay Component
 *
 * Animated overlay that appears when video pauses for an interaction.
 * Features Framer Motion fade animations and responsive layout with
 * a sidebar (desktop) or drawer (mobile) for resources.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { BookOpen } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/**
 * Props for the InteractionOverlay component.
 */
export interface InteractionOverlayProps {
  /** Controls whether the overlay is visible */
  isVisible: boolean;
  /** Interaction content (forms, questions) */
  children: React.ReactNode;
  /** Callback when exit animation finishes */
  onExitComplete?: () => void;
  /** Optional content for the resource sidebar/drawer */
  sidebarContent?: React.ReactNode;
  /** Title for the sidebar (default: "Resources") */
  sidebarTitle?: string;
}

/**
 * Animated overlay for interactive video interactions.
 *
 * @example
 * ```tsx
 * <InteractionOverlay
 *   isVisible={isPaused}
 *   onExitComplete={() => console.log("Overlay hidden")}
 *   sidebarContent={<VocabularyList items={vocab} />}
 * >
 *   <QuestionForm onSubmit={handleAnswer} />
 * </InteractionOverlay>
 * ```
 */
export function InteractionOverlay({
  isVisible,
  children,
  onExitComplete,
  sidebarContent,
  sidebarTitle = "Resources",
}: InteractionOverlayProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <AnimatePresence onExitComplete={onExitComplete}>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 z-10 flex bg-black/80"
        >
          {/* Main content area */}
          <div className="flex-1 flex items-center justify-center p-4 md:p-8">
            <div className="w-full max-w-2xl pointer-events-auto">
              {children}
            </div>
          </div>

          {/* Desktop sidebar */}
          {sidebarContent && (
            <div className="hidden md:flex w-80 border-l border-white/10 bg-black/40 p-6 flex-col pointer-events-auto">
              <h3 className="text-lg font-semibold text-white mb-4">
                {sidebarTitle}
              </h3>
              <div className="flex-1 overflow-y-auto">{sidebarContent}</div>
            </div>
          )}

          {/* Mobile drawer trigger */}
          {sidebarContent && (
            <div className="md:hidden absolute bottom-4 right-4 pointer-events-auto">
              <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="rounded-full shadow-lg"
                  >
                    <BookOpen className="h-5 w-5" />
                    <span className="sr-only">Open {sidebarTitle}</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80 bg-zinc-900">
                  <SheetHeader>
                    <SheetTitle className="text-white">{sidebarTitle}</SheetTitle>
                    <SheetDescription className="text-zinc-400">
                      Reference materials for this interaction
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-4 overflow-y-auto max-h-[calc(100vh-120px)]">
                    {sidebarContent}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
