import { hasMinimumRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AcceleratorAdminNav } from "../AcceleratorAdminNav";
import LtoReportClient from "./LtoReportClient";

export default async function AcceleratorReportsPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) redirect("/dashboard");

  return (
    <div className="container mx-auto px-4 py-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Accelerator Admin
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage Mandarin Accelerator content and view engagement reports.
        </p>
      </div>
      <AcceleratorAdminNav />
      <LtoReportClient />
    </div>
  );
}
