import { FeatureGate } from "@/components/auth/FeatureGate";
import { ContentPageClient } from "../ContentPageClient";

export default function PracticePlanPage() {
  return (
    <FeatureGate feature="mandarin_accelerator">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Practice Plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Follow this plan to get the most out of your Mandarin Accelerator practice.
          </p>
        </div>
        <ContentPageClient
          title="Practice Plan"
          description="Download the practice plan to guide your study sessions."
          videoKey="accelerator.practice_plan.video_url"
          pdfKey="accelerator.practice_plan.pdf_url"
        />
      </div>
    </FeatureGate>
  );
}
