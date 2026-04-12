import { FeatureGate } from "@/components/auth/FeatureGate";

const BOOKING_URL =
  process.env.NEXT_PUBLIC_GHL_BOOKING_URL ??
  "https://api.leadconnectorhq.com/widget/booking/fmMGCzcts9TKFmdhLOj5";

export default function BookACallPage() {
  return (
    <FeatureGate feature="mandarin_accelerator">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Book a Call</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Schedule a conversation with our team to discuss your Mandarin learning journey.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <iframe
            src={BOOKING_URL}
            className="w-full border-0"
            style={{ minHeight: "700px" }}
            title="Book a Call"
            allow="camera; microphone"
          />
        </div>
      </div>
    </FeatureGate>
  );
}
