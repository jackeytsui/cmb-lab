"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Volume2, Mic, StopCircle } from "lucide-react";

type Drill = {
  id: string;
  syllable: string;
  tone: number;
  language: "mandarin" | "cantonese";
  type?: "sandhi";
};

type ToneAccuracy = {
  tone: number;
  accuracy: number;
  attempts: number;
};

export default function ToneTrainingClient() {
  const [language, setLanguage] = useState<"mandarin" | "cantonese">("mandarin");
  const [drills, setDrills] = useState<Drill[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<string>("");
  const [toneAccuracy, setToneAccuracy] = useState<ToneAccuracy[]>([]);
  const [targetPhrase, setTargetPhrase] = useState("\u4f60\u597d");
  const [productionScore, setProductionScore] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const current = drills[currentIndex] ?? null;

  async function loadDrills() {
    try {
      const res = await fetch(`/api/tone/drills?language=${language}`);
      if (res.ok) {
        const data = await res.json();
        setDrills(data.drills ?? []);
        setCurrentIndex(0);
        setFeedback("");
      }
    } catch {
      // Non-critical: drills section will show empty state
    }
  }

  async function loadStats() {
    try {
      const res = await fetch("/api/tone/attempts");
      if (res.ok) {
        const data = await res.json();
        setToneAccuracy(data.toneAccuracy ?? []);
      }
    } catch {
      // Non-critical: accuracy tracker will show empty
    }
  }

  useEffect(() => {
    loadDrills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    loadStats();
  }, []);

  async function playCurrent() {
    if (!current) return;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: current.syllable,
          language: language === "cantonese" ? "zh-HK" : "zh-CN",
        }),
      });
      if (!res.ok) return;
      const buffer = await res.arrayBuffer();
      const blob = new Blob([buffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play().finally(() => URL.revokeObjectURL(url));
    } catch {
      // TTS failure is non-critical
    }
  }

  async function submitTone(choice: number) {
    if (!current) return;
    const isCorrect = choice === current.tone;
    setFeedback(isCorrect ? "Correct" : `Not quite. Expected tone ${current.tone}`);

    await fetch("/api/tone/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language,
        type: current.type === "sandhi" ? "sandhi" : "identification",
        prompt: current.syllable,
        expectedTone: current.tone,
        selectedTone: choice,
        score: isCorrect ? 100 : 0,
      }),
    }).catch(() => {});

    await loadStats();
    setCurrentIndex((idx) => (drills.length ? (idx + 1) % drills.length : 0));
  }

  async function startRecording() {
    setRecordingError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        bytes.forEach((byte) => {
          binary += String.fromCharCode(byte);
        });
        const audioBase64 = btoa(binary);

        try {
          const res = await fetch("/api/tone/score-pronunciation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioBase64,
              targetPhrase,
              language,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            setProductionScore(Math.round(data.score ?? 0));
            await fetch("/api/tone/attempts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                language,
                type: "production",
                prompt: targetPhrase,
                score: Number(data.score ?? 0),
                feedback: data.feedback,
              }),
            }).catch(() => {});
            await loadStats();
          } else {
            setRecordingError("Scoring failed. Try again.");
          }
        } catch {
          setRecordingError("Scoring service unavailable.");
        }

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setRecordingError("Microphone access denied or unavailable.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  const tones = useMemo(() => (language === "cantonese" ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4]), [language]);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button variant={language === "mandarin" ? "default" : "secondary"} onClick={() => setLanguage("mandarin")}>Mandarin</Button>
        <Button variant={language === "cantonese" ? "default" : "secondary"} onClick={() => setLanguage("cantonese")}>Cantonese</Button>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-100">Tone Identification</h2>
        {current ? (
          <>
            <p className="text-sm text-zinc-400">Listen and choose the tone number for:</p>
            <p className="text-3xl font-bold text-zinc-100">{current.syllable}</p>
            <Button variant="outline" onClick={playCurrent}>
              <Volume2 className="mr-2 h-4 w-4" /> Play Audio
            </Button>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
              {tones.map((tone) => (
                <Button key={tone} variant="secondary" onClick={() => submitTone(tone)}>
                  Tone {tone}
                </Button>
              ))}
            </div>
            {feedback && <p className="text-sm text-zinc-300">{feedback}</p>}
          </>
        ) : (
          <p className="text-sm text-zinc-500">No drills available yet.</p>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-100">Tone Production</h2>
        <p className="text-sm text-zinc-400">Record and score your pronunciation for a target phrase.</p>
        <input
          value={targetPhrase}
          onChange={(e) => setTargetPhrase(e.target.value)}
          className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-zinc-100"
          placeholder="Target phrase"
        />
        <div className="flex gap-2">
          {!isRecording ? (
            <Button onClick={startRecording}>
              <Mic className="mr-2 h-4 w-4" /> Start Recording
            </Button>
          ) : (
            <Button variant="destructive" onClick={stopRecording}>
              <StopCircle className="mr-2 h-4 w-4" /> Stop Recording
            </Button>
          )}
        </div>
        {recordingError && (
          <p className="text-sm text-red-400">{recordingError}</p>
        )}
        {productionScore !== null && (
          <p className="text-sm text-zinc-300">Production Score: <span className="font-semibold text-cyan-300">{productionScore}</span></p>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="text-lg font-semibold text-zinc-100">Tone Accuracy Tracker</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {toneAccuracy.map((row) => (
            <div key={row.tone} className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="text-xs text-zinc-500">Tone {row.tone}</div>
              <div className="text-xl font-semibold text-zinc-100">{row.accuracy}%</div>
              <div className="text-xs text-zinc-500">{row.attempts} attempts</div>
            </div>
          ))}
          {toneAccuracy.length === 0 && <p className="text-sm text-zinc-500">No tone attempts yet.</p>}
        </div>
      </div>
    </div>
  );
}
