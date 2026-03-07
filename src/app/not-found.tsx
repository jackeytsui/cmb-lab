import Link from "next/link";
import { Home } from "lucide-react";

export const metadata = {
  title: "Page Not Found - CantoMando",
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-8xl font-bold text-zinc-600 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-white mb-2">
          Page Not Found
        </h2>
        <p className="text-zinc-400 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors font-medium"
        >
          <Home className="w-5 h-5" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
