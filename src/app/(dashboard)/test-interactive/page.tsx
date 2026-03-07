"use client";

/**
 * Interactive Video Test Page
 *
 * Test page for verifying Phase 3 interactive video features:
 * - Language preference filtering
 * - Text interaction with IME input
 * - AI grading with n8n webhook
 * - Video state machine with pause-for-interaction
 * - Animated overlay with Framer Motion
 * - Ruby-annotated subtitles (Pinyin/Jyutping)
 */

import { useRef, useState, useEffect, useCallback } from "react";
import {
  InteractiveVideoPlayer,
  type InteractiveVideoPlayerRef,
} from "@/components/video/InteractiveVideoPlayer";
import type { SubtitleCue } from "@/types/video";
import type {
  InteractionCuePoint,
  LanguagePreference,
} from "@/lib/interactions";
import { LanguagePreferenceSelector } from "@/components/settings/LanguagePreferenceSelector";
import { TextInteraction } from "@/components/interactions/TextInteraction";
import type { GradingFeedback } from "@/lib/grading";

// Mux demo playback ID (Big Buck Bunny)
const DEMO_PLAYBACK_ID =
  process.env.NEXT_PUBLIC_MUX_PLAYBACK_ID ||
  "23s11nz72DsoN657h4dWb02iQSsbp3002LMr6J2nCcN8w";

// Sample cue points with language filtering for testing
const sampleCuePoints: InteractionCuePoint[] = [
  {
    id: "cue-1",
    timestamp: 5,
    interactionId: "int-1",
    completed: false,
    language: "mandarin",
    prompt: "Write a greeting in Chinese",
    expectedAnswer: "你好",
  },
  {
    id: "cue-2",
    timestamp: 15,
    interactionId: "int-2",
    completed: false,
    language: "cantonese",
    prompt: "How do you say 'thank you' in Cantonese?",
    expectedAnswer: "多谢",
  },
  {
    id: "cue-3",
    timestamp: 25,
    interactionId: "int-3",
    completed: false,
    language: "both",
    prompt: "Write any Chinese character",
    expectedAnswer: "中文",
  },
];

// Sample subtitle cues with Chinese + Pinyin + Jyutping
const sampleSubtitles: SubtitleCue[] = [
  {
    id: "sub-1",
    startTime: 0,
    endTime: 3,
    chinese: "你好",
    pinyin: "nǐ hǎo",
    jyutping: "nei5 hou2",
  },
  {
    id: "sub-2",
    startTime: 3,
    endTime: 6,
    chinese: "我是学生",
    pinyin: "wǒ shì xué shēng",
    jyutping: "ngo5 si6 hok6 saang1",
  },
  {
    id: "sub-3",
    startTime: 6,
    endTime: 10,
    chinese: "欢迎来到这个课程",
    pinyin: "huān yíng lái dào zhè ge kè chéng",
    jyutping: "fun1 jing4 loi4 dou3 ze2 go3 fo3 cing4",
  },
  {
    id: "sub-4",
    startTime: 10,
    endTime: 14,
    chinese: "今天我们学习中文",
    pinyin: "jīn tiān wǒ men xué xí zhōng wén",
    jyutping: "gam1 tin1 ngo5 mun4 hok6 zaap6 zung1 man4",
  },
  {
    id: "sub-5",
    startTime: 14,
    endTime: 18,
    chinese: "请回答这个问题",
    pinyin: "qǐng huí dá zhè ge wèn tí",
    jyutping: "cing2 wui4 daap3 ze2 go3 man6 tai4",
  },
  {
    id: "sub-6",
    startTime: 18,
    endTime: 22,
    chinese: "非常好做得好",
    pinyin: "fēi cháng hǎo zuò de hǎo",
    jyutping: "fei1 soeng4 hou2 zou6 dak1 hou2",
  },
  {
    id: "sub-7",
    startTime: 22,
    endTime: 26,
    chinese: "继续看视频",
    pinyin: "jì xù kàn shì pín",
    jyutping: "gai3 zuk6 hon3 si6 pan2",
  },
  {
    id: "sub-8",
    startTime: 26,
    endTime: 30,
    chinese: "下一个练习",
    pinyin: "xià yī ge liàn xí",
    jyutping: "haa6 jat1 go3 lin6 zaap6",
  },
];

// Sample vocabulary for sidebar
const sampleVocabulary = [
  { chinese: "你好", pinyin: "nǐ hǎo", english: "Hello" },
  { chinese: "学生", pinyin: "xué shēng", english: "Student" },
  { chinese: "欢迎", pinyin: "huān yíng", english: "Welcome" },
  { chinese: "课程", pinyin: "kè chéng", english: "Course" },
  { chinese: "今天", pinyin: "jīn tiān", english: "Today" },
  { chinese: "中文", pinyin: "zhōng wén", english: "Chinese" },
];

export default function TestInteractivePage() {
  const playerRef = useRef<InteractiveVideoPlayerRef>(null);
  const [cuePoints, setCuePoints] =
    useState<InteractionCuePoint[]>(sampleCuePoints);
  const [activeCuePoint, setActiveCuePoint] =
    useState<InteractionCuePoint | null>(null);
  const [languagePreference, setLanguagePreference] =
    useState<LanguagePreference>("both");
  const [debugState, setDebugState] = useState<string>("idle");
  const [debugTime, setDebugTime] = useState<number>(0);
  const [logs, setLogs] = useState<string[]>([]);

  // Log helper
  const log = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)]);
    console.log(`[TestInteractive] ${message}`);
  }, []);

  // Handle interaction required
  const handleInteractionRequired = useCallback(
    (cuePoint: InteractionCuePoint) => {
      setActiveCuePoint(cuePoint);
      setDebugState("pausedForInteraction");
      log(
        `Interaction required at ${cuePoint.timestamp}s (${cuePoint.interactionId}, ${cuePoint.language})`
      );
    },
    [log]
  );

  // Handle interaction complete
  const handleInteractionComplete = useCallback(() => {
    if (activeCuePoint) {
      log(`Interaction completed for ${activeCuePoint.interactionId}`);
      setCuePoints((prev) =>
        prev.map((cp) =>
          cp.id === activeCuePoint.id ? { ...cp, completed: true } : cp
        )
      );
    }
    setActiveCuePoint(null);
    setDebugState("playing");
    playerRef.current?.completeInteraction();
  }, [activeCuePoint, log]);

  // Mock grading function (uses length heuristic for demo)
  const mockGradeResponse = useCallback(
    async (response: string): Promise<GradingFeedback> => {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Mock: responses > 5 characters are "correct"
      const isCorrect = response.length > 5;

      return {
        isCorrect,
        score: isCorrect ? 85 : 40,
        feedback: isCorrect
          ? "Great job! Your response demonstrates understanding."
          : "Try again. Your answer should be longer and more detailed.",
        correctAnswer: activeCuePoint?.expectedAnswer,
      };
    },
    [activeCuePoint]
  );

  // Handle language preference change
  const handleLanguageChange = useCallback(
    (pref: LanguagePreference) => {
      setLanguagePreference(pref);
      log(`Language preference changed to: ${pref}`);
    },
    [log]
  );

  // Update debug state periodically
  const updateDebugInfo = useCallback(() => {
    if (playerRef.current) {
      setDebugState(playerRef.current.getState());
      setDebugTime(playerRef.current.getCurrentTime());
    }
  }, []);

  // Poll for debug updates
  useEffect(() => {
    const interval = setInterval(updateDebugInfo, 500);
    return () => clearInterval(interval);
  }, [updateDebugInfo]);

  // Filter cue points for display based on preference
  const getFilteredCuePointCount = () => {
    if (languagePreference === "both") return cuePoints.length;
    return cuePoints.filter(
      (cp) => cp.language === languagePreference || cp.language === "both"
    ).length;
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Interactive Video Test</h1>
        <p className="text-zinc-400 mb-4">
          Phase 3 verification page - language preference, text interactions,
          and AI grading
        </p>

        {/* Language Preference Selector */}
        <div className="mb-6 flex flex-wrap items-center gap-4 bg-zinc-900 rounded-xl p-4">
          <span className="text-white font-medium">Language Focus:</span>
          <LanguagePreferenceSelector
            onChange={handleLanguageChange}
            className="flex-1"
          />
          <div className="text-sm text-zinc-400">
            Showing {getFilteredCuePointCount()} of {cuePoints.length} cue
            points
          </div>
        </div>

        {/* Language Filtering Explanation */}
        <div className="mb-6 bg-zinc-800/50 rounded-lg p-4 text-sm text-zinc-400">
          <p className="font-medium text-white mb-2">
            Cue Points by Language:
          </p>
          <ul className="space-y-1">
            <li>
              <span className="text-yellow-400">Both Languages:</span> Shows all
              3 cue points (5s, 15s, 25s)
            </li>
            <li>
              <span className="text-blue-400">Mandarin Only:</span> Shows
              Mandarin + Both (5s mandarin, 25s both)
            </li>
            <li>
              <span className="text-cyan-400">Cantonese Only:</span> Shows
              Cantonese + Both (15s cantonese, 25s both)
            </li>
          </ul>
        </div>

        {/* Video Player */}
        <div className="mb-8">
          <InteractiveVideoPlayer
            ref={playerRef}
            playbackId={DEMO_PLAYBACK_ID}
            cuePoints={cuePoints}
            languagePreference={languagePreference}
            subtitleCues={sampleSubtitles}
            onInteractionRequired={(cp) =>
              handleInteractionRequired(cp as InteractionCuePoint)
            }
            onInteractionComplete={handleInteractionComplete}
            title="Test Interactive Video"
            className="rounded-xl overflow-hidden shadow-2xl"
            sidebarContent={
              <div className="space-y-4">
                <h4 className="font-semibold text-white">Vocabulary</h4>
                <div className="space-y-2">
                  {sampleVocabulary.map((item, i) => (
                    <div
                      key={i}
                      className="bg-white/5 rounded-lg p-3 hover:bg-white/10 transition"
                    >
                      <div className="text-lg text-white">{item.chinese}</div>
                      <div className="text-sm text-yellow-400">
                        {item.pinyin}
                      </div>
                      <div className="text-sm text-zinc-400">
                        {item.english}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            }
          >
            {/* Text Interaction content (shown when paused) */}
            {activeCuePoint && (
              <div className="bg-zinc-800/90 rounded-xl p-6 max-w-md mx-auto">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      activeCuePoint.language === "mandarin"
                        ? "bg-blue-500/20 text-blue-400"
                        : activeCuePoint.language === "cantonese"
                          ? "bg-cyan-500/20 text-cyan-400"
                          : "bg-purple-500/20 text-purple-400"
                    }`}
                  >
                    {activeCuePoint.language}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {activeCuePoint.timestamp}s
                  </span>
                </div>
                <TextInteraction
                  interactionId={activeCuePoint.interactionId || activeCuePoint.id}
                  prompt={
                    activeCuePoint.prompt || "Please type your response..."
                  }
                  expectedAnswer={activeCuePoint.expectedAnswer}
                  language={activeCuePoint.language}
                  onComplete={handleInteractionComplete}
                  onSubmit={mockGradeResponse}
                />
                <p className="text-xs text-zinc-500 mt-4">
                  Mock grading: responses &gt; 5 chars pass, shorter fail
                </p>
              </div>
            )}
          </InteractiveVideoPlayer>
        </div>

        {/* Debug Panel */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* State Info */}
          <div className="bg-zinc-900 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">Debug State</h2>
            <div className="space-y-3 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Current State:</span>
                <span
                  className={`font-medium ${
                    debugState === "pausedForInteraction"
                      ? "text-yellow-400"
                      : debugState === "playing"
                        ? "text-green-400"
                        : "text-zinc-300"
                  }`}
                >
                  {debugState}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Current Time:</span>
                <span className="text-white">{debugTime.toFixed(2)}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Language Preference:</span>
                <span className="text-white">{languagePreference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Active Cue Point:</span>
                <span className="text-white">
                  {activeCuePoint
                    ? `${activeCuePoint.id} (${activeCuePoint.language})`
                    : "None"}
                </span>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="font-semibold mb-3">Cue Points</h3>
              <div className="space-y-2">
                {cuePoints.map((cp) => (
                  <div
                    key={cp.id}
                    className={`flex justify-between items-center p-2 rounded ${
                      cp.completed
                        ? "bg-green-500/20 text-green-400"
                        : activeCuePoint?.id === cp.id
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    <span>{cp.id}</span>
                    <span className="text-xs">{cp.language}</span>
                    <span>{cp.timestamp}s</span>
                    <span className="text-xs">
                      {cp.completed ? "DONE" : "PENDING"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Logs */}
          <div className="bg-zinc-900 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">Event Log</h2>
            <div className="h-80 overflow-y-auto space-y-1 font-mono text-xs">
              {logs.length === 0 ? (
                <p className="text-zinc-500">
                  No events yet. Play the video to see logs.
                </p>
              ) : (
                logs.map((logEntry, i) => (
                  <div
                    key={i}
                    className="text-zinc-400 py-1 border-b border-zinc-800"
                  >
                    {logEntry}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-zinc-900 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">How to Test</h2>
          <ol className="list-decimal list-inside space-y-2 text-zinc-300">
            <li>
              <strong>Language Preference:</strong> Select Mandarin Only,
              Cantonese Only, or Both
            </li>
            <li>
              <strong>Observe Filtering:</strong> Notice how cue points change
              based on preference
            </li>
            <li>
              <strong>Play Video:</strong> Watch until a cue point triggers (~5s
              for Mandarin)
            </li>
            <li>
              <strong>Type Chinese:</strong> Use your IME to type Chinese
              characters
            </li>
            <li>
              <strong>Test Failure:</strong> Submit a short response (&lt;6
              chars) to see error feedback
            </li>
            <li>
              <strong>Test Success:</strong> Submit a longer response (&gt;5
              chars) to pass
            </li>
            <li>
              <strong>Try Again:</strong> Click retry after failure, video
              stays paused
            </li>
            <li>
              <strong>Resume:</strong> On success, video auto-resumes after 1.5s
            </li>
            <li>
              <strong>Reload Test:</strong> Refresh page and check preference
              persists
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
