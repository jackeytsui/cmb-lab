import { FeatureGate } from "@/components/auth/FeatureGate";
import { ContentPageClient } from "../ContentPageClient";

export default function StarterPackPage() {
  return (
    <FeatureGate feature="mandarin_accelerator">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Starter Pack</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything you need to get started with the Mandarin Accelerator.
          </p>
        </div>
        <ContentPageClient
          title="Starter Pack"
          description="Download the starter pack with essential resources."
          videoKey="accelerator.starter_pack.video_url"
          pdfKey="accelerator.starter_pack.pdf_url"
        />
      </div>
    </FeatureGate>
  );
}
