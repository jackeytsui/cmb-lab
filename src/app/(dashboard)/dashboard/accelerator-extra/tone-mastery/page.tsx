import { FeatureGate } from "@/components/auth/FeatureGate";
import { ToneMasteryClient } from "./ToneMasteryClient";

export default function ToneMasteryPage() {
  return (
    <FeatureGate feature="tone_mastery">
      <div className="container mx-auto px-4 py-8 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Advanced Tone Mastery System
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Master all 16 Mandarin tone combinations with targeted video drills.
          </p>
        </div>
        <ToneMasteryClient />
      </div>
    </FeatureGate>
  );
}
