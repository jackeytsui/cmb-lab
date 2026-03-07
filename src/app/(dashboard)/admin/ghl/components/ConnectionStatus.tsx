"use client";

import { useState } from "react";

export function ConnectionStatus() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    connected: boolean;
    locationName?: string;
    error?: string;
  } | null>(null);

  async function testConnection() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/ghl/test-connection", {
        method: "POST",
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ connected: false, error: "Network error" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Connection Status
          </h3>
          <p className="mt-1 text-sm text-zinc-400">
            Test the GoHighLevel API connection and verify your credentials.
          </p>
        </div>
        <button
          onClick={testConnection}
          disabled={testing}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {testing ? "Testing..." : "Test Connection"}
        </button>
      </div>

      {result && (
        <div className="mt-4">
          {result.connected ? (
            <div className="flex items-center gap-2 rounded-md bg-green-500/10 px-4 py-3 text-green-400">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-400" />
              <span className="text-sm font-medium">
                Connected to {result.locationName}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-4 py-3 text-red-400">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="text-sm font-medium">
                {result.error || "Connection failed"}
              </span>
            </div>
          )}
        </div>
      )}

      {!result && (
        <div className="mt-4 flex items-center gap-2 rounded-md bg-zinc-700/50 px-4 py-3 text-zinc-400">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-500" />
          <span className="text-sm">
            Click &quot;Test Connection&quot; to verify GHL API credentials. Set{" "}
            <code className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
              GHL_API_TOKEN
            </code>{" "}
            and{" "}
            <code className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
              GHL_LOCATION_ID
            </code>{" "}
            environment variables to enable GHL integration.
          </span>
        </div>
      )}
    </div>
  );
}
