import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { curatedPassages, passageReadStatus } from "@/db/schema";
import { eq } from "drizzle-orm";
import { FeatureGate } from "@/components/auth/FeatureGate";
import { ReaderClient } from "@/app/(dashboard)/dashboard/reader/ReaderClient";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

interface PageProps {
  params: Promise<{ passageId: string }>;
}

async function CuratedPassageReader({ params }: PageProps) {
  const { passageId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // Fetch the passage
  const passage = await db.query.curatedPassages.findFirst({
    where: eq(curatedPassages.id, passageId),
  });

  if (!passage) {
    notFound();
  }

  // Mark as read (upsert -- no-op if already read)
  await db
    .insert(passageReadStatus)
    .values({
      userId: user.id,
      passageId: passage.id,
    })
    .onConflictDoNothing();

  return (
    <div className="container mx-auto px-4 py-6 space-y-4">
      <Link
        href="/accelerator/reader"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Passages
      </Link>

      <h1 className="text-xl font-bold text-foreground">{passage.title}</h1>

      <ReaderClient initialText={passage.body} hideImport />
    </div>
  );
}

export default function AcceleratorPassagePage(props: PageProps) {
  return (
    <FeatureGate feature="mandarin_accelerator">
      <CuratedPassageReader {...props} />
    </FeatureGate>
  );
}
