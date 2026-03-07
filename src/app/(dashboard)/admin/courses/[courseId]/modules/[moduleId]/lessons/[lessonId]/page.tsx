"use client";

import { useEffect, useState, useCallback, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { LessonForm } from "@/components/admin/LessonForm";
import { VideoPreviewPlayer } from "@/components/admin/VideoPreviewPlayer";
import { InteractionTimeline } from "@/components/admin/InteractionTimeline";
import { InteractionForm } from "@/components/admin/InteractionForm";
import type { Lesson } from "@/db/schema/courses";
import type { Interaction } from "@/db/schema/interactions";

interface PageProps {
  params: Promise<{ courseId: string; moduleId: string; lessonId: string }>;
}

/**
 * Admin Lesson Detail page - edit lesson and manage interactions.
 *
 * Interactions at the same timestamp are grouped: clicking any marker
 * in a group opens a multi-prompt form showing all prompts at that time.
 */
export default function AdminLessonDetailPage({ params }: PageProps) {
  const { courseId, moduleId, lessonId } = use(params);
  const router = useRouter();

  // Lesson state
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Interaction editor state
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // Fetch lesson
  const fetchLesson = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}`);
      if (!response.ok) {
        if (response.status === 403) {
          router.push("/dashboard");
          return;
        }
        if (response.status === 404) {
          router.push(`/admin/courses/${courseId}/modules/${moduleId}`);
          return;
        }
        throw new Error("Failed to fetch lesson");
      }
      const data = await response.json();
      setLesson(data.lesson);
      if (data.lesson.durationSeconds) {
        setVideoDuration(data.lesson.durationSeconds);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lesson");
    } finally {
      setLoading(false);
    }
  }, [courseId, moduleId, lessonId, router]);

  // Fetch interactions
  const fetchInteractions = useCallback(async () => {
    if (!lessonId) return;
    setInteractionError(null);
    try {
      const response = await fetch(`/api/admin/interactions?lessonId=${lessonId}`);
      if (!response.ok) throw new Error("Failed to fetch interactions");
      const data = await response.json();
      setInteractions(data.interactions || []);
    } catch (err) {
      setInteractionError(
        err instanceof Error ? err.message : "Failed to load interactions"
      );
    }
  }, [lessonId]);

  useEffect(() => {
    fetchLesson();
  }, [fetchLesson]);

  useEffect(() => {
    if (lesson) fetchInteractions();
  }, [lesson, fetchInteractions]);

  // Group interactions by timestamp for the form
  const interactionsAtSelectedTime = useMemo(() => {
    if (selectedTimestamp === null) return [];
    return interactions.filter((i) => i.timestamp === selectedTimestamp);
  }, [interactions, selectedTimestamp]);

  // Get unique timestamps for the interaction list grouping
  const interactionGroups = useMemo(() => {
    const groups = new Map<number, Interaction[]>();
    for (const i of interactions) {
      const existing = groups.get(i.timestamp) || [];
      existing.push(i);
      groups.set(i.timestamp, existing);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [interactions]);

  // Handle timeline click (new interaction or select group)
  const handleTimeSelect = useCallback((time: number) => {
    setSelectedTimestamp(time);
  }, []);

  const handleAddAtTime = useCallback((time: number) => {
    setSelectedTimestamp(time);
  }, []);

  // Handle interaction marker click — select the timestamp group
  const handleInteractionSelect = useCallback((interaction: Interaction) => {
    setSelectedTimestamp(interaction.timestamp);
  }, []);

  // Handle form save — refetch and close
  const handleFormSave = useCallback(() => {
    fetchInteractions();
    setSelectedTimestamp(null);
  }, [fetchInteractions]);

  const handleFormCancel = useCallback(() => {
    setSelectedTimestamp(null);
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="mb-4 h-4 w-32 rounded bg-zinc-700" />
          <div className="mb-8 h-10 w-64 rounded bg-zinc-700" />
          <div className="h-48 rounded-lg bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorAlert message={error || "Lesson not found"} onRetry={fetchLesson} />
        <Link
          href={`/admin/courses/${courseId}/modules/${moduleId}`}
          className="mt-4 inline-block"
        >
          <Button variant="outline">Back to Module</Button>
        </Link>
      </div>
    );
  }

  const showInteractionForm = selectedTimestamp !== null;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-zinc-400">
        <Link href="/admin" className="hover:text-white">
          Admin
        </Link>
        <span className="mx-2">/</span>
        <Link href="/admin/courses" className="hover:text-white">
          Courses
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/admin/courses/${courseId}`} className="hover:text-white">
          Course
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/admin/courses/${courseId}/modules/${moduleId}`}
          className="hover:text-white"
        >
          Module
        </Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-200">{lesson.title}</span>
      </nav>

      {/* Page header */}
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{lesson.title}</h1>
          <div className="mt-2 flex items-center gap-3 text-zinc-400">
            {lesson.muxPlaybackId ? (
              <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                Has Video
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-400">
                No Video
              </span>
            )}
            {lesson.durationSeconds && (
              <span>
                Duration: {Math.floor(lesson.durationSeconds / 60)}:
                {String(lesson.durationSeconds % 60).padStart(2, "0")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/admin/courses/${courseId}/modules/${moduleId}`}>
            <Button
              variant="ghost"
              className="text-zinc-400 hover:text-white"
            >
              Back to Module
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => setShowForm(!showForm)}
            className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
          >
            {showForm ? "Hide Details" : "Edit Details"}
          </Button>
        </div>
      </header>

      {/* Lesson edit form (collapsible) */}
      {showForm && (
        <div className="mb-8">
          <LessonForm
            moduleId={moduleId}
            lesson={lesson}
            onSuccess={() => {
              fetchLesson();
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Interaction Points Section */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Interaction Points
            <span className="ml-2 inline-flex items-center rounded-full bg-zinc-700 px-2 py-0.5 text-sm text-zinc-300">
              {interactions.length}
            </span>
          </h2>
        </div>

        {interactionError && (
          <ErrorAlert
            message={interactionError}
            className="mb-4"
            onRetry={fetchInteractions}
          />
        )}

        {!lesson.muxPlaybackId ? (
          <div className="rounded-lg border border-dashed border-zinc-600 bg-zinc-800/50 p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-700">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-zinc-400"
              >
                <path d="m22 8-6 4 6 4V8Z" />
                <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-zinc-300">
              Add a Video First
            </h3>
            <p className="mt-2 text-sm text-zinc-400">
              Add a Mux playback ID above to enable interaction editing.
            </p>
            <Button
              variant="outline"
              onClick={() => setShowForm(true)}
              className="mt-4 border-zinc-600 text-zinc-300 hover:bg-zinc-700"
            >
              Edit Lesson Details
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left column: Video and Timeline (2/3 width) */}
            <div className="space-y-4 lg:col-span-2">
              <VideoPreviewPlayer
                playbackId={lesson.muxPlaybackId}
                currentTime={currentTime}
                onTimeUpdate={handleTimeUpdate}
                onTimeSelect={handleTimeSelect}
                interactions={interactions}
                duration={videoDuration || lesson.durationSeconds || 0}
              />

              <InteractionTimeline
                interactions={interactions}
                currentTime={currentTime}
                duration={videoDuration || lesson.durationSeconds || 300}
                onSelect={handleInteractionSelect}
                onAddAtTime={handleAddAtTime}
              />

              {!showInteractionForm && (
                <p className="text-center text-sm text-zinc-500">
                  Click on the timeline above to add a new interaction point
                </p>
              )}
            </div>

            {/* Right column: Interaction Form (1/3 width) */}
            <div>
              {showInteractionForm ? (
                <InteractionForm
                  lessonId={lessonId}
                  timestamp={selectedTimestamp!}
                  existingInteractions={interactionsAtSelectedTime}
                  onSave={handleFormSave}
                  onCancel={handleFormCancel}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-600 bg-zinc-800/50 p-6 text-center">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-700">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-zinc-400"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 12h8" />
                      <path d="M12 8v8" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-medium text-zinc-300">
                    Select or Add Interaction
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Click on the timeline or an existing marker
                  </p>
                </div>
              )}

              {/* Interaction list grouped by timestamp */}
              {interactionGroups.length > 0 && (
                <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800 p-4">
                  <h4 className="mb-3 text-sm font-medium text-zinc-300">
                    All Interactions
                  </h4>
                  <ul className="space-y-1">
                    {interactionGroups.map(([ts, group]) => (
                      <li key={ts}>
                        <button
                          onClick={() => setSelectedTimestamp(ts)}
                          className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-700 ${
                            selectedTimestamp === ts ? "bg-zinc-700" : ""
                          }`}
                        >
                          <span className="flex-shrink-0 text-xs font-mono text-zinc-500">
                            {Math.floor(ts / 60)}:
                            {String(ts % 60).padStart(2, "0")}
                          </span>
                          <span className="flex flex-1 items-center gap-1.5 overflow-hidden">
                            {group.map((interaction) => (
                              <span
                                key={interaction.id}
                                className={`h-2 w-2 flex-shrink-0 rounded-full ${
                                  interaction.language === "cantonese"
                                    ? "bg-amber-500"
                                    : interaction.language === "mandarin"
                                      ? "bg-emerald-500"
                                      : "bg-cyan-500"
                                }`}
                                title={`${interaction.language}: ${interaction.prompt.slice(0, 30)}`}
                              />
                            ))}
                          </span>
                          <span className="flex-shrink-0 text-xs text-zinc-600">
                            {group.length} prompt{group.length !== 1 ? "s" : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Lesson info summary */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">Lesson Details</h2>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-zinc-400">Title</dt>
              <dd className="mt-1 font-medium text-white">{lesson.title}</dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-400">Sort Order</dt>
              <dd className="mt-1 font-medium text-white">{lesson.sortOrder}</dd>
            </div>
            {lesson.description && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-zinc-400">Description</dt>
                <dd className="mt-1 text-zinc-300">{lesson.description}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-zinc-400">Created</dt>
              <dd className="mt-1 text-zinc-300">
                {new Date(lesson.createdAt).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-400">Last Updated</dt>
              <dd className="mt-1 text-zinc-300">
                {new Date(lesson.updatedAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
