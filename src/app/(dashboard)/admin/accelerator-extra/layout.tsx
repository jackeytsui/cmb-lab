import { redirect } from "next/navigation";
import { hasAcceleratorManagementAccess } from "@/lib/auth";

export default async function AcceleratorExtraAdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasAcceleratorManagementAccess())) redirect("/admin/manage");
  return children;
}
