"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

interface CertificateDownloadButtonProps {
  courseId: string;
  existingVerificationId?: string | null;
}

/**
 * Client component that generates a certificate (if needed) and downloads the PDF.
 * Prevents event propagation so it can be used inside a Link without navigating.
 */
export function CertificateDownloadButton({
  courseId,
  existingVerificationId,
}: CertificateDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(
    existingVerificationId ?? null
  );

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (loading) return;
    setError(null);

    try {
      let currentVerificationId = verificationId;

      if (!currentVerificationId) {
        setLoading(true);
        const res = await fetch("/api/certificates/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId }),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(error.error || "Failed to generate certificate");
        }

        const data = await res.json();
        currentVerificationId = data.certificate.verificationId;
        setVerificationId(currentVerificationId);
      }

      // Open download URL in new tab
      window.open(
        `/api/certificates/${currentVerificationId}/download`,
        "_blank"
      );
    } catch (err) {
      console.error("Certificate download failed:", err);
      setError("Failed to generate certificate. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Download className="w-3 h-3" />
        )}
        Certificate
      </button>
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  );
}
