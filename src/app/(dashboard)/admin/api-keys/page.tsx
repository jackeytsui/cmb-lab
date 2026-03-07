import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { AdminApiKeysClient } from "./AdminApiKeysClient";

export default async function AdminApiKeysPage() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  return <AdminApiKeysClient />;
}
