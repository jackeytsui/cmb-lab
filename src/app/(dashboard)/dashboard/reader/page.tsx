import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function ReaderPage({
  searchParams,
}: {
  searchParams: Promise<{ lessonId?: string; onboarding?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.lessonId) query.set("lessonId", params.lessonId);
  if (params.onboarding) query.set("onboarding", params.onboarding);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`/dashboard/reader/mandarin${suffix}`);
}
