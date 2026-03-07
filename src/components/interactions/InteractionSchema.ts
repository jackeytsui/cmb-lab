import { z } from "zod";

export const textInteractionSchema = z.object({
  response: z
    .string()
    .min(1, { message: "Please enter your response" })
    .max(500, { message: "Response too long (max 500 characters)" }),
});

export type TextInteractionFormValues = z.infer<typeof textInteractionSchema>;
