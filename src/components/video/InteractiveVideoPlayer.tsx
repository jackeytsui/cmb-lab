"use client";

/**
 * InteractiveVideoPlayer Component
 *
 * Video player with cue point detection and pause-for-interaction functionality.
 * Uses XState for state management and Mux Player for video playback.
 * Integrates SubtitleOverlay with Ruby annotations and InteractionOverlay for interactions.
 */

import {
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import MuxPlayer from "@mux/mux-player-react";
import type { MuxPlayerProps } from "@mux/mux-player-react";
import { AnimatePresence } from "framer-motion";
import { useInteractiveVideo } from "@/hooks/useInteractiveVideo";
import { useSubtitlePreference } from "@/hooks/useSubtitlePreference";
import { useProgress } from "@/hooks/useProgress";
import { useCelebration } from "@/hooks/useCelebration";
import type { CuePoint, SubtitleCue } from "@/types/video";
import {
  filterCuePointsByPreference,
  type InteractionCuePoint,
  type LanguagePreference,
} from "@/lib/interactions";
import { XP_AMOUNTS } from "@/lib/xp";
import { CuePointMarkers } from "./CuePointMarkers";
import { SubtitleOverlay } from "./SubtitleOverlay";
import { InteractionOverlay } from "./InteractionOverlay";
import { CelebrationOverlay } from "@/components/celebrations/CelebrationOverlay";
import { Button } from "@/components/ui/button";
import { AudioInteraction } from "@/components/audio/AudioInteraction";
import { TextInteraction } from "@/components/interactions/TextInteraction";
import { VideoInteraction } from "@/components/video/interactions/VideoInteraction";

/**
 * Props for the InteractiveVideoPlayer component.
 */
export interface InteractiveVideoPlayerProps {
  /** Mux playback ID */
  playbackId: string;
  /** Cue points where video should pause for interactions */
  cuePoints: CuePoint[];
  /** Called when video pauses for an interaction */
  onInteractionRequired?: (cuePoint: CuePoint) => void;
  /** Called after an interaction is completed */
  onInteractionComplete?: () => void;
  /** Video title for analytics */
  title?: string;
  /** Additional CSS classes */
  className?: string;
  /** Accent color for controls (hex without #) */
  accentColor?: string;
  /** Subtitle cues with Chinese and romanization */
  subtitleCues?: SubtitleCue[];
  /** Content to render in the interaction overlay */
  children?: React.ReactNode;
  /** Content for the overlay sidebar/drawer */
  sidebarContent?: React.ReactNode;
  /** User's language preference for filtering interactions */
  languagePreference?: LanguagePreference;
  /** Lesson ID for progress tracking (optional - if not provided, progress not tracked) */
  lessonId?: string;
  /** Course ID for celebration "Back to Course" CTA routing */
  courseId?: string;
}

/**
 * Ref methods exposed by InteractiveVideoPlayer.
 */
export interface InteractiveVideoPlayerRef {
  /** Complete the current interaction and resume playback */
  completeInteraction: () => void;
  /** Mark a cue point as completed */
  markCuePointCompleted: (cuePointId: string) => void;
  /** Get current player state */
  getState: () => string;
  /** Get current playback time */
  getCurrentTime: () => number;
}

/**
 * Interactive video player with cue point detection, Ruby-annotated subtitles,
 * and animated interaction overlays.
 *
 * @example
 * ```tsx
 * <InteractiveVideoPlayer
 *   ref={playerRef}
 *   playbackId="abc123"
 *   cuePoints={cuePoints}
 *   subtitleCues={subtitles}
 *   onInteractionRequired={(cp) => setActiveInteraction(cp)}
 *   onInteractionComplete={() => console.log("Interaction done")}
 *   sidebarContent={<VocabularyList items={vocab} />}
 * >
 *   <InteractionForm ... />
 * </InteractiveVideoPlayer>
 *
 * // Later, to complete an interaction:
 * playerRef.current?.completeInteraction();
 * ```
 */
export const InteractiveVideoPlayer = forwardRef<
  InteractiveVideoPlayerRef,
  InteractiveVideoPlayerProps
>(function InteractiveVideoPlayer(
  {
    playbackId,
    cuePoints: initialCuePoints,
    onInteractionRequired,
    onInteractionComplete,
    title,
    className,
    accentColor = "6366f1",
    subtitleCues = [],
    children,
    sidebarContent,
    languagePreference,
    lessonId,
    courseId,
  },
  ref
) {
  const {
    state,
    context,
    playerRef,
    play: _play,
    pause: _pause,
    updateTime,
    setDuration,
    handleCuePointReached,
    completeInteraction,
    isInteractionPending,
    setCuePoints,
  } = useInteractiveVideo({ cuePoints: initialCuePoints });

  const {
    showPinyin,
    showJyutping,
    togglePinyin,
    toggleJyutping,
  } = useSubtitlePreference();

  // Progress tracking - hook handles undefined lessonId by returning no-ops
  const { updateVideoProgress, markInteractionComplete } = useProgress({ lessonId });

  // Celebration overlay for lesson completion
  const celebration = useCelebration({ score: 100 });
  const [nextLessonData, setNextLessonData] = useState<{ id: string; title: string } | null>(null);
  const celebratedRef = useRef(false);

  // Track active interaction for automatic interaction type routing
  const [activeInteraction, setActiveInteraction] = useState<InteractionCuePoint | null>(null);

  // Track last reported percent to avoid excessive API calls
  const lastReportedPercentRef = useRef<number>(0);

  /**
   * Fetch next lesson data THEN show celebration.
   * Awaits the fetch so SmartCTAs have data before the overlay renders.
   */
  const triggerCelebrationIfComplete = useCallback(async (completed: boolean) => {
    if (!completed || celebratedRef.current) return;
    celebratedRef.current = true;

    // Fetch next lesson BEFORE showing celebration to avoid race condition
    // where SmartCTAs render without next lesson data
    if (lessonId) {
      try {
        const res = await fetch(`/api/lessons/${lessonId}/next`);
        const data = await res.json();
        setNextLessonData(data.nextLesson ?? null);
      } catch {
        setNextLessonData(null);
      }
    }

    // Show celebration AFTER next lesson data is available
    celebration.show();
  }, [lessonId, celebration]);

  /**
   * Filter cue points based on user's language preference.
   *
   * If languagePreference is not provided, all cue points are shown.
   * Otherwise, cue points are filtered to show only those matching the preference.
   * CuePoints without a language field are assigned "both" (always shown).
   */
  const filteredCuePoints = useMemo(() => {
    if (!languagePreference) {
      // No preference specified - show all cue points
      return initialCuePoints;
    }

    // Cast cue points to InteractionCuePoint for filtering
    // CuePoints without language field default to "both" (always shown)
    const interactionCuePoints = initialCuePoints.map((cp) => ({
      ...cp,
      language:
        (cp as InteractionCuePoint).language || ("both" as LanguagePreference),
    })) as InteractionCuePoint[];

    return filterCuePointsByPreference(interactionCuePoints, languagePreference);
  }, [initialCuePoints, languagePreference]);

  // Update cue points when filtered list changes
  useEffect(() => {
    setCuePoints(filteredCuePoints);
  }, [filteredCuePoints, setCuePoints]);

  // Expose methods to parent via ref
  useImperativeHandle(
    ref,
    () => ({
      completeInteraction: () => {
        completeInteraction();
        onInteractionComplete?.();
        // Mark interaction as passed for progress tracking, then trigger celebration
        markInteractionComplete().then(triggerCelebrationIfComplete);
      },
      markCuePointCompleted: (cuePointId: string) => {
        const updatedCuePoints = context.cuePoints.map((cp) =>
          cp.id === cuePointId ? { ...cp, completed: true } : cp
        );
        setCuePoints(updatedCuePoints);
      },
      getState: () => state,
      getCurrentTime: () => context.currentTime,
    }),
    [
      completeInteraction,
      onInteractionComplete,
      markInteractionComplete,
      triggerCelebrationIfComplete,
      context.cuePoints,
      context.currentTime,
      setCuePoints,
      state,
    ]
  );

  /**
   * Handle duration change - add cue points to Mux Player.
   */
  const handleDurationChange = useCallback(
    (event: Event) => {
      const player = event.target as HTMLVideoElement & {
        addCuePoints?: (
          cuePoints: Array<{ startTime: number; value: unknown }>
        ) => void;
      };

      const duration = player.duration;
      if (!duration || duration === Infinity) return;

      setDuration(duration);

      // Add cue points to Mux Player using native API (uses filtered list)
      if (typeof player.addCuePoints === "function") {
        const muxCuePoints = filteredCuePoints.map((cp) => ({
          startTime: cp.timestamp,
          value: { cuePoint: cp },
        }));
        player.addCuePoints(muxCuePoints);
      }
    },
    [filteredCuePoints, setDuration]
  );

  /**
   * Handle cue point change from Mux Player.
   * Stores active cue point for automatic interaction type routing.
   */
  const handleCuePointChange = useCallback(
    (event: Event) => {
      const player = event.target as HTMLVideoElement & {
        activeCuePoint?: { value?: { cuePoint?: CuePoint } };
      };

      const activeCuePoint = player.activeCuePoint?.value?.cuePoint;
      if (activeCuePoint && !activeCuePoint.completed) {
        // Cast to InteractionCuePoint for type/prompt/etc fields
        const interactionCuePoint = activeCuePoint as InteractionCuePoint;
        setActiveInteraction(interactionCuePoint);
        handleCuePointReached(activeCuePoint);
        onInteractionRequired?.(activeCuePoint);
      }
    },
    [handleCuePointReached, onInteractionRequired]
  );

  /**
   * Handle interaction completion from auto-rendered components.
   * Marks cue point as completed and resumes video.
   */
  const handleInteractionDone = useCallback(() => {
    if (!activeInteraction) return;

    // 1. Mark current cue point completed in the local list
    const updatedCuePoints = context.cuePoints.map((cp) =>
      cp.id === activeInteraction.id ? { ...cp, completed: true } : cp
    );
    setCuePoints(updatedCuePoints);

    // 2. Check for another incomplete interaction at the EXACT same timestamp (grouping)
    const nextInGroup = updatedCuePoints.find(
      (cp) => cp.timestamp === activeInteraction.timestamp && !cp.completed
    );

    if (nextInGroup) {
      // There's another prompt at this time, show it next without resuming
      setActiveInteraction(nextInGroup as InteractionCuePoint);
    } else {
      // All interactions at this timestamp are done
      setActiveInteraction(null);
      completeInteraction();
      onInteractionComplete?.();
      markInteractionComplete().then(triggerCelebrationIfComplete);
    }
  }, [activeInteraction, context.cuePoints, setCuePoints, completeInteraction, onInteractionComplete, markInteractionComplete, triggerCelebrationIfComplete]);

  /**
   * Handle time update - updates state machine and tracks progress.
   */
  const handleTimeUpdate = useCallback(
    (event: Event) => {
      const player = event.target as HTMLVideoElement;
      const currentTime = player.currentTime;
      const duration = player.duration;

      updateTime(currentTime);

      // Track progress if duration is valid
      if (duration && duration !== Infinity && duration > 0) {
        const percent = Math.floor((currentTime / duration) * 100);
        // Only update every 5% to reduce API calls, or at 95%+ for completion
        if (percent >= lastReportedPercentRef.current + 5 || percent >= 95) {
          lastReportedPercentRef.current = percent;
          updateVideoProgress(percent).then(triggerCelebrationIfComplete);
        }
      }
    },
    [updateTime, updateVideoProgress, triggerCelebrationIfComplete]
  );

  /**
   * Handle play event.
   */
  const handlePlay = useCallback(() => {
    // Sync machine state with actual player state
    if (!isInteractionPending && state !== "playing") {
      _play();
    }
  }, [isInteractionPending, state, _play]);

  /**
   * Handle pause event.
   */
  const handlePause = useCallback(() => {
    // Sync machine state with actual player state
    if (!isInteractionPending && state === "playing") {
      _pause();
    }
  }, [isInteractionPending, state, _pause]);

  /**
   * Set up event listeners for cue point detection.
   */
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    // Add event listeners for cue points
    player.addEventListener("durationchange", handleDurationChange);
    player.addEventListener("cuepointchange", handleCuePointChange);
    player.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      player.removeEventListener("durationchange", handleDurationChange);
      player.removeEventListener("cuepointchange", handleCuePointChange);
      player.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [handleDurationChange, handleCuePointChange, handleTimeUpdate, playerRef]);

  /**
   * Handle overlay exit animation complete.
   */
  const handleOverlayExitComplete = useCallback(() => {
    // Animation complete, video should already be resuming
  }, []);

  return (
    <div className={`relative ${className || ""}`}>
      <MuxPlayer
        ref={playerRef}
        playbackId={playbackId}
        streamType="on-demand"
        playbackRates={[0.5, 0.75, 1, 1.25, 1.5, 2]}
        autoPlay={false}
        // Disable native captions (we use custom Ruby-annotated overlays)
        defaultHiddenCaptions={true}
        metadata={{
          video_title: title || "Untitled",
          player_name: "CantoMando Blueprint",
        }}
        onPlay={handlePlay}
        onPause={handlePause}
        onTimeUpdate={handleTimeUpdate as MuxPlayerProps["onTimeUpdate"]}
        style={{ width: "100%", aspectRatio: "16/9" }}
        accentColor={`#${accentColor}`}
        primaryColor="#ffffff"
        secondaryColor="#a1a1aa"
      />

      {/* Subtitle overlay with Ruby annotations */}
      {subtitleCues.length > 0 && (
        <SubtitleOverlay
          currentTime={context.currentTime}
          cues={subtitleCues}
          showPinyin={showPinyin}
          showJyutping={showJyutping}
        />
      )}

      {/* Cue point markers on progress bar */}
      <CuePointMarkers cuePoints={context.cuePoints} duration={context.duration} />

      {/* Annotation toggle controls */}
      <div className="absolute top-4 left-4 flex gap-2 z-20">
        <Button
          variant={showPinyin ? "default" : "secondary"}
          size="sm"
          onClick={togglePinyin}
          className="text-sm font-medium"
          title={showPinyin ? "Hide Pinyin" : "Show Pinyin"}
        >
          <span className="text-yellow-400 mr-1">拼</span>
          <span className="hidden sm:inline">Pinyin</span>
        </Button>
        <Button
          variant={showJyutping ? "default" : "secondary"}
          size="sm"
          onClick={toggleJyutping}
          className="text-sm font-medium"
          title={showJyutping ? "Hide Jyutping" : "Show Jyutping"}
        >
          <span className="text-cyan-400 mr-1">粵</span>
          <span className="hidden sm:inline">Jyutping</span>
        </Button>
      </div>

      {/* Interaction overlay with fade animation */}
      <InteractionOverlay
        isVisible={isInteractionPending}
        onExitComplete={handleOverlayExitComplete}
        sidebarContent={sidebarContent}
      >
        {children || (activeInteraction ? (
          activeInteraction.type === 'video' ? (
            <VideoInteraction
              key={activeInteraction.id}
              interactionId={activeInteraction.interactionId || activeInteraction.id}
              lessonId={lessonId || ''}
              videoPromptId={activeInteraction.videoPromptId || ''}
              prompt={activeInteraction.prompt || 'Record your response'}
              onComplete={handleInteractionDone}
            />
          ) : activeInteraction.type === 'audio' ? (
            <AudioInteraction
              key={activeInteraction.id}
              interactionId={activeInteraction.interactionId || activeInteraction.id}
              lessonId={lessonId || ''}
              prompt={activeInteraction.prompt || 'Record your response'}
              expectedAnswer={activeInteraction.expectedAnswer}
              language={activeInteraction.language || 'both'}
              onComplete={handleInteractionDone}
            />
          ) : (
            <TextInteraction
              key={activeInteraction.id}
              interactionId={activeInteraction.interactionId || activeInteraction.id}
              prompt={activeInteraction.prompt || 'Type your response'}
              expectedAnswer={activeInteraction.expectedAnswer}
              language={activeInteraction.language || 'both'}
              onComplete={handleInteractionDone}
            />
          )
        ) : (
          <div className="text-center text-white">
            <p className="text-lg">Interaction content will appear here</p>
          </div>
        ))}
      </InteractionOverlay>

      {/* Interaction pending indicator (visible when no overlay content) */}
      {isInteractionPending && !children && (
        <div className="absolute top-4 right-4 bg-yellow-500 text-black text-sm font-medium px-3 py-1 rounded-full z-30">
          Interaction Required
        </div>
      )}

      {/* Celebration overlay for lesson completion */}
      <AnimatePresence>
        {celebration.isVisible && (
          <CelebrationOverlay
            type="lesson"
            score={100}
            xpEarned={XP_AMOUNTS.lesson_complete}
            streakCount={0}
            isFirstAttempt={true}
            nextLesson={nextLessonData}
            courseId={courseId}
            onDismiss={celebration.dismiss}
          />
        )}
      </AnimatePresence>
    </div>
  );
});
