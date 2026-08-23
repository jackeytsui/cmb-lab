"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  BellRing,
  ExternalLink,
  Loader2,
  Megaphone,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type AdminAnnouncement = {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
  isActive: boolean;
  publishedAt: string;
  archivedAt: string | null;
  authorName: string | null;
  authorEmail: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AnnouncementManager({
  initialAnnouncements,
}: {
  initialAnnouncements: AdminAnnouncement[];
}) {
  const router = useRouter();
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const activeAnnouncement = announcements.find((item) => item.isActive);

  async function publishAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPublishing(true);

    try {
      const response = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, linkUrl, linkLabel }),
      });
      const result = (await response.json()) as {
        error?: string;
        announcement?: {
          id: string;
          title: string;
          body: string;
          linkUrl: string | null;
          linkLabel: string | null;
          publishedAt: string;
          notificationCount: number;
        };
      };
      if (!response.ok || !result.announcement) {
        throw new Error(result.error || "Could not publish announcement");
      }

      const next = result.announcement;
      const now = new Date().toISOString();
      setAnnouncements((current) => [
        {
          ...next,
          isActive: true,
          archivedAt: null,
          authorName: "You",
          authorEmail: "",
        },
        ...current.map((item) =>
          item.isActive ? { ...item, isActive: false, archivedAt: now } : item,
        ),
      ]);
      setTitle("");
      setBody("");
      setLinkUrl("");
      setLinkLabel("");
      toast.success(
        `Announcement published and sent to ${next.notificationCount} account${next.notificationCount === 1 ? "" : "s"}`,
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not publish announcement",
      );
    } finally {
      setPublishing(false);
    }
  }

  async function archiveAnnouncement(id: string) {
    if (!window.confirm("Remove this banner for everyone?")) return;
    setArchivingId(id);

    try {
      const response = await fetch(`/api/admin/announcements/${id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not remove banner");

      const now = new Date().toISOString();
      setAnnouncements((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, isActive: false, archivedAt: now }
            : item,
        ),
      );
      toast.success("Banner removed for everyone");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove banner",
      );
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Link
        href="/admin/manage"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Admin workspace
      </Link>

      <header className="mb-7">
        <div className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
          <Megaphone className="size-4" aria-hidden="true" />
          Broadcast center
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Announcements
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Publish one unmistakable banner across CMB Lab. Everyone also gets an
          in-app notification, plus browser push if they enabled alerts.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <form
          onSubmit={publishAnnouncement}
          className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Post an announcement</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Publishing replaces the current live banner.
              </p>
            </div>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
              <BellRing className="size-5" aria-hidden="true" />
            </span>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="announcement-title">Headline</Label>
                <span className="text-xs text-muted-foreground">{title.length}/120</span>
              </div>
              <Input
                id="announcement-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                minLength={3}
                maxLength={120}
                placeholder="Example: Live coaching starts in 30 minutes"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="announcement-body">Message</Label>
                <span className="text-xs text-muted-foreground">{body.length}/600</span>
              </div>
              <Textarea
                id="announcement-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                minLength={3}
                maxLength={600}
                className="min-h-32 resize-y"
                placeholder="Give students the important details and what they should do next."
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="announcement-link">Link (optional)</Label>
                <Input
                  id="announcement-link"
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  maxLength={500}
                  placeholder="/dashboard/coaching/group-schedule"
                  inputMode="url"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="announcement-link-label">Button text</Label>
                <Input
                  id="announcement-link-label"
                  value={linkLabel}
                  onChange={(event) => setLinkLabel(event.target.value)}
                  maxLength={40}
                  placeholder="View schedule"
                  disabled={!linkUrl.trim()}
                />
              </div>
            </div>

            {(title.trim() || body.trim()) && (
              <div className="overflow-hidden rounded-xl bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-700 p-4 text-white shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-100">
                  Banner preview
                </p>
                <p className="mt-1 font-bold">{title.trim() || "Your headline"}</p>
                <p className="mt-1 text-sm leading-5 text-white/90">
                  {body.trim() || "Your message"}
                </p>
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={publishing || title.trim().length < 3 || body.trim().length < 3}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {publishing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              {publishing ? "Publishing…" : "Publish banner & notify everyone"}
            </Button>
          </div>
        </form>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Currently live</h2>
            {activeAnnouncement ? (
              <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 shadow-none dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                Live for everyone
              </Badge>
            ) : (
              <Badge variant="outline">No live banner</Badge>
            )}
          </div>

          {activeAnnouncement ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-50">
              <p className="font-semibold">{activeAnnouncement.title}</p>
              <p className="mt-1 text-sm leading-5 opacity-80">
                {activeAnnouncement.body}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs opacity-70">
                  Posted {formatDate(activeAnnouncement.publishedAt)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => archiveAnnouncement(activeAnnouncement.id)}
                  disabled={archivingId === activeAnnouncement.id}
                  className="border-indigo-300 bg-white/80 text-indigo-800 hover:bg-white dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-100"
                >
                  {archivingId === activeAnnouncement.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Archive className="size-4" aria-hidden="true" />
                  )}
                  Remove banner
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <Megaphone className="mx-auto size-7 text-muted-foreground/60" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">Nothing is live right now</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Use the form to reach every active CMB Lab account.
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Announcement history</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The latest 50 broadcasts are kept here for reference.
        </p>

        <div className="mt-5 divide-y divide-border">
          {announcements.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Your published announcements will appear here.
            </p>
          ) : (
            announcements.map((announcement) => (
              <article key={announcement.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{announcement.title}</h3>
                      {announcement.isActive ? (
                        <Badge className="bg-emerald-600 text-white shadow-none">Live</Badge>
                      ) : (
                        <Badge variant="outline">Archived</Badge>
                      )}
                    </div>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {announcement.body}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDate(announcement.publishedAt)} · {announcement.authorName || announcement.authorEmail}
                    </p>
                  </div>
                  {announcement.linkUrl ? (
                    <Button asChild variant="ghost" size="sm" className="w-fit shrink-0">
                      <Link href={announcement.linkUrl}>
                        Open link
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
