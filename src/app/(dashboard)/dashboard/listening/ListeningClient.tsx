"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Clock, Trash2, Play, Pin, GripVertical, Info } from "lucide-react";
import { YouTubePlayer } from "@/components/video/YouTubePlayer";
import type { YouTubePlayer as YTPlayer } from "react-youtube";
import { UrlInput } from "@/components/video/UrlInput";
import { Button } from "@/components/ui/button";
import { CaptionStatus } from "@/components/video/CaptionStatus";
import { CaptionUpload } from "@/components/video/CaptionUpload";
import { TranscriptPanel } from "@/components/video/TranscriptPanel";
import { TranscriptToolbar } from "@/components/video/TranscriptToolbar";
import { DualSubtitleOverlay } from "@/components/video/DualSubtitleOverlay";
import { useVideoSync } from "@/hooks/useVideoSync";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { useTTS } from "@/hooks/useTTS";
import { useCharacterPopup } from "@/hooks/useCharacterPopup";
import { CharacterPopup } from "@/components/reader/CharacterPopup";
import { convertScript, type ScriptMode } from "@/lib/chinese-convert";
import { segmentText } from "@/lib/segmenter";
import type { AnnotationMode } from "@/components/reader/WordSpan";
import { ProductWalkthrough, type WalkthroughStep } from "@/components/onboarding/ProductWalkthrough";
import { useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useFeatureEngagement } from "@/hooks/useFeatureEngagement";

type CaptionLine = {
  text: string;
  startMs: number;
  endMs: number;
  sequence: number;
};

const ONBOARDING_FALLBACK_CAPTIONS: CaptionLine[] = [
  { text: "欢迎来到 CMB Lab。", startMs: 0, endMs: 2600, sequence: 1 },
  { text: "这里是 YouTube Listening Lab。", startMs: 2600, endMs: 5600, sequence: 2 },
  { text: "你可以点击字幕来跳转播放位置。", startMs: 5600, endMs: 9000, sequence: 3 },
  { text: "也可以点击喇叭按钮听句子音频。", startMs: 9000, endMs: 12400, sequence: 4 },
  { text: "完成后你就可以开始自己的练习。", startMs: 12400, endMs: 16000, sequence: 5 },
];

type CaptionStatusType =
  | "idle"
  | "loading"
  | "success"
  | "no_captions"
  | "provider_blocked"
  | "error"
  | "transcribing"
  | "unsupported_language";

/**
 * ListeningClient -- Main orchestrator for the Video Listening Lab page.
 *
 * Flow:
 *   1. User pastes YouTube URL via UrlInput
 *   2. On submit: extract videoId, POST /api/video/extract-captions
 *   3. Show YouTubePlayer + CaptionStatus + CaptionUpload (fallback)
 *   4. On upload: replace captions and update status
 *
 * Practice features:
 *   - Loop mode: select a transcript range, video loops that section
 *   - Auto-pause: pauses after each caption line, "click to continue" resumes
 */
export function ListeningClient() {
  const { trackAction } = useFeatureEngagement("youtube_listening_lab");
  const STARTER_VIDEO_URL = "https://www.youtube.com/watch?v=CcHWoRtK0fw&t=1215s";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const canRunWalkthrough = Boolean(user);
  const onboardingDoneKey = `cmb.onboarding.walkthrough.done.v1.${user?.id ?? "anonymous"}`;
  const isListeningStage = searchParams.get("onboarding") === "1" && searchParams.get("stage") === "listening";
  const [hasClickedLoadForTour, setHasClickedLoadForTour] = useState(false);
  const [loadClickSignal, setLoadClickSignal] = useState(0);
  const [transcriptLineClickSignal, setTranscriptLineClickSignal] = useState(0);
  const [firstLineAudioClickSignal, setFirstLineAudioClickSignal] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [captions, setCaptions] = useState<CaptionLine[] | null>(null);
  const [captionStatus, setCaptionStatus] =
    useState<CaptionStatusType>("idle");
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);

  const isMandarinOrCantonese = useCallback((lines: CaptionLine[]) => {
    if (!lines || lines.length === 0) return false;
    const sample = lines.map((l) => l.text).join("").replace(/\s+/g, "");
    if (!sample) return false;
    const hanMatches = sample.match(/[\u4E00-\u9FFF]/g) ?? [];
    const hanCount = hanMatches.length;
    const ratio = hanCount / sample.length;
    return hanCount >= 6 && ratio >= 0.08;
  }, []);

  // Progress tracking state
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoDurationMs, setVideoDurationMs] = useState<number | null>(null);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const playerLocalRef = useRef<YTPlayer | null>(null);
  const durationCapturedRef = useRef(false);
  const resumePositionRef = useRef<number | null>(null);

  // Recent video sessions (max 5 saved)
  type RecentSession = {
    id: string;
    youtubeVideoId: string;
    youtubeUrl: string;
    title: string | null;
    captionCount: number;
    completionPercent: number;
    updatedAt: string;
  };
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);

  type Recommendation = {
    id: string;
    youtubeUrl: string;
    youtubeVideoId: string;
    videoTitle: string;
    channelName: string;
    thumbnailUrl: string;
    pinned: boolean;
    sortOrder: number;
    createdAt: string;
  };
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recommendationUrl, setRecommendationUrl] = useState("");
  const [isSavingRecommendation, setIsSavingRecommendation] = useState(false);
  const [canManageRecommendations, setCanManageRecommendations] = useState(false);
  const [draggingRecommendationId, setDraggingRecommendationId] = useState<string | null>(null);
  const autoTranscribeAttemptedKeyRef = useRef<string | null>(null);

  // Usage limit state
  const [usageInfo, setUsageInfo] = useState<{
    used: number;
    limit: number;
    period: string;
    remaining: number;
  } | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/video/usage");
      if (res.ok) {
        const data = await res.json();
        setUsageInfo(data);
      }
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Fetch recent sessions on mount
  useEffect(() => {
    fetch("/api/video/sessions")
      .then((res) => res.json())
      .then((data) => {
        if (data.sessions) setRecentSessions(data.sessions);
      })
      .catch(() => {});
  }, []);

  const fetchRecommendations = useCallback(async () => {
    try {
      const res = await fetch("/api/listening/recommendations");
      if (!res.ok) return;
      const data = await res.json();
      setRecommendations(data.recommendations ?? []);
      setCanManageRecommendations(Boolean(data.canManage));
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  const handleDeleteSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/video/sessions?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setRecentSessions((prev) => prev.filter((s) => s.id !== id));
    }
  }, []);

  const handleAddRecommendation = useCallback(async () => {
    const youtubeUrl = recommendationUrl.trim();
    if (!youtubeUrl || !canManageRecommendations) return;

    setIsSavingRecommendation(true);
    try {
      const res = await fetch("/api/listening/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error || "Failed to add recommendation");
        return;
      }
      setRecommendationUrl("");
      await fetchRecommendations();
    } finally {
      setIsSavingRecommendation(false);
    }
  }, [canManageRecommendations, fetchRecommendations, recommendationUrl]);

  const handleRemoveRecommendation = useCallback(
    async (id: string) => {
      if (!canManageRecommendations) return;
      const res = await fetch(`/api/listening/recommendations?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      setRecommendations((prev) => prev.filter((item) => item.id !== id));
    },
    [canManageRecommendations],
  );

  const persistRecommendationOrder = useCallback(async (items: Recommendation[]) => {
    await fetch("/api/listening/recommendations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", ids: items.map((i) => i.id) }),
    });
  }, []);

  const handleReorderRecommendation = useCallback(
    async (fromId: string, toId: string) => {
      if (!canManageRecommendations || fromId === toId) return;
      setRecommendations((prev) => {
        const fromIndex = prev.findIndex((i) => i.id === fromId);
        const toIndex = prev.findIndex((i) => i.id === toId);
        if (fromIndex < 0 || toIndex < 0) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        void persistRecommendationOrder(next);
        return next;
      });
    },
    [canManageRecommendations, persistRecommendationOrder],
  );

  const handleTogglePinRecommendation = useCallback(
    async (item: Recommendation) => {
      if (!canManageRecommendations) return;
      const res = await fetch("/api/listening/recommendations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pin",
          id: item.id,
          pinned: !item.pinned,
        }),
      });
      if (!res.ok) return;
      await fetchRecommendations();
    },
    [canManageRecommendations, fetchRecommendations],
  );

  const handleLoadSession = useCallback(
    (session: RecentSession) => {
      trackAction("load_recent_video", { sessionId: session.id });
      // Trigger the same flow as URL submit
      const url = session.youtubeUrl || `https://www.youtube.com/watch?v=${session.youtubeVideoId}`;
      setVideoId(session.youtubeVideoId);
      setIsLoadingVideo(true);
      setCaptionStatus("loading");
      setCaptions(null);
      setSessionId(null);
      setEnglishCaptions(null);
      setEnglishTranslations(null);
      setShowChineseSubs(false);
      setShowEnglishSubs(false);
      autoTranscribeAttemptedKeyRef.current = null;
      setVideoDurationMs(null);
      setVideoTitle(null);
      durationCapturedRef.current = false;
      resumePositionRef.current = null;

      fetch("/api/video/extract-captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: session.youtubeVideoId, url }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (res.status === 429 && data.error === "usage_limit_reached") {
            setCaptionStatus("error");
            setTranscribeError(
              `You've reached your ${data.period} limit of ${data.limit} transcriptions. The Canto to Mando Blueprint team will review and adjust the usage limit cap from time to time.`
            );
            fetchUsage();
            return;
          }
          return data;
        })
        .then((data) => {
          if (!data) return;
          if (data.error === "youtube_access_blocked") {
            setCaptionStatus("provider_blocked");
            setTranscribeError(
              "YouTube blocked server-side transcript access for this video. Please upload an SRT/VTT file.",
            );
            setSessionId(data.session?.id ?? null);
            return;
          }
          if (data.error === "no_chinese_captions") {
            setCaptionStatus("no_captions");
            setSessionId(data.session?.id ?? null);
            return;
          }
          const nextCaptions = data.captions ?? [];
          if (!isMandarinOrCantonese(nextCaptions)) {
            setCaptions([]);
            setEnglishCaptions(null);
            setCaptionStatus("unsupported_language");
            setSessionId(data.session?.id ?? null);
            return;
          }
          setCaptions(nextCaptions);
          setEnglishCaptions(data.englishCaptions ?? null);
          setSessionId(data.session?.id ?? null);
          setCaptionStatus(
            data.captions && data.captions.length > 0 ? "success" : "no_captions"
          );
          if (data.session?.lastPositionMs && data.session.lastPositionMs > 0) {
            resumePositionRef.current = data.session.lastPositionMs;
          }
        })
        .catch(() => {
          setCaptionStatus("error");
        })
        .finally(() => {
          setIsLoadingVideo(false);
        });
    },
    [isMandarinOrCantonese, trackAction, fetchUsage]
  );

  // Vocabulary encounter tracking -- batched client-side, flushed periodically
  const pendingEncountersRef = useRef(new Set<string>());

  const {
    activeCaptionIndex,
    handlePlayerReady,
    handlePlay,
    handlePause,
    handleEnd,
    seekToCaption,
    playbackRate,
    setPlaybackRate,
    availableRates,
    currentTimeMs,
    // Loop range
    loopRange,
    setLoopRange,
    // Auto-pause
    autoPauseEnabled,
    setAutoPauseEnabled,
    isAutoPaused,
    resumeFromAutoPause,
    // Video control
    pauseVideo,
  } = useVideoSync(captions ?? []);

  // Watch progress tracking
  useWatchProgress({
    sessionId,
    currentTimeMs,
    videoDurationMs,
    isPlaying,
    videoTitle,
  });

  // Flush pending vocabulary encounters to the server
  const flushEncounters = useCallback(() => {
    if (!sessionId || pendingEncountersRef.current.size === 0) return;
    const words = Array.from(pendingEncountersRef.current);
    pendingEncountersRef.current.clear();
    try {
      fetch("/api/video/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, words }),
      }).catch(() => {
        // Fire-and-forget: silently handle errors
      });
    } catch {
      // Silently handle synchronous errors
    }
  }, [sessionId]);

  // Flush encounters every 15 seconds while session is active
  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(flushEncounters, 15_000);
    return () => clearInterval(interval);
  }, [sessionId, flushEncounters]);

  // Flush encounters on page leave via sendBeacon (more reliable than fetch on unload)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "hidden" &&
        sessionId &&
        pendingEncountersRef.current.size > 0
      ) {
        const words = Array.from(pendingEncountersRef.current);
        pendingEncountersRef.current.clear();
        navigator.sendBeacon(
          "/api/video/encounters",
          new Blob([JSON.stringify({ sessionId, words })], {
            type: "application/json",
          })
        );
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [sessionId]);

  // Wrap handlePlayerReady to capture player ref locally + resume from last position
  const wrappedHandlePlayerReady = useCallback(
    (player: YTPlayer) => {
      playerLocalRef.current = player;
      handlePlayerReady(player);

      // Resume from last position if available
      const resumeMs = resumePositionRef.current;
      if (resumeMs && resumeMs > 0) {
        player.seekTo(resumeMs / 1000, true);
        resumePositionRef.current = null; // Only resume once
      }
    },
    [handlePlayerReady]
  );

  // Capture video duration and title on first play event
  const handleFirstPlay = useCallback(() => {
    if (durationCapturedRef.current || !playerLocalRef.current) return;
    durationCapturedRef.current = true;

    const player = playerLocalRef.current;
    const durationSec = player.getDuration() as unknown as number;
    if (durationSec > 0) {
      setVideoDurationMs(Math.round(durationSec * 1000));
    }

    try {
      const videoData = (player as unknown as { getVideoData: () => { title?: string } }).getVideoData();
      if (videoData?.title) {
        setVideoTitle(videoData.title);
      }
    } catch {
      // getVideoData may not be available in all contexts
    }
  }, []);

  // Wrap handlePlay to track isPlaying state and capture duration
  const wrappedHandlePlay = useCallback(() => {
    handleFirstPlay();
    setIsPlaying(true);
    handlePlay();
  }, [handleFirstPlay, handlePlay]);

  // Wrap handlePause to track isPlaying state
  const wrappedHandlePause = useCallback(() => {
    setIsPlaying(false);
    handlePause();
  }, [handlePause]);

  // Wrap handleEnd to track isPlaying state
  const wrappedHandleEnd = useCallback(() => {
    setIsPlaying(false);
    handleEnd();
  }, [handleEnd]);

  // TTS state
  const { speak, stop: stopTts, isLoading: ttsLoading, isPlaying: ttsPlaying } = useTTS();
  const [ttsLineIndex, setTtsLineIndex] = useState(-1);

  // Character popup state
  const {
    activeWord,
    isVisible: popupVisible,
    lookupData,
    characterData,
    characterFallbacks,
    isLoading: popupLoading,
    error: popupError,
    virtualEl,
    showPopup,
    hidePopup,
    cancelHide,
    isSaved,
    getSavedId,
    toggleSave,
    ensureSaved,
    savedVocabMap,
  } = useCharacterPopup();

  // Subtitle state
  const [englishCaptions, setEnglishCaptions] = useState<CaptionLine[] | null>(null);
  const [showChineseSubs, setShowChineseSubs] = useState(false);
  const [showEnglishSubs, setShowEnglishSubs] = useState(false);

  // AI-generated English translations for transcript panel
  const [englishTranslations, setEnglishTranslations] = useState<string[] | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // Toolbar state
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>("plain");
  const [scriptMode, setScriptMode] = useState<ScriptMode>("original");
  const [displayTexts, setDisplayTexts] = useState<string[] | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  // Jieba segmentation state (server-side, better quality than Intl.Segmenter)
  const [jiebaSegments, setJiebaSegments] = useState<
    Array<Array<{ text: string; isWordLike: boolean }>> | null
  >(null);

  // Loop selection state (UI-only, distinct from the active loop range in useVideoSync)
  const [loopModeActive, setLoopModeActive] = useState(false);
  const [loopSelectionStart, setLoopSelectionStart] = useState<number | null>(null);

  // T/S conversion effect (follows ReaderClient pattern)
  useEffect(() => {
    if (!captions || captions.length === 0 || scriptMode === "original") {
      setDisplayTexts(null);
      return;
    }

    let cancelled = false;
    setIsConverting(true);

    Promise.all(
      captions.map((c) => convertScript(c.text, "original", scriptMode))
    )
      .then((converted) => {
        if (!cancelled) {
          setDisplayTexts(converted);
        }
      })
      .catch((err) => {
        console.error("T/S conversion failed:", err);
        if (!cancelled) {
          setDisplayTexts(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsConverting(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [captions, scriptMode]);

  // Fetch jieba segmentation whenever the displayed texts change
  useEffect(() => {
    if (!captions || captions.length === 0) {
      setJiebaSegments(null);
      return;
    }

    const textsToSegment = displayTexts ?? captions.map((c) => c.text);
    let cancelled = false;

    fetch("/api/segment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: textsToSegment }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.segments) {
          setJiebaSegments(data.segments);
        }
      })
      .catch(() => {
        // Silently fall back to Intl.Segmenter (TranscriptLine default)
      });

    return () => {
      cancelled = true;
    };
  }, [captions, displayTexts]);

  // Fetch AI English translations when English subs are toggled on
  useEffect(() => {
    if (!showEnglishSubs || !captions || captions.length === 0) return;
    // Skip if we already have good translations for this set of captions
    if (
      englishTranslations &&
      englishTranslations.length === captions.length &&
      englishTranslations.some((t) => t.length > 0)
    ) return;

    let cancelled = false;
    setIsTranslating(true);

    const textsToTranslate = displayTexts ?? captions.map((c) => c.text);

    fetch("/api/video/translate-captions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: textsToTranslate }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.translations) {
          setEnglishTranslations(data.translations);
        }
      })
      .catch(() => {
        // Silently fail — user can retry by toggling off/on
      })
      .finally(() => {
        if (!cancelled) setIsTranslating(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEnglishSubs, captions, englishCaptions]);

  // Compute vocab stats from segmented display texts + savedVocabMap
  const vocabStats = useMemo(() => {
    if (!captions || captions.length === 0) return null;
    const uniqueWords = new Set<string>();

    if (jiebaSegments) {
      // Use jieba segments for better accuracy
      for (const lineSegs of jiebaSegments) {
        for (const seg of lineSegs) {
          if (seg.isWordLike) uniqueWords.add(seg.text);
        }
      }
    } else {
      // Fallback to Intl.Segmenter
      const textsToSegment = displayTexts ?? captions.map((c) => c.text);
      for (const text of textsToSegment) {
        for (const seg of segmentText(text)) {
          if (seg.isWordLike) uniqueWords.add(seg.text);
        }
      }
    }

    let known = 0;
    for (const word of uniqueWords) {
      if (savedVocabMap.has(word)) known++;
    }
    return { known, unknown: uniqueWords.size - known, total: uniqueWords.size };
  }, [captions, displayTexts, jiebaSegments, savedVocabMap]);

  // Derive savedVocabSet for TranscriptPanel highlight matching
  const savedVocabSet = useMemo(
    () => new Set(savedVocabMap.keys()),
    [savedVocabMap]
  );

  // Word click handler -- triggers popup on tap/click + records encounter
  // (Hover-based popup was too sensitive per user feedback)
  const handleWordClick = useCallback(
    (word: string, _index: number, element: HTMLElement) => {
      showPopup(word, element);
      pendingEncountersRef.current.add(word);
    },
    [showPopup]
  );

  // --- Loop mode handlers ---

  const handleLoopRangeSelect = useCallback(
    (index: number) => {
      if (loopSelectionStart === null) {
        // First click: mark start
        setLoopSelectionStart(index);
      } else {
        // Second click: compute range, activate loop
        const startIndex = Math.min(loopSelectionStart, index);
        const endIndex = Math.max(loopSelectionStart, index);
        setLoopRange({ startIndex, endIndex });
        setLoopModeActive(false);
        setLoopSelectionStart(null);
        // Seek to start of loop range
        seekToCaption(startIndex);
      }
    },
    [loopSelectionStart, setLoopRange, seekToCaption]
  );

  const handleToggleLoopMode = useCallback(() => {
    setLoopModeActive((prev) => {
      if (prev) {
        // Turning off: clear partial selection
        setLoopSelectionStart(null);
      }
      return !prev;
    });
  }, []);

  const handleClearLoop = useCallback(() => {
    setLoopRange(null);
    setLoopModeActive(false);
    setLoopSelectionStart(null);
  }, [setLoopRange]);

  // --- Auto-pause handlers ---

  const handleToggleAutoPause = useCallback(() => {
    setAutoPauseEnabled(!autoPauseEnabled);
  }, [autoPauseEnabled, setAutoPauseEnabled]);

  // --- TTS play handler ---

  const handleTtsPlay = useCallback(
    (index: number) => {
      // Get the display text for the line (converted or original)
      const text = displayTexts?.[index] ?? captions?.[index]?.text;
      if (!text) return;

      // Pause video to avoid audio overlap (per research pitfall 5)
      pauseVideo();

      // Track which line is speaking
      setTtsLineIndex(index);

      // Match TTS language to annotation mode: jyutping → Cantonese, else Mandarin
      const ttsLang = annotationMode === "jyutping" ? "zh-HK" : "zh-CN";
      speak(text, { language: ttsLang });
    },
    [displayTexts, captions, pauseVideo, speak, annotationMode]
  );

  const handleTranscriptLineClick = useCallback(
    (index: number) => {
      seekToCaption(index);
      if (isListeningStage) {
        setTranscriptLineClickSignal((prev) => prev + 1);
      }
    },
    [isListeningStage, seekToCaption]
  );

  const handleTranscriptTtsPlay = useCallback(
    (index: number) => {
      handleTtsPlay(index);
      if (isListeningStage && index === 0) {
        setFirstLineAudioClickSignal((prev) => prev + 1);
      }
    },
    [handleTtsPlay, isListeningStage]
  );

  // --- Auto-transcribe handler ---
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const applyOnboardingFallbackCaptions = useCallback(() => {
    if (!isListeningStage) return false;
    setCaptions(ONBOARDING_FALLBACK_CAPTIONS);
    setEnglishCaptions(null);
    setEnglishTranslations(null);
    setCaptionStatus("success");
    setTranscribeError(null);
    return true;
  }, [isListeningStage]);

  const handleTranscribe = useCallback(async () => {
    if (!videoId || !sessionId) return;
    setCaptionStatus("transcribing");
    setTranscribeError(null);

    try {
      const res = await fetch("/api/video/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, sessionId }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "youtube_access_blocked") {
          if (applyOnboardingFallbackCaptions()) return;
          setTranscribeError(
            data.error ??
              "YouTube blocked server-side transcript access for this video. Please upload an SRT/VTT file.",
          );
          setCaptionStatus("provider_blocked");
          return;
        }
        if (applyOnboardingFallbackCaptions()) return;
        setTranscribeError(data.error ?? "Transcription failed");
        setCaptionStatus("no_captions");
        return;
      }

      if (data.captions && data.captions.length > 0) {
        if (!isMandarinOrCantonese(data.captions)) {
          setCaptions([]);
          setCaptionStatus("unsupported_language");
          return;
        }
        setCaptions(data.captions);
        setCaptionStatus("success");
        if (data.session?.id) setSessionId(data.session.id);
      } else {
        if (applyOnboardingFallbackCaptions()) return;
        setTranscribeError("No speech detected in the video audio.");
        setCaptionStatus("no_captions");
      }
    } catch {
      if (applyOnboardingFallbackCaptions()) return;
      setTranscribeError("Transcription request failed. Please try again.");
      setCaptionStatus("no_captions");
    }
  }, [applyOnboardingFallbackCaptions, videoId, sessionId, isMandarinOrCantonese]);

  useEffect(() => {
    if (!videoId || !sessionId) return;
    if (captionStatus !== "no_captions" && captionStatus !== "unsupported_language") return;
    const key = `${videoId}:${sessionId}`;
    if (autoTranscribeAttemptedKeyRef.current === key) return;
    autoTranscribeAttemptedKeyRef.current = key;
    void handleTranscribe();
  }, [captionStatus, handleTranscribe, sessionId, videoId]);

  // --- URL + upload handlers ---

  const handleUrlSubmit = useCallback(
    async (extractedVideoId: string, url: string) => {
      trackAction("load_video", { youtubeVideoId: extractedVideoId });
      setVideoId(extractedVideoId);
      setIsLoadingVideo(true);
      setCaptionStatus("loading");
      setCaptions(null);
      setSessionId(null);
      setEnglishCaptions(null);
      setEnglishTranslations(null);
      setShowChineseSubs(false);
      setShowEnglishSubs(false);
      autoTranscribeAttemptedKeyRef.current = null;
      // Reset progress state for new video load
      setVideoDurationMs(null);
      setVideoTitle(null);
      durationCapturedRef.current = false;
      resumePositionRef.current = null;

      try {
        const res = await fetch("/api/video/extract-captions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: extractedVideoId, url }),
        });

        const data = await res.json();

        if (res.status === 429 && data.error === "usage_limit_reached") {
          setCaptionStatus("error");
          setTranscribeError(
            `You've reached your ${data.period} limit of ${data.limit} transcriptions. The Canto to Mando Blueprint team will review and adjust the usage limit cap from time to time.`
          );
          await fetchUsage();
          return;
        }

        if (!res.ok) {
          setCaptionStatus("error");
          return;
        }

        if (data.error === "youtube_access_blocked") {
          if (applyOnboardingFallbackCaptions()) return;
          setCaptionStatus("provider_blocked");
          setTranscribeError(
            "YouTube blocked server-side transcript access for this video. Please upload an SRT/VTT file.",
          );
          setSessionId(data.session?.id ?? null);
          return;
        }

        if (data.error === "no_chinese_captions") {
          if (applyOnboardingFallbackCaptions()) return;
          setCaptionStatus("no_captions");
          setSessionId(data.session?.id ?? null);
          return;
        }

        const nextCaptions = data.captions ?? [];
        if (!isMandarinOrCantonese(nextCaptions)) {
          if (applyOnboardingFallbackCaptions()) return;
          setCaptions([]);
          setEnglishCaptions(null);
          setCaptionStatus("unsupported_language");
          setSessionId(data.session?.id ?? null);
          return;
        }
        setCaptions(nextCaptions);
        setEnglishCaptions(data.englishCaptions ?? null);
        setSessionId(data.session?.id ?? null);
        setCaptionStatus(
          data.captions && data.captions.length > 0 ? "success" : "no_captions"
        );

        // Store resume position if session has previous progress
        if (data.session?.lastPositionMs && data.session.lastPositionMs > 0) {
          resumePositionRef.current = data.session.lastPositionMs;
        }
      } catch {
        if (applyOnboardingFallbackCaptions()) return;
        setCaptionStatus("error");
      } finally {
        setIsLoadingVideo(false);
        fetchUsage();
      }
    },
    [applyOnboardingFallbackCaptions, isMandarinOrCantonese, trackAction, fetchUsage]
  );

  const handleUploadComplete = useCallback(
    (uploadedCaptions: CaptionLine[]) => {
      trackAction("upload_captions");
      if (!isMandarinOrCantonese(uploadedCaptions)) {
        setCaptions([]);
        setCaptionStatus("unsupported_language");
        return;
      }
      setCaptions(uploadedCaptions);
      setCaptionStatus("success");
    },
    [isMandarinOrCantonese, trackAction]
  );

  // Compute the effective loop range for display:
  // When first click is made during selection, show a preview range of just that line
  const effectiveLoopRange = loopRange
    ?? (loopSelectionStart !== null
      ? { startIndex: loopSelectionStart, endIndex: loopSelectionStart }
      : null);

  const walkthroughSteps = useMemo<WalkthroughStep[]>(() => {
    return [
      {
        id: "listening-intro",
        title: "YouTube Listening Lab",
        description: "Train listening with real YouTube content and interactive transcript support.",
        target: "[data-tour-id='listening-header']",
      },
      {
        id: "listening-url",
        title: "Load a Video",
        description: "Use the prefilled YouTube link, then click Load Video.",
        target: "[data-tour-id='listening-load-video-button']",
        completed: hasClickedLoadForTour,
        blockedMessage: "Please click the highlighted Load Video button to continue.",
        autoAdvanceOnComplete: true,
        strictTarget: true,
      },
      {
        id: "listening-history",
        title: "Resume Fast",
        description: "Use Watch History to reopen recent videos and continue from your saved progress.",
        target: "[data-tour-id='listening-history-link']",
      },
      {
        id: "listening-transcript",
        title: "Transcript Workspace",
        description: "This is your main practice area: controls on top and timestamped transcript lines below.",
        target: "[data-tour-id='listening-transcript-area']",
        placement: "top",
        completed: Boolean(captions && captions.length > 0),
        blockedMessage: "Waiting for transcript to load. Please wait a moment.",
        autoAdvanceOnComplete: true,
      },
      {
        id: "listening-transcript-toolbar",
        title: "Control Bar",
        description: "Use this row to switch annotation/script style, change speed, toggle subtitles, and set loop or auto-pause.",
        target: "[data-tour-id='listening-transcript-toolbar']",
        placement: "bottom",
      },
      {
        id: "listening-transcript-line",
        title: "Jump by Line",
        description: "Click this highlighted transcript line to jump video playback to that timestamp.",
        target: "[data-tour-id='listening-transcript-first-line']",
        placement: "bottom",
        bubbleOffsetY: 10,
      },
      {
        id: "listening-transcript-tts",
        title: "Line Audio",
        description: "Click the speaker icon to play line-level audio support for this transcript sentence.",
        target: "[data-tour-id='listening-transcript-first-line-audio']",
        placement: "bottom",
        bubbleOffsetY: 10,
      },
      {
        id: "listening-footer",
        title: "Source & Quality Notes",
        description: "Review this bottom notice about AI limits and YouTube creator credit guidance, then click Finish.",
        target: "[data-tour-id='listening-disclaimer-credit']",
        placement: "top",
        requireTargetVisible: true,
        strictTarget: true,
      },
    ];
  }, [
    captions,
    firstLineAudioClickSignal,
    hasClickedLoadForTour,
    transcriptLineClickSignal,
  ]);

  const handleListeningStepChange = useCallback(
    (step: WalkthroughStep, _index: number, direction: "start" | "forward" | "back") => {
      if (!isListeningStage || direction !== "back") return;

      if (step.id === "listening-url") {
        setHasClickedLoadForTour(false);
        return;
      }

      if (step.id === "listening-transcript-line") {
        setTranscriptLineClickSignal(0);
        return;
      }

      if (step.id === "listening-transcript-tts") {
        setFirstLineAudioClickSignal(0);
      }
    },
    [isListeningStage],
  );

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    if (isListeningStage) return;
    const done = window.localStorage.getItem(onboardingDoneKey) === "done";
    if (!done) {
      router.replace("/dashboard/reader?onboarding=1");
    }
  }, [isListeningStage, onboardingDoneKey, router, user]);

  useEffect(() => {
    if (!isListeningStage) return;
    setHasClickedLoadForTour(false);
    setLoadClickSignal(0);
    setTranscriptLineClickSignal(0);
    setFirstLineAudioClickSignal(0);
  }, [isListeningStage]);

  return (
    <div className="flex flex-col gap-6 p-6 min-h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between" data-tour-id="listening-header">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            YouTube Listening Lab
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {videoId
              ? "Playing video"
              : "Paste a YouTube URL to start practicing"}
          </p>
        </div>
        <Link
          href="/dashboard/listening/history"
          data-tour-id="listening-history-link"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Clock className="h-4 w-4" />
          Watch History
        </Link>
      </div>

      {/* URL Input -- always visible at top */}
      <div data-tour-id="listening-url-input">
        <UrlInput
          onSubmit={handleUrlSubmit}
          isLoading={isLoadingVideo}
          defaultUrl={STARTER_VIDEO_URL}
          onSubmitAttempt={() => {
            setHasClickedLoadForTour(true);
            setLoadClickSignal((prev) => prev + 1);
          }}
          submitButtonTourId="listening-load-video-button"
        />
      </div>

      {/* Usage limit notice for students */}
      {usageInfo && usageInfo.limit > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">
                {usageInfo.remaining} of {usageInfo.limit}
              </span>{" "}
              transcriptions remaining this {usageInfo.period === "daily" ? "day" : usageInfo.period === "weekly" ? "week" : "month"}.
              {usageInfo.remaining === 0 && (
                <span className="ml-1 text-destructive font-medium">Limit reached.</span>
              )}
            </p>
            <p className="mt-1 text-muted-foreground/80">
              The Canto to Mando Blueprint team will review and adjust the usage limit cap from time to time.
            </p>
          </div>
        </div>
      )}

      {/* Recent Videos -- shown when no video is loaded */}
      {!videoId && recentSessions.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            Recent Videos ({recentSessions.length}/5)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {recentSessions.map((session) => (
              <div
                key={session.id}
                className="group relative rounded-lg border border-border bg-card/70 overflow-hidden hover:border-primary/40 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => handleLoadSession(session)}
                  className="w-full text-left"
                >
                  <div className="relative aspect-video">
                    <img
                      src={`https://i.ytimg.com/vi/${session.youtubeVideoId}/mqdefault.jpg`}
                      alt={session.title ?? "Video"}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                      <Play className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {/* Completion bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-border">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${Math.min(100, session.completionPercent)}%` }}
                      />
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-xs text-foreground/90 line-clamp-2 leading-snug">
                      {session.title ?? "Untitled"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {session.captionCount} captions
                    </p>
                  </div>
                </button>
                {/* Delete button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSession(session.id);
                  }}
                  className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Delete video"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video + Caption area -- shown when videoId is set */}
      {videoId && captions && captions.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <YouTubePlayer
              videoId={videoId}
              onReady={wrappedHandlePlayerReady}
              onPlay={wrappedHandlePlay}
              onPause={wrappedHandlePause}
              onEnd={wrappedHandleEnd}
            >
              <DualSubtitleOverlay
                currentTimeMs={currentTimeMs}
                chineseCaptions={captions}
                englishCaptions={englishCaptions}
                showChinese={showChineseSubs}
                showEnglish={showEnglishSubs}
              />
            </YouTubePlayer>
            <CaptionStatus
              status={captionStatus}
              captionCount={captions.length}
            />
            {sessionId && (
              <CaptionUpload
                videoSessionId={sessionId}
                onUploadComplete={handleUploadComplete}
                hasExistingCaptions={true}
              />
            )}
          </div>
          <div className="lg:h-[calc(100vh-12rem)] h-[50vh] bg-card/70 rounded-lg border border-border overflow-hidden flex flex-col">
            <div data-tour-id="listening-transcript-area">
              <div data-tour-id="listening-transcript-toolbar">
                <TranscriptToolbar
                  annotationMode={annotationMode}
                  scriptMode={scriptMode}
                  onAnnotationModeChange={setAnnotationMode}
                  onScriptModeChange={setScriptMode}
                  vocabStats={vocabStats}
                  isConverting={isConverting}
                  playbackRate={playbackRate}
                  availableRates={availableRates}
                  onPlaybackRateChange={setPlaybackRate}
                  showChineseSubs={showChineseSubs}
                  showEnglishSubs={showEnglishSubs}
                  onToggleChineseSubs={() => setShowChineseSubs((p) => !p)}
                  onToggleEnglishSubs={() => setShowEnglishSubs((p) => !p)}
                  hasEnglishCaptions={true}
                  // Loop mode
                  loopModeActive={loopModeActive}
                  onToggleLoopMode={handleToggleLoopMode}
                  loopRange={loopRange}
                  onClearLoop={handleClearLoop}
                  // Auto-pause
                  autoPauseEnabled={autoPauseEnabled}
                  onToggleAutoPause={handleToggleAutoPause}
                  isAutoPaused={isAutoPaused}
                  onResumeFromAutoPause={resumeFromAutoPause}
                />
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <TranscriptPanel
                captions={captions}
                activeCaptionIndex={activeCaptionIndex}
                onLineClick={handleTranscriptLineClick}
                annotationMode={annotationMode}
                onWordClick={handleWordClick}
                isPopupVisible={popupVisible}
                displayTexts={displayTexts ?? undefined}
                savedVocabSet={savedVocabSet}
                jiebaSegments={jiebaSegments ?? undefined}
                loopModeActive={loopModeActive}
                loopRange={effectiveLoopRange}
                onLoopRangeSelect={handleLoopRangeSelect}
                onTtsPlay={handleTranscriptTtsPlay}
                ttsLineIndex={ttsLineIndex}
                isTtsLoading={ttsLoading}
                isTtsPlaying={ttsPlaying}
                englishTexts={showEnglishSubs ? (englishTranslations ?? undefined) : undefined}
                firstLineTourId="listening-transcript-first-line"
                firstLineTtsTourId="listening-transcript-first-line-audio"
              />
            </div>
          </div>
        </div>
      ) : videoId ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <YouTubePlayer
              videoId={videoId}
              onReady={wrappedHandlePlayerReady}
              onPlay={wrappedHandlePlay}
              onPause={wrappedHandlePause}
              onEnd={wrappedHandleEnd}
            />
          </div>
          <div className="space-y-4">
            <CaptionStatus
              status={captionStatus}
              captionCount={captions?.length ?? 0}
              onTranscribe={handleTranscribe}
              transcribeError={transcribeError}
            />
            {(captionStatus === "no_captions" ||
              captionStatus === "provider_blocked" ||
              captionStatus === "error" ||
              captionStatus === "success" ||
              captionStatus === "unsupported_language") &&
              sessionId && (
                <CaptionUpload
                  videoSessionId={sessionId}
                  onUploadComplete={handleUploadComplete}
                  hasExistingCaptions={captionStatus === "success"}
                />
              )}
          </div>
        </div>
      ) : null}

      <CharacterPopup
        isVisible={popupVisible}
        virtualEl={virtualEl}
        activeWord={activeWord}
        lookupData={lookupData}
        characterData={characterData}
        characterFallbacks={characterFallbacks}
        isLoading={popupLoading}
        error={popupError}
        isSaved={
          activeWord
            ? isSaved(lookupData?.entries[0]?.traditional ?? activeWord)
            : false
        }
        savedItemId={
          activeWord
            ? savedVocabMap.get(
                lookupData?.entries[0]?.traditional ?? activeWord
              ) ?? null
            : null
        }
        onToggleSave={() => {
          const entry = lookupData?.entries[0];
          if (entry) toggleSave(entry);
        }}
        onEnsureSaved={() => {
          const entry = lookupData?.entries[0];
          if (entry) return ensureSaved(entry);
          return Promise.resolve(null);
        }}
        onHide={hidePopup}
        onCancelHide={cancelHide}
      />

      {/* Team Recommendations (all users can view; coach/admin can manage) */}
      {(canManageRecommendations || recommendations.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">
              Some Recommendations From CMB Team!
            </h2>
          </div>

          {canManageRecommendations && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="url"
                value={recommendationUrl}
                onChange={(e) => setRecommendationUrl(e.target.value)}
                placeholder="Paste YouTube URL..."
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button
                type="button"
                onClick={handleAddRecommendation}
                disabled={!recommendationUrl.trim() || isSavingRecommendation}
              >
                {isSavingRecommendation ? "Saving..." : "Add"}
              </Button>
            </div>
          )}

          {recommendations.length === 0 ? (
            <div className="rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
              No recommendations yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recommendations.map((item) => (
                <div
                  key={item.id}
                  draggable={canManageRecommendations}
                  onDragStart={() => setDraggingRecommendationId(item.id)}
                  onDragOver={(e) => {
                    if (canManageRecommendations) e.preventDefault();
                  }}
                  onDrop={() => {
                    if (canManageRecommendations && draggingRecommendationId) {
                      void handleReorderRecommendation(draggingRecommendationId, item.id);
                    }
                    setDraggingRecommendationId(null);
                  }}
                  className="group relative overflow-hidden rounded-lg border border-border bg-card/70"
                >
                  <button
                    type="button"
                    onClick={() => handleUrlSubmit(item.youtubeVideoId, item.youtubeUrl)}
                    className="w-full text-left"
                  >
                    <div className="relative aspect-video">
                      <img
                        src={item.thumbnailUrl || `https://i.ytimg.com/vi/${item.youtubeVideoId}/mqdefault.jpg`}
                        alt={item.videoTitle}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="line-clamp-2 text-sm font-medium text-foreground">
                        {item.videoTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.channelName}</p>
                    </div>
                  </button>
                  {canManageRecommendations && (
                    <>
                      <div className="absolute left-2 top-2 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <GripVertical className="h-3.5 w-3.5" />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePinRecommendation(item)}
                        className="absolute right-9 top-2 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity hover:text-amber-300 group-hover:opacity-100"
                        aria-label={item.pinned ? "Unpin recommendation" : "Pin recommendation"}
                        title={item.pinned ? "Unpin recommendation" : "Pin recommendation"}
                      >
                        <Pin
                          className={`h-3.5 w-3.5 ${item.pinned ? "fill-amber-300 text-amber-300" : ""}`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveRecommendation(item.id)}
                        className="absolute right-2 top-2 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                        aria-label="Remove recommendation"
                        title="Remove recommendation"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className="pt-6 mt-auto border-t border-border text-xs text-muted-foreground space-y-1"
        data-tour-id="listening-footer"
      >
        <p>
          This is an AI-assisted product. We do not guarantee accuracy or
          completeness. Please verify important information independently.
        </p>
        <p data-tour-id="listening-disclaimer-credit">
          All YouTube videos shown here come from YouTube and their original
          creators (YouTubers). Credits are displayed and not hidden as a form
          of respect.
        </p>
      </div>

      <ProductWalkthrough
        steps={walkthroughSteps}
        storageKey={onboardingDoneKey}
        enabled={canRunWalkthrough}
        autoStart={isListeningStage}
        runToken={isListeningStage ? 1 : 0}
        stepOffset={12}
        totalSteps={12 + walkthroughSteps.length}
        actionSignals={{
          "listening-url": loadClickSignal,
          "listening-transcript-line": transcriptLineClickSignal,
          "listening-transcript-tts": firstLineAudioClickSignal,
        }}
        onStepChange={handleListeningStepChange}
      />
    </div>
  );
}
