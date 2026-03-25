import { redirect } from "next/navigation";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";
import AdminReaderClient from "./AdminReaderClient";
import { AcceleratorAdminNav } from "../AcceleratorAdminNav";

export default async function AdminCuratedPassagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const canManage = await hasMinimumRole("coach");
  if (!canManage) redirect("/dashboard");

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Mandarin Accelerator
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage content for LTO students.
        </p>
      </div>
      <AcceleratorAdminNav />
      <AdminReaderClient />
    </div>
  );
}
