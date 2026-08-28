"use client";

import { useState } from "react";
import { CirclePlay, Headphones, Podcast } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AudioCourseWalkthrough({ version }: { version: string }) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      document.querySelectorAll("audio").forEach((audio) => audio.pause());
    }
    setOpen(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm">
        <div className="flex items-start gap-3 lg:block">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm lg:mb-4">
            <CirclePlay className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              Quick start
            </p>
            <h2 className="mt-1 text-base font-semibold text-foreground">
              New to Audio Courses?
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              See how to listen in CMB Lab and take your lessons into a podcast
              app for listening on the go.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Headphones className="h-3.5 w-3.5" /> In CMB Lab
          </span>
          <span className="inline-flex items-center gap-1">
            <Podcast className="h-3.5 w-3.5" /> Other apps
          </span>
        </div>

        <DialogTrigger asChild>
          <button
            type="button"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <CirclePlay className="h-4 w-4" />
            Watch the quick tour
          </button>
        </DialogTrigger>
      </div>

      <DialogContent className="gap-5 p-4 sm:max-w-3xl sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle>How to use your Audio Courses</DialogTitle>
          <DialogDescription>
            A quick tour of listening inside CMB Lab and using your private feed
            in supported podcast apps.
          </DialogDescription>
        </DialogHeader>
        <div className="aspect-video overflow-hidden rounded-lg bg-black">
          {open && (
            <video
              src={`/api/audio-courses/walkthrough?v=${encodeURIComponent(version)}`}
              autoPlay
              controls
              playsInline
              preload="metadata"
              className="h-full w-full"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
