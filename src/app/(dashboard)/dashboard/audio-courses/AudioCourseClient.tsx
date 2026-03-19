"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AudioLesson = {
  id: string;
  title: string;
  description: string;
  audioUrl: string;
  durationMinutes: number | null;
  sortOrder: number;
};

type AudioCourse = {
  id: string;
  title: string;
  summary: string;
  spotifyUrl: string;
  youtubeMusicUrl: string;
  applePodcastUrl: string;
  helloAudioSeriesUrl: string;
  studentInstructions: string;
  lessons: AudioLesson[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AudioCourseClient() {
  const [courses, setCourses] = useState<AudioCourse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  // Player state
  const [currentLesson, setCurrentLesson] = useState<AudioLesson | null>(null);
  const [currentCourse, setCurrentCourse] = useState<AudioCourse | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch("/api/audio-courses")
      .then((res) => res.json())
      .then((data) => {
        setCourses(data.courses ?? []);
        if (data.courses?.length === 1) {
          setExpandedCourseId(data.courses[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const playLesson = useCallback(
    (lesson: AudioLesson, course: AudioCourse) => {
      setCurrentLesson(lesson);
      setCurrentCourse(course);
      setIsPlaying(true);
      setCurrentTime(0);
      setDuration(0);

      if (audioRef.current) {
        audioRef.current.src = `/api/audio-courses/stream/${lesson.id}`;
        audioRef.current.playbackRate = playbackRate;
        audioRef.current.play().catch(() => setIsPlaying(false));
      }
    },
    [playbackRate]
  );

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const skipPrev = useCallback(() => {
    if (!currentCourse || !currentLesson) return;
    const idx = currentCourse.lessons.findIndex((l) => l.id === currentLesson.id);
    if (idx > 0) playLesson(currentCourse.lessons[idx - 1], currentCourse);
  }, [currentCourse, currentLesson, playLesson]);

  const skipNext = useCallback(() => {
    if (!currentCourse || !currentLesson) return;
    const idx = currentCourse.lessons.findIndex((l) => l.id === currentLesson.id);
    if (idx < currentCourse.lessons.length - 1) {
      playLesson(currentCourse.lessons[idx + 1], currentCourse);
    }
  }, [currentCourse, currentLesson, playLesson]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const vol = parseFloat(e.target.value);
      setVolume(vol);
      if (audioRef.current) audioRef.current.volume = vol;
    },
    []
  );

  const cyclePlaybackRate = useCallback(() => {
    const rates = [0.75, 1, 1.25, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, [playbackRate]);

  // Auto-play next lesson
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    if (!currentCourse || !currentLesson) return;
    const idx = currentCourse.lessons.findIndex((l) => l.id === currentLesson.id);
    if (idx < currentCourse.lessons.length - 1) {
      playLesson(currentCourse.lessons[idx + 1], currentCourse);
    }
  }, [currentCourse, currentLesson, playLesson]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AudioLines className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold text-foreground">No audio courses available yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Check back soon — new courses are being added.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={handleEnded}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Audio Courses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Listen to guided audio lessons from the Canto to Mando Blueprint.
        </p>
      </div>

      {/* Course list */}
      {courses.map((course) => {
        const isExpanded = expandedCourseId === course.id;
        return (
          <div
            key={course.id}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            {/* Course header */}
            <button
              type="button"
              onClick={() =>
                setExpandedCourseId(isExpanded ? null : course.id)
              }
              className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <AudioLines className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-foreground sm:text-base">
                  {course.title}
                </h2>
                {course.summary && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {course.summary}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {course.lessons.length} lesson{course.lessons.length !== 1 ? "s" : ""}
                </p>
              </div>
              {isExpanded ? (
                <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
            </button>

            {/* Expanded course content */}
            {isExpanded && (
              <div className="border-t border-border">
                {/* Student instructions */}
                {course.studentInstructions && (
                  <div className="border-b border-border/60 bg-muted/20 px-4 py-3">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {course.studentInstructions}
                    </p>
                  </div>
                )}

                {/* External platform links */}
                {(course.spotifyUrl ||
                  course.youtubeMusicUrl ||
                  course.applePodcastUrl ||
                  course.helloAudioSeriesUrl) && (
                  <div className="flex flex-wrap gap-2 border-b border-border/60 px-4 py-3">
                    {course.helloAudioSeriesUrl && (
                      <ExternalLinkBadge
                        href={course.helloAudioSeriesUrl}
                        label="HelloAudio"
                      />
                    )}
                    {course.spotifyUrl && (
                      <ExternalLinkBadge
                        href={course.spotifyUrl}
                        label="Spotify"
                      />
                    )}
                    {course.youtubeMusicUrl && (
                      <ExternalLinkBadge
                        href={course.youtubeMusicUrl}
                        label="YouTube Music"
                      />
                    )}
                    {course.applePodcastUrl && (
                      <ExternalLinkBadge
                        href={course.applePodcastUrl}
                        label="Apple Podcasts"
                      />
                    )}
                  </div>
                )}

                {/* Lesson list */}
                <div className="divide-y divide-border/60">
                  {course.lessons.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No lessons added yet.
                    </p>
                  ) : (
                    course.lessons.map((lesson, idx) => {
                      const isActive = currentLesson?.id === lesson.id;
                      const hasAudio = Boolean(lesson.audioUrl);
                      return (
                        <button
                          key={lesson.id}
                          type="button"
                          disabled={!hasAudio}
                          onClick={() => playLesson(lesson, course)}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                            isActive
                              ? "bg-primary/5"
                              : hasAudio
                                ? "hover:bg-muted/30 active:bg-muted/50"
                                : "opacity-50"
                          }`}
                        >
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                              isActive
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {isActive && isPlaying ? (
                              <Pause className="h-3.5 w-3.5" />
                            ) : (
                              idx + 1
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm ${
                                isActive
                                  ? "font-semibold text-primary"
                                  : "font-medium text-foreground"
                              }`}
                            >
                              {lesson.title}
                            </p>
                            {lesson.description && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {lesson.description}
                              </p>
                            )}
                          </div>
                          {lesson.durationMinutes && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {lesson.durationMinutes} min
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Sticky bottom audio player */}
      {currentLesson && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="mx-auto max-w-4xl px-4 py-3">
            {/* Progress bar */}
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="mb-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
            />

            <div className="flex items-center gap-3">
              {/* Track info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {currentLesson.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {currentCourse?.title}
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={skipPrev}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Previous"
                >
                  <SkipBack className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={togglePlayPause}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5 ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={skipNext}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Next"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
              </div>

              {/* Time + Speed */}
              <div className="hidden items-center gap-2 sm:flex">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                <button
                  type="button"
                  onClick={cyclePlaybackRate}
                  className="rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {playbackRate}x
                </button>
              </div>

              {/* Volume - desktop only */}
              <div className="hidden items-center gap-1 lg:flex">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={handleVolumeChange}
                  className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-muted accent-primary [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Spacer for fixed player */}
      {currentLesson && <div className="h-24" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ExternalLinkBadge({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted active:bg-muted/70"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
