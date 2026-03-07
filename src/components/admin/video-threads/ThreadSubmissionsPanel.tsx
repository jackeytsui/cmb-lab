"use client";

import { useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Copy, Mail, ExternalLink, RefreshCw } from "lucide-react";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { toast } from "sonner";

interface SessionListItem {
  id: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  completedAt: string | null;
  responseCount: number;
  latestReview:
    | {
        message: string | null;
        loomUrl: string | null;
        createdAt: string;
      }
    | null;
}

interface SessionResponse {
  id: string;
  responseType: "video" | "audio" | "text" | "multiple_choice" | "button";
  content: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  step: {
    id: string;
    promptText: string | null;
    sortOrder: number;
  } | null;
}

interface SessionDetail {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  completedAt: string | null;
  student: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  responses: SessionResponse[];
}

interface Review {
  id: string;
  message: string | null;
  loomUrl: string | null;
  createdAt: string;
  coach: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

interface ThreadSubmissionsPanelProps {
  threadId: string;
}

function formatDate(ts: string | null): string {
  if (!ts) return "--";
  return format(new Date(ts), "MMM d, yyyy h:mm a");
}

function getPlaybackId(
  content: string | null,
  metadata: Record<string, unknown> | null
): string | null {
  if (metadata && typeof metadata.muxPlaybackId === "string") {
    const playbackId = metadata.muxPlaybackId.trim();
    if (playbackId) return playbackId;
  }
  if (content && content.trim() && !content.includes(" ")) {
    return content.trim();
  }
  return null;
}

export function ThreadSubmissionsPanel({ threadId }: ThreadSubmissionsPanelProps) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [loomUrl, setLoomUrl] = useState("");

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  const loadSessions = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch(`/api/admin/video-threads/${threadId}/submissions`);
      if (!res.ok) throw new Error("Failed to load submissions");
      const data = await res.json();
      setSessions(data.sessions ?? []);
      if (!selectedSessionId && data.sessions?.length > 0) {
        setSelectedSessionId(data.sessions[0].id);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load submissions");
    } finally {
      setLoadingList(false);
    }
  }, [threadId, selectedSessionId]);

  const loadDetail = useCallback(
    async (sessionId: string) => {
      setLoadingDetail(true);
      try {
        const res = await fetch(
          `/api/admin/video-threads/${threadId}/submissions/${sessionId}`
        );
        if (!res.ok) throw new Error("Failed to load submission details");
        const data = await res.json();
        setDetail(data.session ?? null);
        setReviews(data.reviews ?? []);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load submission detail");
      } finally {
        setLoadingDetail(false);
      }
    },
    [threadId]
  );

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      setSelectedSessionId(sessionId);
      await loadDetail(sessionId);
    },
    [loadDetail]
  );

  const handleSaveResponse = useCallback(async () => {
    if (!selectedSessionId) return;
    if (!reviewMessage.trim() && !loomUrl.trim()) {
      toast.error("Add a response message or Loom URL first");
      return;
    }

    setSavingReview(true);
    try {
      const res = await fetch(
        `/api/admin/video-threads/${threadId}/submissions/${selectedSessionId}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: reviewMessage.trim(),
            loomUrl: loomUrl.trim(),
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to save response");
      setReviewMessage("");
      setLoomUrl("");
      await Promise.all([loadSessions(), loadDetail(selectedSessionId)]);
      toast.success("Response saved");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save response");
    } finally {
      setSavingReview(false);
    }
  }, [threadId, selectedSessionId, reviewMessage, loomUrl, loadSessions, loadDetail]);

  const handleCopyShareLink = useCallback(async () => {
    if (!selectedSessionId) return;
    const link = `${window.location.origin}/coach/thread-reviews/${selectedSessionId}`;
    await navigator.clipboard.writeText(link);
    toast.success("Share link copied");
  }, [selectedSessionId]);

  const handleOpenEmailDraft = useCallback(() => {
    if (!selectedSession) return;
    const subject = encodeURIComponent("Feedback on your video thread submission");
    const body = encodeURIComponent(
      [
        `Hi ${selectedSession.studentName || "there"},`,
        "",
        reviewMessage.trim() || "Thanks for your submission.",
        loomUrl.trim() ? `\nLoom video: ${loomUrl.trim()}` : "",
        "",
        `Review link: ${window.location.origin}/coach/thread-reviews/${selectedSession.id}`,
      ].join("\n")
    );
    window.open(`mailto:${selectedSession.studentEmail}?subject=${subject}&body=${body}`);
  }, [selectedSession, reviewMessage, loomUrl]);

  return (
    <div className="h-full p-4 bg-white overflow-hidden">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Submissions</h3>
        <Button variant="outline" size="sm" onClick={loadSessions} disabled={loadingList}>
          {loadingList ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-4 h-[calc(100%-3.5rem)]">
        <div className="col-span-4 border rounded-lg overflow-y-auto">
          {loadingList ? (
            <div className="p-4 text-sm text-zinc-600 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600">No submissions yet.</div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => handleSelectSession(session.id)}
                className={`w-full text-left p-3 border-b hover:bg-zinc-50 transition-colors ${
                  selectedSessionId === session.id ? "bg-zinc-100" : ""
                }`}
              >
                <p className="text-sm font-medium text-zinc-900">
                  {session.studentName || session.studentEmail}
                </p>
                <p className="text-xs text-zinc-600">{session.studentEmail}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-600">
                  <span>{session.status.replace("_", " ")}</span>
                  <span>•</span>
                  <span>{session.responseCount} responses</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="col-span-8 border rounded-lg p-4 overflow-y-auto">
          {!selectedSessionId ? (
            <p className="text-sm text-zinc-600">Select a session to view details.</p>
          ) : loadingDetail ? (
            <div className="text-sm text-zinc-600 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading details...
            </div>
          ) : !detail ? (
            <p className="text-sm text-zinc-600">Unable to load session details.</p>
          ) : (
            <div className="space-y-4">
              <div className="border-b pb-3">
                <p className="text-sm font-semibold text-zinc-900">
                  {detail.student?.name || detail.student?.email || "Unknown student"}
                </p>
                <p className="text-xs text-zinc-600">
                  Started: {formatDate(detail.startedAt)} | Completed:{" "}
                  {formatDate(detail.completedAt)}
                </p>
              </div>

              <div className="space-y-3">
                {detail.responses.length === 0 ? (
                  <p className="text-sm text-zinc-600">No responses recorded.</p>
                ) : (
                  detail.responses.map((response, index) => {
                    const playbackId = getPlaybackId(response.content, response.metadata);
                    return (
                      <div key={response.id} className="border rounded-lg p-3">
                        <p className="text-sm font-medium text-zinc-900">
                          {response.step?.promptText || `Step ${index + 1}`}
                        </p>
                        <p className="text-xs text-zinc-600 mb-2">
                          {response.responseType} • {formatDate(response.createdAt)}
                        </p>

                        {(response.responseType === "text" ||
                          response.responseType === "button" ||
                          response.responseType === "multiple_choice") && (
                          <p className="text-sm text-zinc-800">{response.content || "--"}</p>
                        )}

                        {(response.responseType === "audio" ||
                          response.responseType === "video") && (
                          <div className="max-w-xl">
                            {playbackId ? (
                              <VideoPlayer playbackId={playbackId} />
                            ) : (
                              <p className="text-sm text-zinc-600">Media unavailable</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t pt-4 space-y-3">
                <h4 className="text-sm font-semibold text-zinc-900">Coach Response</h4>
                <Textarea
                  value={reviewMessage}
                  onChange={(e) => setReviewMessage(e.target.value)}
                  placeholder="Write your feedback response..."
                  className="min-h-[90px] text-zinc-900"
                />
                <Input
                  value={loomUrl}
                  onChange={(e) => setLoomUrl(e.target.value)}
                  placeholder="Optional Loom URL"
                  className="text-zinc-900"
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleSaveResponse} disabled={savingReview}>
                    {savingReview ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Save Response
                  </Button>
                  <Button variant="outline" onClick={handleOpenEmailDraft}>
                    <Mail className="w-4 h-4 mr-2" />
                    Email Draft
                  </Button>
                  <Button variant="outline" onClick={handleCopyShareLink}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Share Link
                  </Button>
                  {loomUrl.trim() && (
                    <Button
                      variant="outline"
                      onClick={() => window.open(loomUrl.trim(), "_blank")}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open Loom
                    </Button>
                  )}
                </div>
              </div>

              {reviews.length > 0 && (
                <div className="border-t pt-4 space-y-2">
                  <h4 className="text-sm font-semibold text-zinc-900">Response History</h4>
                  {reviews
                    .slice()
                    .reverse()
                    .map((review) => (
                      <div key={review.id} className="border rounded-md p-2">
                        <p className="text-xs text-zinc-600">
                          {review.coach?.name || review.coach?.email || "Coach"} •{" "}
                          {formatDate(review.createdAt)}
                        </p>
                        {review.message && (
                          <p className="text-sm text-zinc-800 mt-1">{review.message}</p>
                        )}
                        {review.loomUrl && (
                          <a
                            href={review.loomUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                          >
                            {review.loomUrl}
                          </a>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
