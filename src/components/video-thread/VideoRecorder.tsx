"use client";

import React, { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { StopCircle, RotateCcw, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface VideoRecorderProps {
  onUploadComplete: (result: { uploadId: string; dbUploadId: string; muxPlaybackId?: string }) => void;
  onUploadStart?: () => void;
}

type UploadPhase = "idle" | "uploading" | "processing";

export function VideoRecorder({ onUploadComplete, onUploadStart }: VideoRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");

  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const startRecording = () => {
    if (!stream) return;
    const recorder = new MediaRecorder(stream);
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      setRecordedBlob(blob);
      setVideoUrl(URL.createObjectURL(blob));
    };

    recorder.start();
    setIsRecording(true);
    mediaRecorderRef.current = recorder;
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleRetake = () => {
    setRecordedBlob(null);
    setVideoUrl(null);
    setUploadPhase("idle");
    startCamera();
  };

  const handleUpload = async () => {
    if (!recordedBlob) return;

    onUploadStart?.();
    setUploadPhase("uploading");

    try {
      // Step 1: Get Mux direct upload URL
      const urlRes = await fetch("/api/admin/mux/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: `thread-recording-${Date.now()}.webm`,
          category: "prompt",
        }),
      });

      if (!urlRes.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadUrl, uploadId, dbUploadId } = await urlRes.json();

      // Step 2: PUT the recorded blob directly to Mux
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: recordedBlob,
        headers: { "Content-Type": "video/webm" },
      });

      if (!putRes.ok) {
        throw new Error("Failed to upload video to Mux");
      }

      // Step 3: Poll check-status until ready or errored
      setUploadPhase("processing");

      const MAX_POLLS = 20;
      const POLL_INTERVAL = 3000; // 3 seconds
      let muxPlaybackId: string | undefined;

      for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

        const statusRes = await fetch("/api/admin/mux/check-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId }),
        });

        if (!statusRes.ok) {
          continue; // Retry on network errors
        }

        const statusData = await statusRes.json();

        if (statusData.status === "ready") {
          muxPlaybackId = statusData.muxPlaybackId;
          onUploadComplete({ uploadId, dbUploadId, muxPlaybackId });
          setUploadPhase("idle");
          return;
        }

        if (statusData.status === "errored") {
          throw new Error("Video processing failed on Mux");
        }

        // "uploading" or "processing" -- keep polling
      }

      // Timeout: exceeded 20 polls (60 seconds)
      toast.error("Video processing timed out. Please try again.");
      setUploadPhase("idle");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Upload failed. Please try again.");
      setUploadPhase("idle");
    }
  };

  const isUploading = uploadPhase !== "idle";

  if (videoUrl) {
    return (
      <div className="relative w-full h-full bg-black flex flex-col items-center justify-center">
        {isUploading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
            <p className="text-white text-sm font-medium">
              {uploadPhase === "uploading" ? "Uploading to Mux..." : "Processing video..."}
            </p>
            <p className="text-gray-400 text-xs">
              {uploadPhase === "processing" && "This may take up to 60 seconds"}
            </p>
          </div>
        ) : (
          <>
            <video src={videoUrl} controls className="w-full h-full object-contain" />
            <div className="absolute bottom-4 flex gap-4">
              <Button variant="secondary" onClick={handleRetake}>
                <RotateCcw className="w-4 h-4 mr-2" /> Retake
              </Button>
              <Button onClick={handleUpload}>
                <Upload className="w-4 h-4 mr-2" /> Upload
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black group overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover transform scale-x-[-1]"
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isRecording ? (
          <Button
            size="lg"
            variant="destructive"
            className="rounded-full w-16 h-16 p-0 hover:scale-110 transition-transform"
            onClick={startRecording}
          >
            <div className="w-6 h-6 bg-white rounded-full" />
          </Button>
        ) : (
          <Button
            size="lg"
            variant="secondary"
            className="rounded-full w-16 h-16 p-0 hover:scale-110 transition-transform animate-pulse"
            onClick={stopRecording}
          >
            <StopCircle className="w-8 h-8 text-red-500" />
          </Button>
        )}
      </div>
      {isRecording && (
        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-red-500/80 rounded-full text-white text-xs font-medium">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          Recording
        </div>
      )}
    </div>
  );
}
