"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
  className?: string;
  variant?: "inline" | "block";
}

export function ErrorAlert({
  message,
  onRetry,
  className,
  variant = "inline",
}: ErrorAlertProps) {
  if (variant === "block") {
    return (
      <div className={cn("text-center py-8", className)}>
        <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-6 h-6 text-red-400" />
        </div>
        <p className="text-sm text-red-400 mb-3">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md bg-red-500/10 border border-red-500/30 p-3",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-red-400">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
