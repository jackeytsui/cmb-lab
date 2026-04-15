import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NotepadClient } from "./NotepadClient";
import { FeatureGate } from "@/components/auth/FeatureGate";

export const metadata = {
  title: "Notepad | Canto to Mando",
};

/**
 * Notepad — a dashboard-only scratchpad for pasting Traditional Chinese text
 * and seeing per-character ruby + tone coloring + auto-translation in both
 * Mandarin and Cantonese side by side.
 *
 * Equivalent to the Inner Circle Group Coaching output bubbles, minus the
 * session / recording / session-notes UI. Purely client-side; nothing is
 * persisted.
 */
export default async function NotepadPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <FeatureGate feature="notepad">
      <NotepadClient />
    </FeatureGate>
  );
}
