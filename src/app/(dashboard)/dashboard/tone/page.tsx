import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ToneTrainingClient from "./ToneTrainingClient";

export default async function TonePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Tone Training</h1>
        <p className="mt-1 text-sm text-zinc-400">Identification drills, production scoring, minimal pairs, and sandhi practice.</p>
      </div>
      <ToneTrainingClient />
    </div>
  );
}
