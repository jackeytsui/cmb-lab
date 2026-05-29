import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { InternalDocsClient } from "./InternalDocsClient";

export default async function InternalDocsPage() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) redirect("/dashboard");

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <InternalDocsClient />
    </div>
  );
}
