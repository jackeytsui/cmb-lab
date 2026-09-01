import { z } from "zod";
import { PLATFORM_ROLES } from "@/lib/platform-roles";

const safeAnnouncementLink = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) =>
      !value ||
      (value.startsWith("/") && !value.startsWith("//")) ||
      value.startsWith("https://"),
    "Link must be a CMB Lab path or an https:// URL",
  );

export const announcementInputSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    body: z.string().trim().min(3).max(600),
    linkUrl: safeAnnouncementLink,
    linkLabel: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((value) => value || undefined),
    audienceMode: z.enum(["all", "targeted"]).default("all"),
    audienceTagIds: z.array(z.uuid()).max(100).default([]),
    audienceRoles: z.enum(PLATFORM_ROLES).array().max(PLATFORM_ROLES.length).default([]),
  })
  .superRefine((value, context) => {
    if (value.linkLabel && !value.linkUrl) {
      context.addIssue({
        code: "custom",
        path: ["linkLabel"],
        message: "Add a link before adding button text",
      });
    }
    if (
      value.audienceMode === "targeted" &&
      value.audienceTagIds.length === 0 &&
      value.audienceRoles.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["audienceMode"],
        message: "Select at least one tag or role for a targeted announcement",
      });
    }
  });

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
