import { redirect } from "next/navigation";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";
import AdminTypingClient from "./AdminTypingClient";

export default async function AdminTypingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const canManage = await hasMinimumRole("coach");
  if (!canManage) redirect("/dashboard");

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">
          Manage Typing Sentences
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Create, edit, and bulk-upload Chinese typing drill sentences for the
          Mandarin Accelerator.
        </p>
      </div>
      <AdminTypingClient />
    </div>
  );
}
