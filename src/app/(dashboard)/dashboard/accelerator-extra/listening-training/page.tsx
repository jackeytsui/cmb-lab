import { FeatureGate } from "@/components/auth/FeatureGate";
import { ListeningTrainingClient } from "./ListeningTrainingClient";

export default function ListeningTrainingPage() {
  return (
    <FeatureGate feature="listening_training">
      <div className="container mx-auto px-4 py-8 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Native Speed Listening Comprehension Training
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Listen to native Mandarin and identify the correct pinyin.
            Choose from 4 options — if you pick wrong, try again!
          </p>
        </div>
        <ListeningTrainingClient />
      </div>
    </FeatureGate>
  );
}
