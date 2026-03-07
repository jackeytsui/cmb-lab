"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { CertificateDownloadButton } from "@/components/certificate/CertificateDownloadButton";

interface CourseCardProps {
  course: {
    id: string;
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    accessTier: "preview" | "full";
  };
  progress: {
    completedLessons: number;
    totalLessons: number;
  };
  certificateVerificationId?: string | null;
}

/**
 * Course card component with progress bar and cinematic styling.
 * Features hover animations via Framer Motion and gradient progress bar.
 */
export function CourseCard({ course, progress, certificateVerificationId }: CourseCardProps) {
  const progressPercent =
    progress.totalLessons > 0
      ? Math.round((progress.completedLessons / progress.totalLessons) * 100)
      : 0;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
      className="group"
    >
      <Link href={`/courses/${course.id}`} className="block">
        <div data-testid="course-card" className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-lg overflow-hidden hover:shadow-lg hover:shadow-cyan-500/20 transition-all duration-300">
          {/* Thumbnail */}
          {course.thumbnailUrl ? (
            <div className="aspect-video bg-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element -- external thumbnail URL */}
            <img
                src={course.thumbnailUrl}
                alt={course.title}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="aspect-video bg-zinc-800 flex items-center justify-center">
              <svg
                className="w-12 h-12 text-zinc-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
          )}

          {/* Content */}
          <div className="p-6">
            <h3 className="text-lg font-semibold group-hover:text-cyan-400 transition-colors">
              {course.title}
            </h3>
            {course.description && (
              <p className="text-zinc-400 text-sm mt-2 line-clamp-2">
                {course.description}
              </p>
            )}

            {/* Progress section */}
            <div className="mt-4 space-y-2">
              <Progress
                value={progressPercent}
                className="h-2 bg-zinc-700 [&>*]:bg-gradient-to-r [&>*]:from-cyan-500 [&>*]:to-blue-500"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">
                  {progress.completedLessons} of {progress.totalLessons} lessons
                </span>
                <span className="text-xs text-cyan-400 font-medium">
                  {progressPercent}%
                </span>
              </div>
            </div>

            {/* Access tier badge and certificate download */}
            <div className="mt-4 flex items-center gap-2">
              <AccessTierBadge tier={course.accessTier} />
              {progress.totalLessons > 0 &&
                progress.completedLessons === progress.totalLessons && (
                  <CertificateDownloadButton
                    courseId={course.id}
                    existingVerificationId={certificateVerificationId}
                  />
                )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/**
 * Access tier badge component
 */
function AccessTierBadge({ tier }: { tier: "preview" | "full" }) {
  const styles = {
    preview: "bg-amber-600/20 text-amber-400 border border-amber-600/30",
    full: "bg-indigo-600/20 text-indigo-400 border border-indigo-600/30",
  };

  const labels = {
    preview: "Preview",
    full: "Full Access",
  };

  return (
    <span
      className={`inline-block px-2 py-1 text-xs font-medium rounded ${styles[tier]}`}
    >
      {labels[tier]}
    </span>
  );
}
