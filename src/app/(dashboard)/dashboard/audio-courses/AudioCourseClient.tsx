"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  ListChecks,
  Loader2,
  NotebookPen,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AudioLesson = {
  id: string;
  title: string;
  description: string;
  audioUrl: string;
  transcript: string;
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
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Side panels
  const [showTranscript, setShowTranscript] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showExercises, setShowExercises] = useState(false);

  // Exercises state - keyed by lessonId
  const [lessonExerciseInfo, setLessonExerciseInfo] = useState<
    Record<string, { hasExercises: boolean; bestScore: number | null; practiceSetId: string | null }>
  >({});
  const [noteContent, setNoteContent] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteLoaded, setNoteLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Load exercise info for all lessons
  useEffect(() => {
    if (courses.length === 0) return;
    const allLessons = courses.flatMap((c) => c.lessons);
    for (const lesson of allLessons) {
      fetch(`/api/audio-courses/exercises/${lesson.id}`)
        .then((r) => r.json())
        .then((d) => {
          setLessonExerciseInfo((prev) => ({
            ...prev,
            [lesson.id]: {
              hasExercises: d.hasExercises ?? false,
              bestScore: d.bestScore ?? null,
              practiceSetId: d.practiceSetId ?? null,
            },
          }));
        })
        .catch(() => {});
    }
  }, [courses]);

  // Load notes when lesson changes
  useEffect(() => {
    if (!currentLesson) {
      setNoteContent("");
      setNoteLoaded(false);
      return;
    }
    setNoteLoaded(false);
    fetch(`/api/audio-courses/notes/${currentLesson.id}`)
      .then((r) => r.json())
      .then((d) => {
        setNoteContent(d.content ?? "");
        setNoteLoaded(true);
      })
      .catch(() => setNoteLoaded(true));
  }, [currentLesson?.id]);

  // Auto-save notes (debounced)
  const saveNote = useCallback(
    (content: string) => {
      if (!currentLesson) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setNoteSaving(true);
        try {
          await fetch(`/api/audio-courses/notes/${currentLesson.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          });
        } catch {
          // silent
        }
        setNoteSaving(false);
      }, 800);
    },
    [currentLesson?.id],
  );

  const handleNoteChange = useCallback(
    (value: string) => {
      setNoteContent(value);
      saveNote(value);
    },
    [saveNote],
  );

  const playLesson = useCallback(
    (lesson: AudioLesson, course: AudioCourse) => {
      setCurrentLesson(lesson);
      setCurrentCourse(course);
      setIsPlaying(true);
      setCurrentTime(0);
      setDuration(0);
      setShowExercises(false);

      if (audioRef.current) {
        audioRef.current.src = `/api/audio-courses/stream/${lesson.id}`;
        audioRef.current.playbackRate = playbackRate;
        audioRef.current.play().catch(() => setIsPlaying(false));
      }
    },
    [playbackRate],
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

  const skip = useCallback(
    (seconds: number) => {
      if (!audioRef.current) return;
      audioRef.current.currentTime = Math.max(
        0,
        Math.min(audioRef.current.currentTime + seconds, duration),
      );
    },
    [duration],
  );

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
      setIsMuted(vol === 0);
      if (audioRef.current) audioRef.current.volume = vol;
    },
    [],
  );

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume || 1;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

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

  const hasTranscript = Boolean(currentLesson?.transcript);
  const currentExerciseInfo = currentLesson
    ? lessonExerciseInfo[currentLesson.id]
    : null;
  const hasExercises = currentExerciseInfo?.hasExercises ?? false;


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
              onClick={() => setExpandedCourseId(isExpanded ? null : course.id)}
              className="flex w-full items-center gap-3 p-3 sm:p-4 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
            >
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <AudioLines className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
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
                  <div className="border-b border-border/60 bg-muted/20 px-3 sm:px-4 py-3">
                    <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-line">
                      {course.studentInstructions}
                    </p>
                  </div>
                )}

                {/* External platform links */}
                {(course.spotifyUrl ||
                  course.youtubeMusicUrl ||
                  course.applePodcastUrl ||
                  course.helloAudioSeriesUrl) && (
                  <div className="flex flex-wrap gap-2 border-b border-border/60 px-3 sm:px-4 py-3">
                    {course.helloAudioSeriesUrl && (
                      <ExternalLinkBadge href={course.helloAudioSeriesUrl} label="HelloAudio" />
                    )}
                    {course.spotifyUrl && (
                      <ExternalLinkBadge href={course.spotifyUrl} label="Spotify" />
                    )}
                    {course.youtubeMusicUrl && (
                      <ExternalLinkBadge href={course.youtubeMusicUrl} label="YouTube Music" />
                    )}
                    {course.applePodcastUrl && (
                      <ExternalLinkBadge href={course.applePodcastUrl} label="Apple Podcasts" />
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
                        <div
                          key={lesson.id}
                          role="button"
                          tabIndex={hasAudio ? 0 : -1}
                          onClick={() => hasAudio && playLesson(lesson, course)}
                          className={`flex w-full items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3 text-left transition-colors cursor-pointer ${
                            isActive
                              ? "bg-primary/5"
                              : hasAudio
                                ? "hover:bg-muted/30 active:bg-muted/50"
                                : "opacity-50"
                          }`}
                        >
                          <div
                            className={`flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                              isActive
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {isActive && isPlaying ? (
                              <Pause className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
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
                          <div className="flex shrink-0 items-center gap-2">
                            {lessonExerciseInfo[lesson.id]?.hasExercises && (
                              <span className="flex items-center gap-0.5" title="Has exercises">
                                <ListChecks className="h-3.5 w-3.5 text-primary/60" />
                                {lessonExerciseInfo[lesson.id]?.bestScore !== null && (
                                  <span className="text-[10px] font-medium text-primary/60">
                                    {lessonExerciseInfo[lesson.id]?.bestScore}%
                                  </span>
                                )}
                              </span>
                            )}
                            {lesson.transcript && (
                              <FileText className="h-3.5 w-3.5 text-muted-foreground/50" />
                            )}
                            {lesson.durationMinutes && (
                              <span className="text-xs text-muted-foreground">
                                {lesson.durationMinutes} min
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Transcript slide-over panel */}
      {showTranscript && currentLesson?.transcript && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowTranscript(false)}
          />
          <div className="relative w-full max-w-md bg-card border-l border-border shadow-xl overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Transcript</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTranscript(false)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 py-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {currentLesson.title}
              </p>
              <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
                {currentLesson.transcript}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notes slide-over panel */}
      {showNotes && currentLesson && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowNotes(false)}
          />
          <div className="relative w-full max-w-md bg-card border-l border-border shadow-xl flex flex-col">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                <NotebookPen className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">My Notes</h3>
                {noteSaving && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {currentLesson.title}
              </p>
              <textarea
                value={noteLoaded ? noteContent : ""}
                onChange={(e) => handleNoteChange(e.target.value)}
                disabled={!noteLoaded}
                placeholder={noteLoaded ? "Type your notes here… They save automatically." : "Loading…"}
                className="h-full min-h-[300px] w-full resize-none rounded-lg border border-input bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>
      )}

      {/* Exercises slide-over panel */}
      {showExercises && currentLesson && currentExerciseInfo?.practiceSetId && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowExercises(false)}
          />
          <div className="relative w-full max-w-lg bg-card border-l border-border shadow-xl flex flex-col overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-4 py-3 z-10">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Exercises</h3>
                {currentExerciseInfo.bestScore !== null && (
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <Trophy className="h-3 w-3" />
                    Best: {currentExerciseInfo.bestScore}%
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowExercises(false)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 p-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                {currentLesson.title}
              </p>
              <LessonPracticeEmbed
                practiceSetId={currentExerciseInfo.practiceSetId}
                lessonId={currentLesson.id}
                onComplete={(score) => {
                  setLessonExerciseInfo((prev) => ({
                    ...prev,
                    [currentLesson.id]: {
                      ...prev[currentLesson.id],
                      bestScore:
                        prev[currentLesson.id]?.bestScore !== null
                          ? Math.max(prev[currentLesson.id].bestScore!, score)
                          : score,
                    },
                  }));
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Sticky bottom audio player */}
      {currentLesson && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="mx-auto max-w-4xl px-3 sm:px-4 py-2 sm:py-3">
            {/* Progress bar */}
            <div className="mb-1.5 sm:mb-2 flex items-center gap-2">
              <span className="text-[10px] sm:text-xs tabular-nums text-muted-foreground w-10 sm:w-12 text-right shrink-0">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
              />
              <span className="text-[10px] sm:text-xs tabular-nums text-muted-foreground w-10 sm:w-12 shrink-0">
                {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Track info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs sm:text-sm font-medium text-foreground">
                  {currentLesson.title}
                </p>
                <p className="truncate text-[10px] sm:text-xs text-muted-foreground">
                  {currentCourse?.title}
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-0.5 sm:gap-1">
                {/* 15s back */}
                <button
                  type="button"
                  onClick={() => skip(-15)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Back 15 seconds"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={skipPrev}
                  className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Previous"
                >
                  <SkipBack className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={togglePlayPause}
                  className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4 sm:h-5 sm:w-5" />
                  ) : (
                    <Play className="h-4 w-4 sm:h-5 sm:w-5 ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={skipNext}
                  className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Next"
                >
                  <SkipForward className="h-4 w-4" />
                </button>

                {/* 15s forward */}
                <button
                  type="button"
                  onClick={() => skip(15)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Forward 15 seconds"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Speed */}
              <button
                type="button"
                onClick={cyclePlaybackRate}
                className="rounded-md border border-border px-1.5 py-0.5 text-[10px] sm:text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {playbackRate}x
              </button>

              {/* Volume - desktop only */}
              <div className="hidden lg:flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {isMuted ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-muted accent-primary [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                />
              </div>

              {/* Transcript button */}
              {hasTranscript && (
                <button
                  type="button"
                  onClick={() => { setShowTranscript(!showTranscript); setShowNotes(false); setShowExercises(false); }}
                  className={`hidden sm:flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                    showTranscript
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label="Transcript"
                  title="Transcript"
                >
                  <FileText className="h-4 w-4" />
                </button>
              )}

              {/* Notes button */}
              <button
                type="button"
                onClick={() => { setShowNotes(!showNotes); setShowTranscript(false); setShowExercises(false); }}
                className={`hidden sm:flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  showNotes
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-label="My Notes"
                title="My Notes"
              >
                <NotebookPen className="h-4 w-4" />
              </button>

              {/* Exercises button */}
              {hasExercises && (
                <button
                  type="button"
                  onClick={() => { setShowExercises(!showExercises); setShowTranscript(false); setShowNotes(false); }}
                  className={`hidden sm:flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                    showExercises
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label="Exercises"
                  title="Exercises"
                >
                  <ListChecks className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Mobile: extra row for transcript, notes & exercises buttons */}
            <div className="flex sm:hidden items-center justify-center gap-4 mt-1.5 pb-0.5">
              {hasTranscript && (
                <button
                  type="button"
                  onClick={() => { setShowTranscript(!showTranscript); setShowNotes(false); setShowExercises(false); }}
                  className={`flex items-center gap-1 text-[10px] font-medium transition-colors ${
                    showTranscript ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <FileText className="h-3 w-3" />
                  Transcript
                </button>
              )}
              <button
                type="button"
                onClick={() => { setShowNotes(!showNotes); setShowTranscript(false); setShowExercises(false); }}
                className={`flex items-center gap-1 text-[10px] font-medium transition-colors ${
                  showNotes ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <NotebookPen className="h-3 w-3" />
                Notes
              </button>
              {hasExercises && (
                <button
                  type="button"
                  onClick={() => { setShowExercises(!showExercises); setShowTranscript(false); setShowNotes(false); }}
                  className={`flex items-center gap-1 text-[10px] font-medium transition-colors ${
                    showExercises ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <ListChecks className="h-3 w-3" />
                  Practice
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Spacer for fixed player */}
      {currentLesson && <div className="h-28 sm:h-24" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LessonPracticeEmbed({
  practiceSetId,
  lessonId,
  onComplete,
}: {
  practiceSetId: string;
  lessonId: string;
  onComplete: (score: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [practiceSet, setPracticeSet] = useState<Record<string, unknown> | null>(null);
  const [exercises, setExercises] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [Player, setPlayer] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/audio-courses/exercises/${lessonId}`).then((r) => r.json()),
      import("@/components/practice/player/PracticePlayer").then((mod) => mod.PracticePlayer),
    ])
      .then(([exerciseData, PlayerComponent]) => {
        if (!exerciseData.practiceSetId || !exerciseData.exercises?.length) {
          setError("No exercises available.");
          return;
        }
        setPracticeSet({
          id: exerciseData.practiceSetId,
          title: exerciseData.practiceSetTitle ?? "Exercises",
          description: null,
          status: "published",
          createdBy: "",
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        });
        setExercises(exerciseData.exercises);
        setPlayer(() => PlayerComponent);
      })
      .catch(() => setError("Failed to load exercises."))
      .finally(() => setLoading(false));
  }, [lessonId, practiceSetId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !practiceSet || exercises.length === 0 || !Player) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {error ?? "No exercises available for this lesson."}
      </div>
    );
  }

  return <Player practiceSet={practiceSet} exercises={exercises} userId="" />;
}

function ExternalLinkBadge({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium text-foreground transition-colors hover:bg-muted active:bg-muted/70"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
