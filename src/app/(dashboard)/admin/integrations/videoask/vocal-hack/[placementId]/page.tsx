import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { VocalHackPlacementReviewClient } from "./VocalHackPlacementReviewClient";

export const metadata = {
  title: "Review VideoAsk Vocal Hack — Admin",
};

export default async function VocalHackPlacementReviewPage({
  params,
}: {
  params: Promise<{ placementId: string }>;
}) {
  if (!(await hasMinimumRole("admin"))) redirect("/home");
  const { placementId } = await params;
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <VocalHackPlacementReviewClient placementId={placementId} />
    </div>
  );
}
