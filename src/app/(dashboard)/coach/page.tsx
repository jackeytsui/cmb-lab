import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { SubmissionQueue } from "@/components/coach/SubmissionQueue";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MessageSquare, Mic, Users, Video, ChevronRight, PlaySquare, GitBranch } from "lucide-react";

/**
 * Coach Dashboard page - displays navigation cards and submission queue.
 *
 * This is the main interface for coaches to:
 * - Navigate to pronunciation review, conversations, and students
 * - View pending student submissions
 * - Filter between pending, reviewed, and all submissions
 * - Click through to individual submission details
 *
 * Access Control:
 * - Requires minimum coach role (coach or admin)
 * - Students are redirected to their dashboard
 *
 * Server component that checks coach role before rendering.
 */
export default async function CoachDashboardPage() {
  // Verify user has coach role or higher
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  // Get current user for personalized greeting
  const user = await currentUser();
  const displayName = user?.firstName || "Coach";

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Page header with personalized greeting */}
        <div className="mb-8">
          <p className="text-muted-foreground mt-2">
            Welcome back, {displayName}. Review student submissions and provide feedback.
          </p>
        </div>

        {/* Navigation cards */}
        <section aria-label="Coach Tools" className="mb-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
            <Link href="/coach/pronunciation">
              <Card className="bg-card border-border hover:border-cyan-500/50 transition-colors cursor-pointer group">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <Mic className="w-5 h-5 text-cyan-400" />
                  </div>
                  <CardTitle className="text-base font-semibold text-foreground flex-1">
                    Pronunciation Review
                  </CardTitle>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-cyan-400 transition-colors" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Review student pronunciation scores and per-character accuracy
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/coach/conversations">
              <Card className="bg-card border-border hover:border-violet-500/50 transition-colors cursor-pointer group">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-violet-400" />
                  </div>
                  <CardTitle className="text-base font-semibold text-foreground flex-1">
                    Conversations
                  </CardTitle>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-violet-400 transition-colors" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Review student voice practice sessions and transcripts
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/coach/students">
              <Card className="bg-card border-border hover:border-amber-500/50 transition-colors cursor-pointer group">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-amber-400" />
                  </div>
                  <CardTitle className="text-base font-semibold text-foreground flex-1">
                    Students
                  </CardTitle>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-amber-400 transition-colors" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    View student profiles, progress, and management
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/coach/video-assignments">
              <Card className="bg-card border-border hover:border-rose-500/50 transition-colors cursor-pointer group">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
                    <Video className="w-5 h-5 text-rose-400" />
                  </div>
                  <CardTitle className="text-base font-semibold text-foreground flex-1">
                    Video Assignments
                  </CardTitle>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-rose-400 transition-colors" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Assign YouTube videos to students as homework
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/coach/video-prompts">
              <Card className="bg-card border-border hover:border-pink-500/50 transition-colors cursor-pointer group">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
                    <Video className="w-5 h-5 text-pink-400" />
                  </div>
                  <CardTitle className="text-base font-semibold text-foreground flex-1">
                    Video Prompts Library
                  </CardTitle>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-pink-400 transition-colors" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Record and manage VideoAsk-style questions for lessons
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/coach/thread-reviews">
              <Card className="bg-card border-border hover:border-teal-500/50 transition-colors cursor-pointer group">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
                    <PlaySquare className="w-5 h-5 text-teal-400" />
                  </div>
                  <CardTitle className="text-base font-semibold text-foreground flex-1">
                    Thread Reviews
                  </CardTitle>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-teal-400 transition-colors" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Review student video thread submissions and responses
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/coach/thread-assignments">
              <Card className="bg-card border-border hover:border-indigo-500/50 transition-colors cursor-pointer group">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                    <GitBranch className="w-5 h-5 text-indigo-400" />
                  </div>
                  <CardTitle className="text-base font-semibold text-foreground flex-1">
                    Thread Assignments
                  </CardTitle>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-indigo-400 transition-colors" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Assign video threads to students as homework
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>

        {/* Submission queue with filter tabs */}
        <section aria-label="Submission Queue">
          <SubmissionQueue />
        </section>
      </div>
  );
}
