import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Video } from "lucide-react";
import { VideoThreadList } from "@/components/admin/video-threads/VideoThreadList";

export default function VideoThreadsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <Video className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Video Threads</h1>
            <p className="text-zinc-400">
              Create multi-step video interactions (VideoAsk style).
            </p>
          </div>
        </div>
        <Link href="/admin/video-threads/new">
          <Button className="bg-indigo-600 hover:bg-indigo-500 text-white">
            <Plus className="w-4 h-4 mr-2" />
            New Thread
          </Button>
        </Link>
      </div>

      <VideoThreadList />
    </div>
  );
}
