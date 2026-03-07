"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { MoreHorizontal, Pencil, Trash2, Video, Layers } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface VideoThread {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  stepCount: number;
}

export function VideoThreadList() {
  const [threads, setThreads] = useState<VideoThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchThreads();
  }, []);

  const fetchThreads = async () => {
    try {
      const res = await fetch("/api/admin/video-threads");
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads);
      }
    } catch (error) {
      console.error("Failed to fetch threads:", error);
      toast.error("Failed to load video threads");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/video-threads/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Thread deleted");
        setThreads((prev) => prev.filter((t) => t.id !== id));
      } else {
        throw new Error("Failed to delete");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete thread");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="text-zinc-500">Loading threads...</div>;
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-800/50 px-6 py-12">
        <Video className="mb-3 h-10 w-10 text-zinc-500" />
        <p className="text-zinc-400 font-medium">No video threads yet</p>
        <p className="text-sm text-zinc-500 mt-1">
          Create your first thread to start engaging with students.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {threads.map((thread) => (
        <div
          key={thread.id}
          className="group relative flex flex-col justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-700 hover:bg-zinc-900 transition-all"
        >
          <div>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 text-zinc-500 text-xs">
                <Video className="w-3.5 h-3.5" />
                <span>{format(new Date(thread.createdAt), "MMM d, yyyy")}</span>
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-8 w-8 text-zinc-500 hover:text-white"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
                  <Link href={`/admin/video-threads/${thread.id}/builder`}>
                    <DropdownMenuItem className="text-zinc-200 focus:bg-zinc-700 cursor-pointer">
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  </Link>
                  <AlertDialog
                    open={deletingId === thread.id}
                    onOpenChange={(open) => setDeletingId(open ? thread.id : null)}
                  >
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        className="text-red-400 focus:bg-red-900/20 focus:text-red-300 cursor-pointer"
                        onSelect={(e) => e.preventDefault()}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Delete thread?</AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400">
                          This will permanently delete &quot;{thread.title}&quot; and all its steps.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => handleDelete(thread.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Link href={`/admin/video-threads/${thread.id}/builder`} className="block">
              <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-indigo-400 transition-colors">
                {thread.title}
              </h3>
              <p className="text-sm text-zinc-400 line-clamp-2 mb-4 h-10">
                {thread.description || "No description provided."}
              </p>
            </Link>
          </div>

          <div className="flex items-center gap-2 pt-4 border-t border-zinc-800">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-300">
              <Layers className="w-3.5 h-3.5" />
              <span>{thread.stepCount} Steps</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
