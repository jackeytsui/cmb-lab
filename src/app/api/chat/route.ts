import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { getPrompt } from "@/lib/prompts";
import { searchKnowledgeBase } from "@/lib/chat-utils";
import {
  aiChatLimiter,
  aiChatLimiterElevated,
  rateLimitResponse,
  selectLimiter,
} from "@/lib/rate-limit";
import { saveChat } from "@/lib/chat-persistence";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { lessons, modules, courses, interactions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 30;

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful learning assistant for Canto to Mando Blueprint, an LMS teaching Mandarin and Cantonese simultaneously. Always search the knowledge base before answering factual questions about the platform, courses, or Chinese language. Be encouraging and supportive.";

/**
 * Build lesson-specific context for the chatbot system prompt.
 * Queries the lesson's title, module, course, and vocabulary (interactions)
 * to give the AI context about what the student is currently studying.
 */
async function buildChatLessonContext(lessonId: string): Promise<string> {
  // 1. Query lesson with module and course info
  const lessonData = await db
    .select({
      lessonTitle: lessons.title,
      moduleTitle: modules.title,
      courseTitle: courses.title,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .limit(1);

  if (lessonData.length === 0) return "";

  const lesson = lessonData[0];

  // 2. Query interactions for vocabulary
  const interactionData = await db
    .select({
      prompt: interactions.prompt,
      expectedAnswer: interactions.expectedAnswer,
    })
    .from(interactions)
    .where(eq(interactions.lessonId, lessonId));

  const vocab =
    interactionData.length > 0
      ? interactionData
          .map(
            (i) =>
              `- ${i.prompt}${i.expectedAnswer ? ` (${i.expectedAnswer})` : ""}`
          )
          .join("\n")
      : "No specific vocabulary for this lesson.";

  return `

CURRENT LESSON CONTEXT:
The student is currently studying: "${lesson.lessonTitle}" in module "${lesson.moduleTitle}" of course "${lesson.courseTitle}".

Lesson vocabulary and phrases:
${vocab}

LESSON-SPECIFIC BEHAVIOR:
- Reference this lesson's vocabulary naturally in your responses
- Suggest practice topics based on this lesson's content (e.g., "Would you like to practice using ${interactionData.length > 0 ? "the vocabulary from this lesson" : "conversation phrases"}?")
- When generating exercises, use vocabulary from this lesson
- If the student asks about unrelated topics, help them but gently suggest: "By the way, would you like to practice some of the vocabulary from your current lesson?"
- Proactively offer to quiz the student on lesson vocabulary after a few exchanges`;
}

export async function POST(request: Request) {
  // Auth check
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limiting
  const role =
    (sessionClaims?.metadata as Record<string, unknown>)?.role as string ||
    "student";
  const limiter = selectLimiter(role, aiChatLimiter, aiChatLimiterElevated);
  const rl = await limiter.limit(userId);
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  // Look up internal user for persistence
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const messages: UIMessage[] = body.messages;
    const languagePreference: string | undefined = body.languagePreference;
    const chatId: string | undefined = body.chatId;
    const lessonId: string | undefined = body.lessonId;

    // Load system prompt from database with fallback
    const basePrompt = await getPrompt(
      "chatbot-system",
      DEFAULT_SYSTEM_PROMPT
    );

    // Append language preference guidance
    const systemPrompt = `${basePrompt}

Student language preference: ${languagePreference || "both"}. Respond in the language the student prefers. If they prefer Cantonese, respond in Traditional Chinese with Jyutping. If they prefer Mandarin, respond in Simplified Chinese with Pinyin. If both, include both annotations.`;

    // Inject lesson context if lessonId provided
    let fullSystemPrompt = systemPrompt;
    if (lessonId) {
      try {
        const lessonContext = await buildChatLessonContext(lessonId);
        fullSystemPrompt += lessonContext;
      } catch (error) {
        console.error("Error building lesson context:", error);
        // Continue without lesson context — non-fatal
      }
    }

    // Stream response with RAG tool
    const modelMessages = await convertToModelMessages(messages.slice(-20));
    const result = streamText({
      model: openai("gpt-4o"),
      system: fullSystemPrompt,
      messages: modelMessages,
      tools: {
        searchKnowledgeBase: {
          description:
            "Search the knowledge base for information about the platform, courses, Chinese language topics, or learning materials. Use this before answering factual questions.",
          inputSchema: z.object({
            query: z.string(),
          }),
          execute: async ({ query }: { query: string }) =>
            searchKnowledgeBase(query),
        },
        generateExercise: {
          description:
            "Generate an inline practice exercise for the student. Use this when the student asks to practice, when you want to quiz them on vocabulary, or when lesson context suggests it would be helpful. Generate multiple_choice for vocabulary recognition and fill_in_blank for sentence construction.",
          inputSchema: z.object({
            type: z.enum(["multiple_choice", "fill_in_blank"]),
            question: z
              .string()
              .describe("The exercise question or instruction"),
            // MCQ fields
            options: z
              .array(
                z.object({
                  id: z.string(),
                  text: z.string(),
                })
              )
              .optional()
              .describe(
                "Options for multiple choice (required if type is multiple_choice)"
              ),
            correctOptionId: z
              .string()
              .optional()
              .describe(
                "ID of the correct option (required if type is multiple_choice)"
              ),
            explanation: z
              .string()
              .optional()
              .describe("Brief explanation of the correct answer"),
            // Fill-in-blank fields
            sentence: z
              .string()
              .optional()
              .describe(
                "Sentence with {{blank}} placeholders (required if type is fill_in_blank)"
              ),
            blanks: z
              .array(
                z.object({
                  id: z.string(),
                  correctAnswer: z.string(),
                  acceptableAnswers: z.array(z.string()).optional(),
                })
              )
              .optional()
              .describe(
                "Blank definitions with correct answers (required if type is fill_in_blank)"
              ),
          }),
          execute: async (exercise: {
            type: "multiple_choice" | "fill_in_blank";
            question: string;
            options?: { id: string; text: string }[];
            correctOptionId?: string;
            explanation?: string;
            sentence?: string;
            blanks?: {
              id: string;
              correctAnswer: string;
              acceptableAnswers?: string[];
            }[];
          }) => {
            // Return the exercise data for client-side rendering
            return { exercise, rendered: true };
          },
        },
      },
      stopWhen: stepCountIs(3),
    });

    const response = result.toUIMessageStreamResponse({
      originalMessages: messages,
      onFinish: ({ messages: allMessages }) => {
        if (chatId) {
          saveChat({
            chatId,
            messages: allMessages.map((m) => ({
              id: m.id,
              role: m.role,
              parts: m.parts,
            })),
            userId: user.id,
            lessonId: lessonId ?? null,
          });
        }
      },
    });
    result.consumeStream(); // No await — fire-and-forget to ensure onFinish fires even if client disconnects
    return response;
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
