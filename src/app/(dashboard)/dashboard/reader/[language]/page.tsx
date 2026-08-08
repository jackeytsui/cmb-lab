import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { FeatureGate } from "@/components/auth/FeatureGate";
import { getReaderInitialText } from "@/lib/reader-initial-text";
import { ReaderClient } from "../ReaderClient";

export default async function LanguageReaderPage({
  params,
  searchParams,
}: {
  params: Promise<{ language: string }>;
  searchParams: Promise<{ lessonId?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { language } = await params;
  if (language !== "mandarin" && language !== "cantonese") notFound();
  const { lessonId } = await searchParams;
  const initialText = await getReaderInitialText(userId, lessonId);

  return (
    <FeatureGate feature="dictionary_reader">
      <ReaderClient
        initialText={initialText || undefined}
        language={language}
      />
    </FeatureGate>
  );
}
