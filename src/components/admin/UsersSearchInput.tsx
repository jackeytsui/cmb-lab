"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

export function UsersSearchInput({
  defaultValue,
  roleFilter,
}: {
  defaultValue: string;
  roleFilter: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  const submit = () => {
    const params = new URLSearchParams({ tab: "users", usersRole: roleFilter });
    if (value.trim()) params.set("search", value.trim());
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Search name or email..."
        className="h-8 w-56 rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}
