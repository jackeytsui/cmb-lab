import { VideoPlayer } from "@/components/video/VideoPlayer";

export default function TestVideoPage() {
  // Use Mux's public test playback ID if user hasn't set up their own
  const testPlaybackId =
    process.env.NEXT_PUBLIC_TEST_MUX_PLAYBACK_ID ||
    "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">
          Video Player Test
        </h1>
        <p className="text-zinc-400 mb-4">
          Testing Mux video player integration. This page verifies:
        </p>
        <ul className="text-zinc-400 mb-6 list-disc list-inside space-y-1">
          <li>Video loads and displays poster/thumbnail</li>
          <li>Play/pause controls work</li>
          <li>Scrubber/progress bar works</li>
          <li>Volume controls work</li>
          <li>Fullscreen mode works</li>
          <li>
            Playback speed selector shows 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x
          </li>
        </ul>

        <div className="rounded-lg overflow-hidden shadow-2xl">
          <VideoPlayer
            playbackId={testPlaybackId}
            title="Test Video"
            onEnded={() => console.log("Video ended")}
            onPlay={() => console.log("Video playing")}
            onPause={() => console.log("Video paused")}
            onTimeUpdate={(time) => console.log("Current time:", time)}
          />
        </div>

        <div className="mt-6 p-4 bg-zinc-900 rounded-lg">
          <h2 className="text-lg font-semibold text-white mb-2">
            Configuration
          </h2>
          <p className="text-zinc-400 text-sm">
            Using playback ID:{" "}
            <code className="text-indigo-400">{testPlaybackId}</code>
          </p>
          <p className="text-zinc-500 text-sm mt-2">
            Set <code>NEXT_PUBLIC_TEST_MUX_PLAYBACK_ID</code> in your .env.local
            to test with your own video.
          </p>
        </div>
      </div>
    </div>
  );
}
