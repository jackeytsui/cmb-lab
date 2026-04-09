import { ToneMasteryAdminClient } from "./ToneMasteryAdminClient";

export default function ToneMasteryAdminPage() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Manage Tone Mastery Clips
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload and manage video clips for the Advanced Tone Mastery System.
        </p>
      </div>
      <ToneMasteryAdminClient />
    </div>
  );
}
