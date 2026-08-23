import { z } from "zod";

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
  })
  .superRefine((value, context) => {
    if (value.linkLabel && !value.linkUrl) {
      context.addIssue({
        code: "custom",
        path: ["linkLabel"],
        message: "Add a link before adding button text",
      });
    }
  });

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
