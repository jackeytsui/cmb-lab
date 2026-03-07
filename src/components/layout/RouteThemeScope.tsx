"use client";

import { usePathname } from "next/navigation";

export function RouteThemeScope({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");

  return (
    <div data-admin-theme={isAdminRoute ? "true" : "false"}>
      {children}
    </div>
  );
}
