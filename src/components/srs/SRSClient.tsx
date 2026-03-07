"use client";

import { useEffect, useMemo, useState } from "react";
import { Volume2, RotateCcw, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTTS } from "@/hooks/useTTS";

type Deck = {
  id: string;
  name: string;
  description: string | null;
  dueCards: number;
  totalCards: number;
};

type Card = {
  id: string;
  traditional: string;
  simplified: string | null;
  pinyin: string | null;
  jyutping: string | null;
  meaning: string;
  example: string | null;
};

type SrsStats = {
  dueToday: number;
  new: number;
  learning: number;
  review: number;
  mastered: number;
  total: number;
};

const ratings: Array<"again" | "hard" | "good" | "easy"> = ["again", "hard", "good", "easy"];

export function SRSClient() {
  const [stats, setStats] = useState<SrsStats | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<string | undefined>(undefined);
  const [nextCard, setNextCard] = useState<Card | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deckName, setDeckName] = useState("");

  const { speak, isLoading: ttsLoading } = useTTS();

  async function loadStats() {
    const res = await fetch("/api/srs/stats");
    if (res.ok) {
      const data = await res.json();
      setStats(data.stats);
      setDecks(data.decks ?? []);
      if (!activeDeckId && data.decks?.length) {
        setActiveDeckId(data.decks[0].id);
      }
    }
  }

  async function loadNextCard(deckId = activeDeckId) {
    const qs = deckId ? `?deckId=${encodeURIComponent(deckId)}` : "";
    const res = await fetch(`/api/srs/review/next${qs}`);
    if (res.ok) {
      const data = await res.json();
      setNextCard(data.card ?? null);
      setShowBack(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadStats(), loadNextCard()]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeDeckId) {
      loadNextCard(activeDeckId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeckId]);

  const activeDeck = useMemo(() => decks.find((d) => d.id === activeDeckId) ?? null, [decks, activeDeckId]);

  async function handleRate(rating: "again" | "hard" | "good" | "easy") {
    if (!nextCard) return;

    const res = await fetch("/api/srs/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: nextCard.id, rating }),
    });

    if (res.ok) {
      await Promise.all([loadStats(), loadNextCard()]);
    }
  }

  async function handleCreateDeck() {
    if (!deckName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/srs/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deckName.trim() }),
      });
      if (res.ok) {
        setDeckName("");
        await loadStats();
      }
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <div className="text-zinc-400">Loading SRS...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat title="Due" value={stats?.dueToday ?? 0} />
        <Stat title="New" value={stats?.new ?? 0} />
        <Stat title="Learning" value={stats?.learning ?? 0} />
        <Stat title="Review" value={stats?.review ?? 0} />
        <Stat title="Mastered" value={stats?.mastered ?? 0} />
        <Stat title="Total" value={stats?.total ?? 0} />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm text-zinc-300">
          <Layers className="h-4 w-4 text-cyan-400" />
          Decks
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {decks.map((deck) => (
            <button
              key={deck.id}
              type="button"
              onClick={() => setActiveDeckId(deck.id)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                activeDeckId === deck.id
                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                  : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {deck.name} ({deck.dueCards}/{deck.totalCards})
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            placeholder="New deck name"
            className="max-w-xs"
          />
          <Button onClick={handleCreateDeck} disabled={creating || !deckName.trim()}>
            Create Deck
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="mb-2 text-sm text-zinc-400">
          {activeDeck ? `Reviewing: ${activeDeck.name}` : "Review Queue"}
        </div>

        {!nextCard ? (
          <div className="py-12 text-center">
            <p className="text-lg text-zinc-300">No cards due right now.</p>
            <p className="mt-2 text-sm text-zinc-500">Create cards from Reader/Vocabulary or add cards manually.</p>
            <Button className="mt-4" variant="outline" onClick={() => loadNextCard()}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Refresh Queue
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <button
              type="button"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-8 text-left"
              onClick={() => setShowBack((prev) => !prev)}
            >
              {!showBack ? (
                <div>
                  <div className="text-5xl font-bold text-zinc-100">{nextCard.traditional}</div>
                  <div className="mt-2 text-cyan-400">{nextCard.pinyin || ""}</div>
                  <div className="text-amber-400">{nextCard.jyutping || ""}</div>
                  <div className="mt-3 text-xs text-zinc-500">Tap to flip</div>
                </div>
              ) : (
                <div>
                  <p className="text-lg text-zinc-100">{nextCard.meaning}</p>
                  {nextCard.example && (
                    <p className="mt-3 text-sm text-zinc-400">{nextCard.example}</p>
                  )}
                </div>
              )}
            </button>

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                disabled={ttsLoading}
                onClick={() => speak(nextCard.traditional, { language: "zh-CN" })}
              >
                <Volume2 className="mr-2 h-4 w-4" />
                Play Audio
              </Button>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {ratings.map((rating) => (
                  <Button
                    key={rating}
                    onClick={() => handleRate(rating)}
                    variant={rating === "again" ? "destructive" : "secondary"}
                    className="capitalize"
                  >
                    {rating}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-100">{value}</div>
    </div>
  );
}
