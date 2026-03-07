"use client";

import { useState } from "react";
import { Brain, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AddToSRSButtonProps {
  traditional: string;
  simplified?: string | null;
  pinyin?: string | null;
  jyutping?: string | null;
  meaning: string;
  example?: string;
}

export function AddToSRSButton(props: AddToSRSButtonProps) {
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);

  async function handleAdd() {
    setLoading(true);
    try {
      const res = await fetch("/api/srs/cards/from-vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traditional: props.traditional,
          simplified: props.simplified,
          pinyin: props.pinyin,
          jyutping: props.jyutping,
          meaning: props.meaning,
          example: props.example,
          sourceType: "reader",
        }),
      });

      if (res.ok) setAdded(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-cyan-300"
      title={added ? "Added to SRS" : "Add to SRS"}
      onClick={handleAdd}
      disabled={loading || added}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : added ? <Check className="h-4 w-4 text-emerald-400" /> : <Brain className="h-4 w-4" />}
    </Button>
  );
}
