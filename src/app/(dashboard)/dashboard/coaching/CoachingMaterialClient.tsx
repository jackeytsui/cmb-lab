"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ReaderTextArea } from "@/components/reader/ReaderTextArea";
import { segmentText, type WordSegment } from "@/lib/segmenter";
import { detectSentences } from "@/lib/sentences";
import { convertScript } from "@/lib/chinese-convert";
import { useTTS } from "@/hooks/useTTS";
import { cn } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";
import { Pencil, Trash2, Star, Download, ExternalLink, Link as LinkIcon } from "lucide-react";
import { pinyin } from "pinyin-pro";
import ToJyutping from "to-jyutping";
import { useFeatureEngagement } from "@/hooks/useFeatureEngagement";
import { exportCoachingNotes } from "@/lib/coaching-export";

async function fetchJiebaSegments(
  sentences: string[],
): Promise<WordSegment[][] | null> {
  try {
    const chunks: string[][] = [];
    for (let i = 0; i < sentences.length; i += 200) {
      chunks.push(sentences.slice(i, i + 200));
    }

    const allSegments: WordSegment[][] = [];
    for (const chunk of chunks) {
      const res = await fetch("/api/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: chunk }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      allSegments.push(
        ...data.segments.map(
          (segs: Array<{ text: string; isWordLike: boolean }>, idx: number) =>
            segs.map(
              (s: { text: string; isWordLike: boolean }, si: number) => ({
                text: s.text,
                index: si,
                isWordLike: s.isWordLike,
              }),
            ) || segmentText(chunk[idx]),
        ),
      );
    }
    return allSegments;
  } catch {
    return null;
  }
}

async function fetchProperTranslations(
  texts: string[],
  language: "zh-CN" | "zh-HK",
): Promise<string[] | null> {
  try {
    const cleanTexts = texts
      .map((t) => t.replace(/[\uFFFD\u200B\u200C\u200D\uFEFF]/g, "").trim())
      .filter((t) => t.length > 0);
    if (cleanTexts.length === 0) return null;

    const res = await fetch("/api/reader/translate-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: cleanTexts, mode: "proper", language }),
    });
    if (!res.ok) {
      console.error("Batch translate failed:", res.status);
      return null;
    }
    const data = await res.json();
    return data.translations ?? null;
  } catch (err) {
    console.error("Batch translate error:", err);
    return null;
  }
}

type ScriptMode = "simplified" | "traditional";
type PaneDraft = {
  draftText: string;
  committedText: string;
  scriptMode: ScriptMode;
};

type SessionNote = {
  id: string;
  pane: "mandarin" | "cantonese";
  order: number;
  text: string;
  createdAt: string | number;
  starred?: number;
  textOverride?: string;
  romanizationOverride?: string;
  translationOverride?: string;
};

type CoachingSession = {
  id: string;
  title: string;
  type: "one_on_one" | "inner_circle";
  studentEmail?: string | null;
  recordingUrl?: string | null;
  createdAt: string | number;
  updatedAt: string | number;
  notes?: SessionNote[];
  mandarin: PaneDraft;
  cantonese: PaneDraft;
};

function useProcessedText({
  committedText,
  scriptMode,
  language,
}: {
  committedText: string;
  scriptMode: ScriptMode;
  language: "zh-CN" | "zh-HK";
}) {
  const [displayText, setDisplayText] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [jiebaSegments, setJiebaSegments] = useState<WordSegment[] | null>(
    null,
  );
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [batchTranslations, setBatchTranslations] = useState<
    Map<number, string>
  >(new Map());
  const [isTranslating, setIsTranslating] = useState(false);
  const translatedKeyRef = useRef<string>("");
  const [translationCache, setTranslationCache] = useState<
    Map<string, string>
  >(new Map());

  const {
    speak,
    stop,
    isPlaying,
    isLoading: ttsLoading,
    error: ttsError,
  } = useTTS();
  const [speakingText, setSpeakingText] = useState<string | null>(null);

  useEffect(() => {
    if (!committedText) {
      setDisplayText("");
      return;
    }

    if (scriptMode === "traditional") {
      setDisplayText(committedText);
      return;
    }

    let cancelled = false;
    setIsConverting(true);

    convertScript(committedText, "traditional", "simplified")
      .then((converted) => {
        if (!cancelled) setDisplayText(converted);
      })
      .catch((err) => {
        console.error("T/S conversion failed:", err);
        if (!cancelled) setDisplayText(committedText);
      })
      .finally(() => {
        if (!cancelled) setIsConverting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [committedText, scriptMode]);

  const fallbackSegments: WordSegment[] = useMemo(
    () => segmentText(displayText),
    [displayText],
  );

  useEffect(() => {
    if (!displayText) {
      setJiebaSegments(null);
      return;
    }

    setJiebaSegments(null);
    let cancelled = false;
    setIsSegmenting(true);

    const clientSegs = segmentText(displayText);
    const sentenceRanges = detectSentences(clientSegs);
    const sentenceTexts =
      sentenceRanges.length > 0
        ? sentenceRanges.map((s) => s.text)
        : [displayText];

    fetchJiebaSegments(sentenceTexts).then((result) => {
      if (cancelled) return;
      setIsSegmenting(false);
      if (result) {
        const flat: WordSegment[] = [];
        let offset = 0;
        for (const sentSegs of result) {
          for (const seg of sentSegs) {
            flat.push({ ...seg, index: offset });
            offset += seg.text.length;
          }
        }
        setJiebaSegments(flat);
      } else {
        setJiebaSegments(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [displayText]);

  const segments = jiebaSegments ?? fallbackSegments;
  const sentences = useMemo(() => detectSentences(segments), [segments]);
  const sentenceKey = useMemo(
    () => sentences.map((s) => s.text).join("|"),
    [sentences],
  );

  useEffect(() => {
    if (!displayText || sentences.length === 0) {
      setBatchTranslations(new Map());
      setTranslationCache(new Map());
      translatedKeyRef.current = "";
      return;
    }

    if (sentenceKey === translatedKeyRef.current) return;
    translatedKeyRef.current = sentenceKey;
    setIsTranslating(true);

    const sentenceTexts = sentences.map((s) => s.text);
    fetchProperTranslations(sentenceTexts, language)
      .then((translations) => {
        if (!translations) return;
        const map = new Map<number, string>();
        translations.forEach((t, idx) => {
          if (t) map.set(idx, t);
        });
        setBatchTranslations(map);

        setTranslationCache((prev) => {
          const next = new Map(prev);
          sentences.forEach((s, idx) => {
            const t = map.get(idx);
            if (t) next.set(s.text, t);
          });
          return next;
        });
      })
      .finally(() => {
        setIsTranslating(false);
      });
  }, [displayText, language, sentenceKey, sentences]);

  const handleSpeakSentence = useCallback(
    async (text: string, rate: "slow" | "medium" | "fast") => {
      setSpeakingText(text);
      await speak(text, { language, rate });
      setSpeakingText(null);
    },
    [language, speak],
  );

  const handleStopAll = useCallback(() => {
    stop();
    setSpeakingText(null);
  }, [stop]);

  return {
    sentences,
    displayText,
    isConverting,
    isSegmenting,
    segments,
    batchTranslations,
    isTranslating,
    translationCache,
    setTranslationCache,
    handleSpeakSentence,
    handleStopAll,
    isPlaying,
    ttsLoading,
    ttsError,
    speakingText,
  };
}

function NoteCard({
  note,
  index,
  language,
  scriptMode,
  showPinyin,
  showJyutping,
  canEdit,
  canStar,
  onToggleStar,
  onSave,
  onDelete,
}: {
  note: SessionNote;
  index: number;
  language: "zh-CN" | "zh-HK";
  scriptMode: ScriptMode;
  showPinyin: boolean;
  showJyutping: boolean;
  canEdit: boolean;
  canStar: boolean;
  onToggleStar: () => void;
  onSave: (updates: {
    textOverride?: string;
    romanizationOverride?: string;
    translationOverride?: string;
  }) => void;
  onDelete: () => void;
}) {
  const baseText = note.textOverride ?? note.text;
  const processed = useProcessedText({
    committedText: baseText,
    scriptMode,
    language,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(baseText);
  const [draftRomanization, setDraftRomanization] = useState("");
  const [draftTranslation, setDraftTranslation] = useState("");

  const defaultRomanization = useMemo(() => {
    if (!baseText.trim()) return "";
    if (language === "zh-HK") {
      return ToJyutping.getJyutpingList(baseText)
        .map(([, jp]) => jp ?? "")
        .filter(Boolean)
        .join(" ");
    }
    return pinyin(baseText, { type: "array" }).filter(Boolean).join(" ");
  }, [baseText, language]);

  const defaultTranslation = useMemo(() => {
    if (!processed.sentences.length) return "";
    return processed.sentences
      .map((s, idx) => processed.batchTranslations.get(idx) ?? "")
      .filter((t) => t.trim().length > 0)
      .join(" ");
  }, [processed.sentences, processed.batchTranslations]);

  useEffect(() => {
    if (!isEditing) return;
    setDraftText(baseText);
    setDraftRomanization(note.romanizationOverride ?? defaultRomanization);
    setDraftTranslation(note.translationOverride ?? defaultTranslation);
  }, [isEditing, baseText, note.romanizationOverride, note.translationOverride, defaultRomanization, defaultTranslation]);

  const handleSave = useCallback(() => {
    const nextText = draftText.trim();
    const nextRoman = draftRomanization.trim();
    const nextTrans = draftTranslation.trim();
    onSave({
      textOverride: nextText.length > 0 ? nextText : undefined,
      romanizationOverride: nextRoman.length > 0 ? nextRoman : undefined,
      translationOverride: nextTrans.length > 0 ? nextTrans : undefined,
    });
    setIsEditing(false);
  }, [draftText, draftRomanization, draftTranslation, onSave]);

  return (
    <div className="relative rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
      {(canEdit || canStar) && (
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
          {canStar && (
            <button
              type="button"
              onClick={onToggleStar}
              className={cn(
                "inline-flex size-5 items-center justify-center rounded text-[11px] transition-colors",
                note.starred ? "text-amber-500" : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Star note"
              title="Star note"
            >
              <Star className="size-3" />
            </button>
          )}
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setIsEditing((prev) => !prev)}
                className="inline-flex size-5 items-center justify-center rounded text-[11px] text-muted-foreground hover:text-foreground"
                aria-label="Edit note"
                title="Edit note"
              >
                <Pencil className="size-3" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex size-5 items-center justify-center rounded text-[11px] text-muted-foreground hover:text-red-500"
                aria-label="Delete note"
                title="Delete note"
              >
                <Trash2 className="size-3" />
              </button>
            </>
          )}
        </div>
      )}
      <div className="flex items-start gap-2">
        <span className="self-center inline-flex min-w-5 justify-center text-[10px] text-muted-foreground">
          {index + 1}.
        </span>
        <div className="flex-1 space-y-2 pr-8">
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Chinese text"
              />
              <input
                value={draftRomanization}
                onChange={(e) => setDraftRomanization(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder={language === "zh-HK" ? "Jyutping" : "Pinyin"}
              />
              <textarea
                value={draftTranslation}
                onChange={(e) => setDraftTranslation(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="English translation"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-xs font-medium text-foreground hover:border-primary/40 transition-colors"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : note.romanizationOverride || note.translationOverride || note.textOverride ? (
            <>
              {note.romanizationOverride || defaultRomanization ? (
                <div
                  className={cn(
                    "text-xs",
                    showJyutping ? "text-orange-400" : "text-blue-400",
                  )}
                >
                  {note.romanizationOverride ?? defaultRomanization}
                </div>
              ) : null}
              <div className="text-base text-foreground">
                {baseText}
              </div>
              {(note.translationOverride || defaultTranslation) && (
                <div className="text-sm text-emerald-500/80 italic">
                  {note.translationOverride ?? defaultTranslation}
                </div>
              )}
            </>
          ) : (
            <ReaderTextArea
              segments={processed.segments}
              showPinyin={showPinyin}
              showJyutping={showJyutping}
              showEnglish={true}
              translationMode="proper"
              fontSize={18}
              language={language}
              onSpeakSentence={processed.handleSpeakSentence}
              isSpeaking={processed.isPlaying || processed.ttsLoading}
              speakingText={processed.speakingText}
              ttsError={processed.ttsError}
              translationCache={processed.translationCache}
              onTranslationFetched={(text, translation) => {
                processed.setTranslationCache((prev) => {
                  const next = new Map(prev);
                  next.set(text, translation);
                  return next;
                });
              }}
              batchTranslations={processed.batchTranslations}
              isTranslating={processed.isTranslating}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CoachingPanel({
  label,
  subtitle,
  sessionType,
  currentRole,
}: {
  label: string;
  subtitle: string;
  sessionType: "one-on-one" | "inner-circle";
  currentRole?: "student" | "coach" | "admin";
}) {
  const fetchWithTimeout = useCallback(
    async (url: string, init?: RequestInit, timeoutMs = 12000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, {
          ...init,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [],
  );

  const { user } = useUser();
  const { trackAction } = useFeatureEngagement(
    sessionType === "one-on-one"
      ? "coaching_one_on_one"
      : "coaching_inner_circle",
  );
  const roleFromMetadata = user?.publicMetadata?.role as string | undefined;
  const role = (currentRole || roleFromMetadata) as string | undefined;
  const isAdmin = role === "admin";
  const isCoach = role === "coach";
  const canEditNotes = isAdmin || isCoach;
  const canWrite = canEditNotes;
  const canReorderNotes = isAdmin || isCoach || role === "student";
  const canStarNotes = isCoach || role === "student";
  const userEmail =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "";

  const [sessions, setSessions] = useState<CoachingSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState("");
  const [studentEmailFilter, setStudentEmailFilter] = useState("");
  const [studentEmailInput, setStudentEmailInput] = useState("");
  const [lockedStudentEmail, setLockedStudentEmail] = useState<string | null>(null);
  const [isLinkingStudent, setIsLinkingStudent] = useState(false);
  const [openStudentError, setOpenStudentError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  // Session rating state (only for students/admins)
  const canRate = role === "student" || role === "admin";
  const [sessionRating, setSessionRating] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingHover, setRatingHover] = useState(0);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  // Recording link state
  const [recordingUrlDraft, setRecordingUrlDraft] = useState("");
  const [isEditingRecordingUrl, setIsEditingRecordingUrl] = useState(false);
  const [isSavingRecordingUrl, setIsSavingRecordingUrl] = useState(false);

  // Sync recording URL draft when active session changes
  useEffect(() => {
    setRecordingUrlDraft(activeSession?.recordingUrl ?? "");
    setIsEditingRecordingUrl(false);
  }, [activeSessionId]);

  const handleSaveRecordingUrl = useCallback(async () => {
    if (!activeSessionId) return;
    setIsSavingRecordingUrl(true);
    try {
      const res = await fetch(`/api/coaching/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingUrl: recordingUrlDraft.trim() || null }),
      });
      if (res.ok) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? { ...s, recordingUrl: recordingUrlDraft.trim() || null }
              : s,
          ),
        );
        setIsEditingRecordingUrl(false);
      }
    } catch {
      // ignore
    } finally {
      setIsSavingRecordingUrl(false);
    }
  }, [activeSessionId, recordingUrlDraft]);

  // Fetch existing rating when active session changes
  useEffect(() => {
    if (!canRate || !activeSessionId) {
      setSessionRating(0);
      setRatingComment("");
      setRatingSubmitted(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/coaching/sessions/${activeSessionId}/rating`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.rating) {
          setSessionRating(data.rating.rating);
          setRatingComment(data.rating.comment || "");
          setRatingSubmitted(true);
        } else {
          setSessionRating(0);
          setRatingComment("");
          setRatingSubmitted(false);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canRate, activeSessionId]);

  const handleSubmitRating = useCallback(async () => {
    if (!activeSessionId || sessionRating < 1) return;
    setIsSubmittingRating(true);
    try {
      const res = await fetch(
        `/api/coaching/sessions/${activeSessionId}/rating`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rating: sessionRating,
            comment: ratingComment.trim() || undefined,
          }),
        },
      );
      if (res.ok) {
        setRatingSubmitted(true);
      }
    } catch {
      // ignore
    } finally {
      setIsSubmittingRating(false);
    }
  }, [activeSessionId, sessionRating, ratingComment]);

  const isOneOnOneSignedOut = sessionType === "one-on-one" && canWrite && !studentEmailFilter.trim();
  const canAddSession =
    canWrite && (sessionType !== "one-on-one" || Boolean(lockedStudentEmail));

  const normalizeSessions = useCallback((rawSessions: CoachingSession[]) => {
    return rawSessions.map((session: CoachingSession) => ({
      ...session,
      mandarin: session.mandarin ?? {
        draftText: "",
        committedText: "",
        scriptMode: "simplified",
      },
      cantonese: session.cantonese ?? {
        draftText: "",
        committedText: "",
        scriptMode: "simplified",
      },
    }));
  }, []);

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const updatedDiff =
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (updatedDiff !== 0) return updatedDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [sessions],
  );
  const visibleSessions = showAllSessions
    ? sortedSessions
    : sortedSessions.slice(0, 5);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );
  const mandarinNotes = useMemo(() => {
    const notes = (activeSession?.notes ?? []).filter((n) => n.pane === "mandarin");
    return [...notes].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  }, [activeSession]);
  const cantoneseNotes = useMemo(() => {
    const notes = (activeSession?.notes ?? []).filter((n) => n.pane === "cantonese");
    return [...notes].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  }, [activeSession]);

  useEffect(() => {
    if (sessionType === "one-on-one" && !canWrite && userEmail) {
      setStudentEmailFilter(userEmail);
      setStudentEmailInput(userEmail);
    }
  }, [sessionType, canWrite, userEmail]);

  const fetchSessions = useCallback(async () => {
    const typeParam = sessionType === "one-on-one" ? "one_on_one" : "inner_circle";
    if (typeParam === "one_on_one" && canWrite && !studentEmailFilter.trim()) {
      setSessions([]);
      setActiveSessionId(null);
      setIsLoaded(true);
      return;
    }

    const params = new URLSearchParams({ type: typeParam });
    if (typeParam === "one_on_one" && studentEmailFilter) {
      params.set("studentEmail", studentEmailFilter);
    }
    const res = await fetch(`/api/coaching/sessions?${params.toString()}`);
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    const normalized = normalizeSessions(data.sessions ?? []);
    setSessions(normalized);
    setActiveSessionId(normalized[0]?.id ?? null);
    setIsLoaded(true);
  }, [canWrite, normalizeSessions, sessionType, studentEmailFilter]);

  useEffect(() => {
    if (!user) return;
    fetchSessions();
  }, [fetchSessions, user]);

  const updateSession = useCallback(
    (sessionId: string, updater: (session: CoachingSession) => CoachingSession) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? updater(s) : s)),
      );
    },
    [],
  );

  const handleAddSession = useCallback(async () => {
    if (!canAddSession) return;
    const typeParam = sessionType === "one-on-one" ? "one_on_one" : "inner_circle";
    if (typeParam === "one_on_one" && !studentEmailFilter.trim()) {
      alert("Please enter a student email.");
      return;
    }
    const res = await fetch("/api/coaching/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: typeParam,
        studentEmail: typeParam === "one_on_one" ? studentEmailFilter.trim() : null,
      }),
    });
    if (!res.ok) return;
    trackAction("create_session");
    await fetchSessions();
  }, [canAddSession, sessionType, studentEmailFilter, fetchSessions, trackAction]);

  const handleLinkStudentEmail = useCallback(async () => {
    if (lockedStudentEmail) {
      trackAction("sign_out_student_context");
      setLockedStudentEmail(null);
      setOpenStudentError(null);
      setStudentEmailFilter("");
      setStudentEmailInput("");
      setSessions([]);
      setActiveSessionId(null);
      return;
    }

    const email = studentEmailInput.trim().toLowerCase();
    if (!email) return;

    const typeParam = sessionType === "one-on-one" ? "one_on_one" : "inner_circle";
    if (typeParam !== "one_on_one") return;

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      setOpenStudentError("Invalid email address input. Please try again.");
      setLockedStudentEmail(null);
      setSessions([]);
      setActiveSessionId(null);
      return;
    }

    setIsLinkingStudent(true);
    setOpenStudentError(null);
    setStudentEmailInput(email);
    setStudentEmailFilter(email);

    try {
      const params = new URLSearchParams({
        type: typeParam,
        studentEmail: email,
      });
      let res = await fetchWithTimeout(`/api/coaching/sessions?${params.toString()}`);
      if (!res.ok) {
        alert("Could not load coaching sessions for that email.");
        return;
      }

      let data = await res.json();
      let normalized = normalizeSessions(data.sessions ?? []);

      if (normalized.length === 0 && canWrite) {
        const createRes = await fetchWithTimeout("/api/coaching/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "one_on_one",
            studentEmail: email,
          }),
        });

        if (!createRes.ok) {
          setOpenStudentError("Invalid email address input. Please try again.");
          setLockedStudentEmail(null);
          setSessions([]);
          setActiveSessionId(null);
          return;
        }

        res = await fetchWithTimeout(`/api/coaching/sessions?${params.toString()}`);
        if (!res.ok) return;
        data = await res.json();
        normalized = normalizeSessions(data.sessions ?? []);
      }

      setSessions(normalized);
      setActiveSessionId(normalized[0]?.id ?? null);
      setIsLoaded(true);
      setLockedStudentEmail(email);
      setOpenStudentError(null);
      trackAction("open_student_context", { studentEmail: email });
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Request timed out. Please try again."
          : "Could not open this 1:1 session.";
      alert(message);
    } finally {
      setIsLinkingStudent(false);
    }
  }, [canWrite, fetchWithTimeout, lockedStudentEmail, normalizeSessions, sessionType, studentEmailInput, trackAction]);

  const handleRenameSession = useCallback(
    async (sessionId: string, name: string) => {
      if (!canWrite) return;
      const res = await fetch(`/api/coaching/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name.trim() || "Session" }),
      });
      if (!res.ok) return;
      await fetchSessions();
    },
    [canWrite, fetchSessions, updateSession],
  );

  const handleActivateSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
  }, []);

  const handleCommitText = useCallback(
    async (sessionId: string, pane: "mandarin" | "cantonese", text: string) => {
      if (!canWrite) return;
      if (!text.trim()) return;
      updateSession(sessionId, (session) => ({
        ...session,
        [pane]: {
          ...session[pane],
          committedText: text,
          draftText: "",
        },
      }));
      const res = await fetch(`/api/coaching/sessions/${sessionId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, pane }),
      });
      if (!res.ok) return;
      trackAction("add_note", { pane });
      await fetchSessions();
    },
    [canWrite, fetchSessions, trackAction, updateSession],
  );

  const handleReorderNotes = useCallback(
    (
      sessionId: string,
      pane: "mandarin" | "cantonese",
      fromIndex: number,
      toIndex: number,
    ) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;
      const paneNotes = (session.notes ?? []).filter((n) => n.pane === pane);
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= paneNotes.length ||
        toIndex >= paneNotes.length
      ) {
        return;
      }
      const reordered = [...paneNotes];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      const updatedPaneNotes = reordered.map((note, idx) => ({
        ...note,
        order: reordered.length - idx,
      }));
      const noteIds = reordered.map((n) => n.id);

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const otherNotes = (s.notes ?? []).filter((n) => n.pane !== pane);
          return { ...s, notes: [...otherNotes, ...updatedPaneNotes] };
        }),
      );

      fetch(`/api/coaching/sessions/${sessionId}/notes/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteIds, pane }),
      }).catch(() => null);
    },
    [sessions],
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!canWrite) return;
      const res = await fetch(`/api/coaching/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Failed to delete session.");
        return;
      }
      trackAction("delete_session");
      await fetchSessions();
    },
    [canWrite, fetchSessions, trackAction],
  );

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      if (!canEditNotes) return;
      const confirmed = window.confirm("Delete this note?");
      if (!confirmed) return;
      const res = await fetch(`/api/coaching/notes/${noteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Failed to delete note.");
        return;
      }
      trackAction("delete_note");
      await fetchSessions();
    },
    [canEditNotes, fetchSessions, trackAction],
  );

  const mandarinPane = useProcessedText({
    committedText: activeSession?.mandarin.committedText ?? "",
    scriptMode: activeSession?.mandarin.scriptMode ?? "simplified",
    language: "zh-CN",
  });
  const [mandarinDraft, setMandarinDraft] = useState("");
  const [draggingMando, setDraggingMando] = useState<number | null>(null);
  const cantonesePane = useProcessedText({
    committedText: activeSession?.cantonese.committedText ?? "",
    scriptMode: activeSession?.cantonese.scriptMode ?? "simplified",
    language: "zh-HK",
  });
  const [cantoneseDraft, setCantoneseDraft] = useState("");
  const [draggingCanto, setDraggingCanto] = useState<number | null>(null);

  useEffect(() => {
    setMandarinDraft(activeSession?.mandarin.draftText ?? "");
    setCantoneseDraft(activeSession?.cantonese.draftText ?? "");
  }, [activeSessionId]);

  const handleStopAll = useCallback(() => {
    mandarinPane.handleStopAll();
    cantonesePane.handleStopAll();
  }, [mandarinPane.handleStopAll, cantonesePane.handleStopAll]);

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    if (showExportMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showExportMenu]);

  const handleExport = useCallback(
    async (mode: "current" | "all") => {
      if (!canWrite) return;
      setIsExporting(true);
      setShowExportMenu(false);
      try {
        const typeParam = sessionType === "one-on-one" ? "one_on_one" : "inner_circle";
        const params = new URLSearchParams({ type: typeParam });
        if (mode === "current" && activeSessionId) {
          params.set("sessionId", activeSessionId);
        }
        if (sessionType === "one-on-one" && studentEmailFilter.trim()) {
          params.set("studentEmail", studentEmailFilter.trim());
        }

        const res = await fetchWithTimeout(`/api/coaching/export?${params.toString()}`);
        if (!res.ok) {
          console.error("Export fetch failed:", res.status);
          return;
        }
        const data = await res.json();
        const exportSessions = (data.sessions ?? []).map(
          (s: { title: string; notes: Array<{ text: string; pane: string; textOverride?: string; romanizationOverride?: string; translationOverride?: string }> }) => ({
            title: s.title,
            notes: s.notes.map((n) => ({
              text: n.text,
              pane: n.pane as "mandarin" | "cantonese",
              textOverride: n.textOverride,
              romanizationOverride: n.romanizationOverride,
              translationOverride: n.translationOverride,
            })),
          }),
        );

        if (exportSessions.length === 0) {
          console.warn("No sessions to export");
          return;
        }

        const sessionTitle =
          mode === "current" && activeSession
            ? activeSession.title
            : undefined;

        await exportCoachingNotes(exportSessions, {
          sessionTitle,
          fileName: mode === "current" && activeSession
            ? `coaching-notes-${activeSession.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`
            : `coaching-notes-${typeParam}${studentEmailFilter.trim() ? `-${studentEmailFilter.trim()}` : ""}.xlsx`,
        });
      } catch (err) {
        console.error("Export error:", err);
      } finally {
        setIsExporting(false);
      }
    },
    [canWrite, sessionType, activeSessionId, activeSession, studentEmailFilter, fetchWithTimeout],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{label}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Sessions</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Most recent sessions appear at the top.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canWrite && (
              <div className="relative" ref={exportMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowExportMenu((prev) => !prev)}
                  disabled={isExporting || sessions.length === 0}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Export notes to Excel"
                >
                  <Download className="size-3.5" />
                  {isExporting ? "Exporting..." : "Export"}
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md">
                    <button
                      type="button"
                      onClick={() => handleExport("current")}
                      disabled={!activeSessionId}
                      className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Export current session
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport("all")}
                      className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      Export all sessions
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={handleAddSession}
              disabled={!canAddSession}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add New Session
            </button>
          </div>
        </div>
        {sessionType === "one-on-one" && canWrite && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-xs font-medium text-muted-foreground">
              Student Email
            </label>
            <input
              value={studentEmailInput}
              onChange={(e) => setStudentEmailInput(e.target.value)}
              onKeyDown={(e) => {
                if (lockedStudentEmail) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleLinkStudentEmail();
                }
              }}
              disabled={Boolean(lockedStudentEmail)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:max-w-sm disabled:opacity-60 disabled:cursor-not-allowed"
              placeholder="student@email.com"
            />
            <button
              type="button"
              onClick={handleLinkStudentEmail}
              disabled={(!studentEmailInput.trim() && !lockedStudentEmail) || isLinkingStudent}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLinkingStudent ? "Opening..." : lockedStudentEmail ? "Sign out" : "Open"}
            </button>
          </div>
        )}
        <div className={cn("mt-3", showAllSessions && "max-h-[200px] overflow-y-auto pr-1")}>
          {sortedSessions.length === 0 && (
            <div
              className={cn(
                "text-xs",
                openStudentError ? "text-red-500" : "text-muted-foreground",
              )}
            >
              {openStudentError
                ? openStudentError
                : sessionType === "one-on-one" && canWrite && !studentEmailFilter.trim()
                ? "Please type in the student email to access student's 1:1 coaching note."
                : "No sessions yet. Add a new session to begin."}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {visibleSessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-left text-[12px] transition-colors",
                  session.id === activeSessionId
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/30",
                )}
              >
                <button
                  type="button"
                  onClick={() => handleActivateSession(session.id)}
                  className="w-full text-left"
                >
                  <span className="font-medium">{session.title}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {new Date(session.updatedAt).toLocaleString()}
                  </span>
                </button>
                {canWrite && (
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSessionId(session.id);
                        setEditingSessionName(session.title);
                      }}
                      className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                      aria-label="Rename session"
                      title="Rename session"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteId(session.id);
                      }}
                      className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                      aria-label="Delete session"
                      title="Delete session"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                )}
                {canWrite && pendingDeleteId === session.id && (
                  <div className="mt-2 flex items-center gap-2 text-[11px]">
                    <span className="text-red-500/80">Delete this session?</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(session.id);
                        setPendingDeleteId(null);
                      }}
                      className="rounded border border-red-500/40 px-1.5 py-0.5 text-red-500 hover:border-red-500/70"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteId(null);
                      }}
                      className="rounded border border-input px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {sortedSessions.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllSessions((prev) => !prev)}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground"
            >
              {showAllSessions ? "Collapse" : "Show All Sessions"}
            </button>
          )}
        </div>

        {editingSessionId && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-xs font-medium text-muted-foreground">
              Rename Session
            </label>
            <input
              value={editingSessionName}
              onChange={(e) => setEditingSessionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleRenameSession(editingSessionId, editingSessionName);
                  setEditingSessionId(null);
                  setEditingSessionName("");
                }
              }}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:max-w-sm"
            />
            <button
              type="button"
              onClick={() => {
                handleRenameSession(editingSessionId, editingSessionName);
                setEditingSessionId(null);
                setEditingSessionName("");
              }}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingSessionId(null);
                setEditingSessionName("");
              }}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Recording Link Section */}
      {activeSession && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <LinkIcon className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Recording Link</h3>
            </div>
            {canWrite && !isEditingRecordingUrl && (
              <button
                type="button"
                onClick={() => {
                  setRecordingUrlDraft(activeSession.recordingUrl ?? "");
                  setIsEditingRecordingUrl(true);
                }}
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                <Pencil className="size-3 mr-1" />
                {activeSession.recordingUrl ? "Edit" : "Add Link"}
              </button>
            )}
          </div>
          {isEditingRecordingUrl ? (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={recordingUrlDraft}
                onChange={(e) => setRecordingUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveRecordingUrl();
                  }
                }}
                placeholder="https://..."
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:max-w-md"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveRecordingUrl}
                  disabled={isSavingRecordingUrl}
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
                >
                  {isSavingRecordingUrl ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingRecordingUrl(false)}
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : activeSession.recordingUrl ? (
            <a
              href={activeSession.recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
            >
              <ExternalLink className="size-3.5 shrink-0" />
              {activeSession.recordingUrl}
            </a>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No recording link added yet.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Mandarin Output
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Simplified/Traditional display with Pinyin and Mandarin → English translation.
              </p>
            </div>
            <div className="inline-flex items-center rounded-md bg-muted p-0.5 text-xs">
              <button
                type="button"
                onClick={() =>
                  activeSession &&
                  updateSession(activeSession.id, (session) => ({
                    ...session,
                    mandarin: { ...session.mandarin, scriptMode: "simplified" },
                  }))
                }
                disabled={!activeSession}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  activeSession?.mandarin.scriptMode === "simplified"
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                  !activeSession && "opacity-60 cursor-not-allowed",
                )}
              >
                Simplified
              </button>
              <button
                type="button"
                onClick={() =>
                  activeSession &&
                  updateSession(activeSession.id, (session) => ({
                    ...session,
                    mandarin: { ...session.mandarin, scriptMode: "traditional" },
                  }))
                }
                disabled={!activeSession}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  activeSession?.mandarin.scriptMode === "traditional"
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                  !activeSession && "opacity-60 cursor-not-allowed",
                )}
              >
                Traditional
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <label className="text-sm font-medium text-foreground">
              Traditional Chinese Input (Mandarin)
            </label>
            <div className="relative">
              <textarea
              value={mandarinDraft}
              onChange={(e) => {
                const next = e.target.value;
                setMandarinDraft(next);
                if (activeSession) {
                  updateSession(activeSession.id, (session) => ({
                    ...session,
                    mandarin: { ...session.mandarin, draftText: next },
                  }));
                }
              }}
              onKeyDown={(e) => {
                if (!canWrite) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (activeSession) {
                    handleCommitText(activeSession.id, "mandarin", mandarinDraft);
                    setMandarinDraft("");
                  }
                }
              }}
              disabled={!activeSession || !canWrite}
              rows={5}
              placeholder="Paste or type Traditional Chinese here..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 pr-16 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {canWrite && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeSession) {
                      handleCommitText(activeSession.id, "mandarin", mandarinDraft);
                      setMandarinDraft("");
                    }
                  }}
                  disabled={!activeSession}
                  className="absolute bottom-2 right-2 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-[11px] font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Enter
                </button>
              )}
            </div>
          </div>

          {(mandarinPane.isConverting || mandarinPane.isSegmenting) && (
            <div className="mt-3 text-sm text-muted-foreground">
              {mandarinPane.isConverting ? "Converting..." : "Segmenting..."}
            </div>
          )}

          {activeSession && mandarinNotes.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Session Notes (Mandarin)
              </div>
              <div className="space-y-2">
                {mandarinNotes.map((note, index) => (
                  <div
                    key={note.id}
                    draggable={canReorderNotes}
                    onDragStart={() => {
                      if (canReorderNotes) setDraggingMando(index);
                    }}
                    onDragOver={(e) => {
                      if (canReorderNotes) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (canReorderNotes && draggingMando !== null && activeSession) {
                        handleReorderNotes(
                          activeSession.id,
                          "mandarin",
                          draggingMando,
                          index,
                        );
                        setDraggingMando(null);
                      }
                    }}
                    className={cn(
                      canReorderNotes ? "cursor-move" : "cursor-default",
                    )}
                  >
                    <NoteCard
                      note={note}
                      index={index}
                      language="zh-CN"
                      scriptMode={activeSession.mandarin.scriptMode}
                      showPinyin={true}
                      showJyutping={false}
                      canEdit={canEditNotes}
                      canStar={canStarNotes}
                      onToggleStar={() => {
                        if (!activeSession) return;
                        if (!canStarNotes) return;
                        const method = note.starred === 1 ? "DELETE" : "POST";
                        fetch(`/api/coaching/notes/${note.id}/star`, {
                          method,
                        }).then(() => fetchSessions());
                      }}
                      onSave={(updates) => {
                        if (!activeSession) return;
                        fetch(`/api/coaching/notes/${note.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(updates),
                        }).then(() => fetchSessions());
                      }}
                      onDelete={() => {
                        void handleDeleteNote(note.id);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {mandarinPane.segments.length > 0 ? (
            <div className="mt-3">
              <ReaderTextArea
                segments={mandarinPane.segments}
                showPinyin={true}
                showJyutping={false}
                showEnglish={true}
                translationMode="proper"
                fontSize={18}
                language="zh-CN"
                onSpeakSentence={mandarinPane.handleSpeakSentence}
                isSpeaking={mandarinPane.isPlaying || mandarinPane.ttsLoading}
                speakingText={mandarinPane.speakingText}
                ttsError={mandarinPane.ttsError}
                translationCache={mandarinPane.translationCache}
                onTranslationFetched={(text, translation) => {
                  mandarinPane.setTranslationCache((prev) => {
                    const next = new Map(prev);
                    next.set(text, translation);
                    return next;
                  });
                }}
                batchTranslations={mandarinPane.batchTranslations}
                isTranslating={mandarinPane.isTranslating}
              />
            </div>
          ) : (
            <div className="mt-3 text-sm text-muted-foreground">
              Paste or import Chinese text to begin reading
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Cantonese Output
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Simplified/Traditional display with Jyutping and Cantonese → English translation.
              </p>
            </div>
            <div className="inline-flex items-center rounded-md bg-muted p-0.5 text-xs">
              <button
                type="button"
                onClick={() =>
                  activeSession &&
                  updateSession(activeSession.id, (session) => ({
                    ...session,
                    cantonese: { ...session.cantonese, scriptMode: "simplified" },
                  }))
                }
                disabled={!activeSession}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  activeSession?.cantonese.scriptMode === "simplified"
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                  !activeSession && "opacity-60 cursor-not-allowed",
                )}
              >
                Simplified
              </button>
              <button
                type="button"
                onClick={() =>
                  activeSession &&
                  updateSession(activeSession.id, (session) => ({
                    ...session,
                    cantonese: { ...session.cantonese, scriptMode: "traditional" },
                  }))
                }
                disabled={!activeSession}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  activeSession?.cantonese.scriptMode === "traditional"
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                  !activeSession && "opacity-60 cursor-not-allowed",
                )}
              >
                Traditional
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <label className="text-sm font-medium text-foreground">
              Traditional Chinese Input (Cantonese)
            </label>
            <div className="relative">
              <textarea
              value={cantoneseDraft}
              onChange={(e) => {
                const next = e.target.value;
                setCantoneseDraft(next);
                if (activeSession) {
                  updateSession(activeSession.id, (session) => ({
                    ...session,
                    cantonese: { ...session.cantonese, draftText: next },
                  }));
                }
              }}
              onKeyDown={(e) => {
                if (!canWrite) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (activeSession) {
                    handleCommitText(activeSession.id, "cantonese", cantoneseDraft);
                    setCantoneseDraft("");
                  }
                }
              }}
              disabled={!activeSession || !canWrite}
              rows={5}
              placeholder="Paste or type Traditional Chinese here..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 pr-16 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {canWrite && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeSession) {
                      handleCommitText(activeSession.id, "cantonese", cantoneseDraft);
                      setCantoneseDraft("");
                    }
                  }}
                  disabled={!activeSession}
                  className="absolute bottom-2 right-2 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-[11px] font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Enter
                </button>
              )}
            </div>
          </div>

          {(cantonesePane.isConverting || cantonesePane.isSegmenting) && (
            <div className="mt-3 text-sm text-muted-foreground">
              {cantonesePane.isConverting ? "Converting..." : "Segmenting..."}
            </div>
          )}

          {activeSession && cantoneseNotes.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Session Notes (Cantonese)
              </div>
              <div className="space-y-2">
                {cantoneseNotes.map((note, index) => (
                  <div
                    key={note.id}
                    draggable={canReorderNotes}
                    onDragStart={() => {
                      if (canReorderNotes) setDraggingCanto(index);
                    }}
                    onDragOver={(e) => {
                      if (canReorderNotes) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (canReorderNotes && draggingCanto !== null && activeSession) {
                        handleReorderNotes(
                          activeSession.id,
                          "cantonese",
                          draggingCanto,
                          index,
                        );
                        setDraggingCanto(null);
                      }
                    }}
                    className={cn(
                      canReorderNotes ? "cursor-move" : "cursor-default",
                    )}
                  >
                    <NoteCard
                      note={note}
                      index={index}
                      language="zh-HK"
                      scriptMode={activeSession.cantonese.scriptMode}
                      showPinyin={false}
                      showJyutping={true}
                      canEdit={canEditNotes}
                      canStar={canStarNotes}
                      onToggleStar={() => {
                        if (!activeSession) return;
                        if (!canStarNotes) return;
                        const method = note.starred === 1 ? "DELETE" : "POST";
                        fetch(`/api/coaching/notes/${note.id}/star`, {
                          method,
                        }).then(() => fetchSessions());
                      }}
                      onSave={(updates) => {
                        if (!activeSession) return;
                        fetch(`/api/coaching/notes/${note.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(updates),
                        }).then(() => fetchSessions());
                      }}
                      onDelete={() => {
                        void handleDeleteNote(note.id);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {cantonesePane.segments.length > 0 ? (
            <div className="mt-3">
              <ReaderTextArea
                segments={cantonesePane.segments}
                showPinyin={false}
                showJyutping={true}
                showEnglish={true}
                translationMode="proper"
                fontSize={18}
                language="zh-HK"
                onSpeakSentence={cantonesePane.handleSpeakSentence}
                isSpeaking={cantonesePane.isPlaying || cantonesePane.ttsLoading}
                speakingText={cantonesePane.speakingText}
                ttsError={cantonesePane.ttsError}
                translationCache={cantonesePane.translationCache}
                onTranslationFetched={(text, translation) => {
                  cantonesePane.setTranslationCache((prev) => {
                    const next = new Map(prev);
                    next.set(text, translation);
                    return next;
                  });
                }}
                batchTranslations={cantonesePane.batchTranslations}
                isTranslating={cantonesePane.isTranslating}
              />
            </div>
          ) : (
            <div className="mt-3 text-sm text-muted-foreground">
              Paste or import Chinese text to begin reading
            </div>
          )}
        </div>
      </div>

      {/* Session Rating Section - only visible for students and admins */}
      {canRate && activeSession && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Rate this session
          </h3>
          <div className="flex items-center gap-1 mb-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => {
                  setSessionRating(star);
                  setRatingSubmitted(false);
                }}
                onMouseEnter={() => setRatingHover(star)}
                onMouseLeave={() => setRatingHover(0)}
                className="p-0.5 transition-colors"
                aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
              >
                <Star
                  className={cn(
                    "h-5 w-5 transition-colors",
                    (ratingHover || sessionRating) >= star
                      ? "fill-amber-400 text-amber-400"
                      : "fill-none text-muted-foreground",
                  )}
                />
              </button>
            ))}
            {sessionRating > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                {sessionRating}/5
              </span>
            )}
          </div>
          <textarea
            value={ratingComment}
            onChange={(e) => {
              setRatingComment(e.target.value);
              setRatingSubmitted(false);
            }}
            placeholder="Optional: share your feedback..."
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmitRating}
              disabled={sessionRating < 1 || isSubmittingRating}
              className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmittingRating
                ? "Submitting..."
                : ratingSubmitted
                  ? "Update Rating"
                  : "Submit Rating"}
            </button>
            {ratingSubmitted && !isSubmittingRating && (
              <span className="text-xs text-emerald-600">
                Rating saved
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CoachingMaterialClient({
  title,
  subtitle,
  sessionType,
  currentRole,
}: {
  title: string;
  subtitle: string;
  sessionType: "one-on-one" | "inner-circle";
  currentRole?: "student" | "coach" | "admin";
}) {
  return (
    <div className="container mx-auto px-4 py-6 flex flex-col min-h-[calc(100vh-3.5rem)]">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>

      <div className="mt-4">
        <CoachingPanel
          label={title}
          subtitle={subtitle}
          sessionType={sessionType}
          currentRole={currentRole}
        />
      </div>

      <div className="pt-6 mt-auto border-t border-border text-xs text-muted-foreground">
        This is an AI-assisted product. We do not guarantee accuracy or
        completeness. Please verify important information independently.
      </div>
    </div>
  );
}
