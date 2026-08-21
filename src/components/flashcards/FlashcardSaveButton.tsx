"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildFlashcardContentKey,
  hasFlashcardText,
  notifyFlashcardsChanged,
  type FlashcardSaveInput,
} from "@/lib/flashcards";
import { FlashcardStarButton } from "./FlashcardStarButton";

export interface FlashcardSaveButtonProps extends FlashcardSaveInput {
  initialSavedId?: string | null;
  compact?: boolean;
  variant?: "star" | "bookmark";
  label?: string;
  onSavedChange?: (saved: boolean, id: string | null) => void;
}

export function FlashcardSaveButton({
  initialSavedId = null,
  compact = false,
  variant = "star",
  label,
  onSavedChange,
  chinese,
  simplified,
  pinyin,
  jyutping,
  english,
  sourceLabel,
  sourceType,
  sourceId,
  sourceUrl,
  language,
}: FlashcardSaveButtonProps) {
  const [savedId, setSavedId] = useState<string | null>(initialSavedId);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const item = useMemo<FlashcardSaveInput>(
    () => ({
      chinese,
      simplified,
      pinyin,
      jyutping,
      english,
      sourceLabel,
      sourceType,
      sourceId,
      sourceUrl,
      language,
    }),
    [
      chinese,
      simplified,
      pinyin,
      jyutping,
      english,
      sourceLabel,
      sourceType,
      sourceId,
      sourceUrl,
      language,
    ],
  );

  const contentKey = useMemo(() => buildFlashcardContentKey(item), [item]);

  useEffect(() => {
    if (!hasFlashcardText(item)) return;
    let cancelled = false;

    async function loadStatus() {
      if (initialSavedId) {
        setHydrated(true);
        return;
      }
      try {
        const res = await fetch(
          `/api/flashcards/items?contentKey=${encodeURIComponent(contentKey)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { item?: { id?: string } | null };
        if (!cancelled) {
          setSavedId(data.item?.id ?? null);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [contentKey, initialSavedId, item]);

  useEffect(() => {
    setSavedId(initialSavedId);
  }, [initialSavedId]);

  const handleToggle = async () => {
    if (!hasFlashcardText(item) || loading) return;
    setLoading(true);
    try {
      if (savedId) {
        const res = await fetch(`/api/flashcards/items?id=${encodeURIComponent(savedId)}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setSavedId(null);
          onSavedChange?.(false, null);
          notifyFlashcardsChanged();
        }
      } else {
        const res = await fetch("/api/flashcards/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (res.ok) {
          const data = (await res.json()) as { item?: { id?: string } | null };
          const nextId = data.item?.id ?? null;
          setSavedId(nextId);
          onSavedChange?.(true, nextId);
          notifyFlashcardsChanged();
        }
      }
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  };

  if (!hasFlashcardText(item)) return null;

  return (
    <FlashcardStarButton
      isSaved={!!savedId}
      isLoading={loading || !hydrated}
      onToggle={handleToggle}
      label={label}
      variant={variant}
      compact={compact}
    />
  );
}
