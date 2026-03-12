import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Read transcript limit settings from app_settings table, with fallback defaults */
export async function getTranscriptLimitSettings(): Promise<{
  limitCount: number;
  period: "daily" | "weekly" | "monthly";
}> {
  try {
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "transcript_limit_count"));
    const periodRows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "transcript_limit_period"));

    const limitCount = parseInt(rows[0]?.value ?? "5", 10) || 5;
    const rawPeriod = periodRows[0]?.value ?? "weekly";
    const period =
      rawPeriod === "daily" || rawPeriod === "weekly" || rawPeriod === "monthly"
        ? rawPeriod
        : "weekly";

    return { limitCount, period };
  } catch {
    // Table might not exist yet (migration not run)
    return { limitCount: 5, period: "weekly" };
  }
}

export function getPeriodStart(period: "daily" | "weekly" | "monthly"): Date {
  const now = new Date();
  switch (period) {
    case "daily":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "weekly": {
      const day = now.getDay(); // 0=Sun
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Start on Monday
      return new Date(now.getFullYear(), now.getMonth(), diff);
    }
    case "monthly":
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}
