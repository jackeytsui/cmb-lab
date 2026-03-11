/**
 * Database Seed Script
 *
 * Creates test data for development and testing:
 * - One test course (Beginner Cantonese)
 * - One test module (Greetings)
 * - One test lesson (Hello)
 *
 * Uses fixed UUIDs for idempotency - safe to run multiple times.
 *
 * Usage: npm run db:seed
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { courses, modules, lessons, aiPrompts, aiPromptVersions, kbCategories } from "./schema";

// Load environment variables from .env.local
config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("Error: DATABASE_URL environment variable is not set");
  console.error("Please configure DATABASE_URL in .env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

// Fixed UUIDs for idempotency
const TEST_COURSE_ID = "11111111-1111-1111-1111-111111111111";
const TEST_MODULE_ID = "22222222-2222-2222-2222-222222222222";
const TEST_LESSON_ID = "33333333-3333-3333-3333-333333333333";

// Fixed UUIDs for AI prompts
const VOICE_TUTOR_SYSTEM_ID = "550e8400-e29b-41d4-a716-446655440010";
const VOICE_TUTOR_LESSON_ID = "550e8400-e29b-41d4-a716-446655440011";
const VOICE_TUTOR_SYSTEM_V1_ID = "550e8400-e29b-41d4-a716-446655440020";
const VOICE_TUTOR_LESSON_V1_ID = "550e8400-e29b-41d4-a716-446655440021";

// Fixed UUIDs for knowledge base categories
const KB_CAT_PACKAGES_ID = "660e8400-e29b-41d4-a716-446655440030";
const KB_CAT_COACHING_ID = "660e8400-e29b-41d4-a716-446655440031";
const KB_CAT_CHINESE_HELP_ID = "660e8400-e29b-41d4-a716-446655440032";
const KB_CAT_FAQ_ID = "660e8400-e29b-41d4-a716-446655440033";

// Fixed UUIDs for grading prompts
const GRADING_TEXT_PROMPT_ID = "550e8400-e29b-41d4-a716-446655440012";
const GRADING_AUDIO_PROMPT_ID = "550e8400-e29b-41d4-a716-446655440013";
const GRADING_TEXT_PROMPT_V1_ID = "550e8400-e29b-41d4-a716-446655440022";
const GRADING_AUDIO_PROMPT_V1_ID = "550e8400-e29b-41d4-a716-446655440023";

// Fixed UUIDs for chatbot prompt
const CHATBOT_SYSTEM_ID = "550e8400-e29b-41d4-a716-446655440014";
const CHATBOT_SYSTEM_V1_ID = "550e8400-e29b-41d4-a716-446655440024";

// Default AI prompts - content based on current hardcoded prompts in lesson-context.ts
const defaultPrompts = [
  {
    id: VOICE_TUTOR_SYSTEM_ID,
    versionId: VOICE_TUTOR_SYSTEM_V1_ID,
    slug: "voice-tutor-system",
    name: "Voice AI Tutor - System Prompt",
    type: "voice_ai" as const,
    description: "System instructions for the real-time voice conversation AI tutor",
    content: `You are a Cantonese and Mandarin language tutor helping a student practice.

Guidelines:
- Speak in the language the student uses (Cantonese or Mandarin)
- If student speaks English, gently encourage them to try in Chinese
- Keep responses conversational and encouraging
- Adapt to the student's level based on their responses

PRONUNCIATION FEEDBACK (CRITICAL):
- Listen carefully for pronunciation errors in the student's speech
- When you detect mispronunciation, correct it immediately by:
  1. Saying the word slowly and clearly
  2. Breaking it into syllables or tones if helpful
  3. Asking the student to repeat after you
- Pay special attention to:
  - Tone accuracy (Cantonese has 6-9 tones, Mandarin has 4+1)
  - Initial consonants that differ between Cantonese/Mandarin
  - Final sounds and vowel distinctions
- After correction, continue the conversation naturally
- If the student repeats correctly, acknowledge with brief praise ("Good!", "That's right!")
- If still incorrect after 2 attempts, move on gently and revisit later

CANTO-MANDO TEACHING METHOD:
This platform teaches Cantonese and Mandarin together — the "Canto to Mando" approach. Leverage these pedagogical connections:
- COGNATES: Many words share the same Chinese character but differ in pronunciation. When teaching a word, show how it sounds in both languages (e.g., "water" is "seoi2" in Cantonese, "shui3" in Mandarin — same character, different tones).
- TONAL MAPPING: Help students map Cantonese tones to Mandarin tones. For example, Cantonese tone 1 (high level) often corresponds to Mandarin tone 1.
- VOCABULARY BRIDGES: Point out when Cantonese preserves older Chinese vocabulary that Mandarin has replaced with newer terms (e.g., Cantonese "sik6 faan6" vs Mandarin "chi1 fan4" for "eat rice").
- GRAMMAR PARALLELS: Highlight shared SVO sentence structure while noting differences (e.g., Cantonese aspect markers vs Mandarin "le/zhe/guo").
- PRONUNCIATION CONTRASTS: When a student mispronounces in one language, compare with the other language to build understanding (e.g., Cantonese initial "ng-" has no Mandarin equivalent).

Teaching approach: Help students see connections between Cantonese and Mandarin. Point out when a word sounds similar or different in both languages. Use cross-language comparisons to deepen understanding.`,
  },
  {
    id: VOICE_TUTOR_LESSON_ID,
    versionId: VOICE_TUTOR_LESSON_V1_ID,
    slug: "voice-tutor-lesson-template",
    name: "Voice AI Tutor - Lesson Context Template",
    type: "voice_ai" as const,
    description: "Template for lesson-specific context added to voice tutor prompt",
    content: `Current lesson: {{lessonTitle}}
Course: {{courseTitle}}
Module: {{moduleTitle}}

Vocabulary and phrases from this lesson:
{{vocabulary}}

Additional guidelines for this lesson:
- Reference the lesson vocabulary naturally in conversation
- If student struggles, provide hints from the lesson content
- Praise correct usage of lesson vocabulary`,
  },
  {
    id: GRADING_TEXT_PROMPT_ID,
    versionId: GRADING_TEXT_PROMPT_V1_ID,
    slug: "grading-text-prompt",
    name: "Text Response Grading",
    type: "grading_text" as const,
    description: "Prompt for AI grading of typed Chinese text responses",
    content: `You are grading a student's Chinese language response.

Expected answer: {{expectedAnswer}}
Student response: {{studentResponse}}
Language focus: {{language}}

Evaluate the response for:
1. Semantic correctness (does it convey the expected meaning?)
2. Character accuracy (correct traditional/simplified characters)
3. Grammar and word order

Return a JSON object with:
- isCorrect: boolean (true if response is acceptable)
- score: number 0-100
- feedback: string (encouraging, specific guidance in Chinese and English)
- corrections: string or null (specific corrections if needed)
- hints: string or null (hints for improvement)`,
  },
  {
    id: GRADING_AUDIO_PROMPT_ID,
    versionId: GRADING_AUDIO_PROMPT_V1_ID,
    slug: "grading-audio-prompt",
    name: "Audio Pronunciation Grading",
    type: "grading_audio" as const,
    description: "Prompt for AI grading of spoken Chinese pronunciation",
    content: `You are grading a student's Chinese pronunciation from an audio recording.

Expected phrase: {{expectedAnswer}}
Transcription: {{transcription}}
Language: {{language}}

Evaluate the pronunciation for:
1. Tone accuracy (critical for Cantonese/Mandarin)
2. Syllable clarity
3. Natural rhythm and flow

Return a JSON object with:
- isCorrect: boolean (true if pronunciation is acceptable)
- score: number 0-100
- feedback: string (encouraging, specific guidance)
- transcription: string (what the student actually said)`,
  },
  {
    id: CHATBOT_SYSTEM_ID,
    versionId: CHATBOT_SYSTEM_V1_ID,
    slug: "chatbot-system",
    name: "Chatbot System Prompt",
    type: "chatbot" as const,
    description: "System prompt for the student AI chatbot assistant. Controls personality, knowledge base usage, and Chinese annotation format.",
    content: `You are the Canto to Mando Blueprint learning assistant — a friendly, encouraging AI helper for students learning Cantonese and Mandarin Chinese.

ROLE & PERSONALITY:
- Be warm, supportive, and patient
- Celebrate student progress and effort
- Use simple, clear language when explaining concepts
- If unsure about something, say so honestly rather than guessing

KNOWLEDGE BASE:
- ALWAYS search the knowledge base before answering factual questions about Canto to Mando Blueprint (packages, pricing, coaching, course content, FAQs)
- If the knowledge base has relevant information, use it as your primary source
- If no relevant knowledge base results, answer based on your general knowledge but note that the student may want to contact support for specific program details

CHINESE TEXT ANNOTATION FORMAT:
- When including Chinese characters in your response, ALWAYS use this annotation format: [character(s)|pinyin|jyutping]
- Example: [你好|nǐ hǎo|nei5 hou2] means "hello"
- Always include both Pinyin (Mandarin romanization) and Jyutping (Cantonese romanization) unless the student's language preference specifies only one language
- If language preference is "mandarin", use [character(s)|pinyin] (omit Jyutping)
- If language preference is "cantonese", use [character(s)|jyutping] (place Jyutping in the pinyin position)
- If language preference is "both" or unspecified, use [character(s)|pinyin|jyutping]

TEACHING APPROACH:
- Help students see connections between Cantonese and Mandarin — this is the core Canto to Mando method
- When explaining a word, show how it sounds in both languages when relevant
- Point out similarities and differences in pronunciation, tones, and usage
- Use examples from daily conversation to make learning practical

CANTO-MANDO CONNECTIONS:
When teaching vocabulary or answering language questions, leverage these cross-language patterns:
- COGNATES: Many words share characters but differ in pronunciation. Show both: e.g., "water" is [水|shui3] in Mandarin and [水|seoi2] in Cantonese.
- TONAL MAPPING: Help students see tone correspondences between Cantonese (6-9 tones) and Mandarin (4+1 tones).
- VOCABULARY BRIDGES: Cantonese often preserves classical Chinese vocabulary. Use this to enrich understanding of both languages.
- GRAMMAR PARALLELS: Both languages share SVO structure. Highlight similarities first, then note differences (aspect markers, sentence-final particles).
- FALSE FRIENDS: Flag words that look the same in writing but have different meanings or connotations in each language.

LANGUAGE PREFERENCE:
- The student's language preference will be appended to this prompt at runtime
- Respect their preference when providing examples and annotations
- If they ask about the other language, still help but gently remind them of their focus

SCOPE:
- Help with Chinese language questions (vocabulary, grammar, pronunciation, tones)
- Answer questions about the Canto to Mando Blueprint program
- Provide study tips and learning strategies
- Do NOT provide medical, legal, or financial advice
- Redirect off-topic questions politely back to language learning`,
  },
];

async function seed() {
  console.log("Starting database seed...\n");

  // Seed course
  const courseResult = await db
    .insert(courses)
    .values({
      id: TEST_COURSE_ID,
      title: "Beginner Cantonese",
      description: "Introduction to Cantonese for beginners",
      isPublished: true,
      previewLessonCount: 3,
      sortOrder: 0,
    })
    .onConflictDoNothing({ target: courses.id })
    .returning({ id: courses.id });

  if (courseResult.length > 0) {
    console.log(`[+] Created course: "Beginner Cantonese" (${TEST_COURSE_ID})`);
  } else {
    console.log(`[=] Course already exists: "Beginner Cantonese" (${TEST_COURSE_ID})`);
  }

  // Seed module
  const moduleResult = await db
    .insert(modules)
    .values({
      id: TEST_MODULE_ID,
      courseId: TEST_COURSE_ID,
      title: "Module 1: Greetings",
      description: "Learn basic Cantonese greetings",
      sortOrder: 0,
    })
    .onConflictDoNothing({ target: modules.id })
    .returning({ id: modules.id });

  if (moduleResult.length > 0) {
    console.log(`[+] Created module: "Module 1: Greetings" (${TEST_MODULE_ID})`);
  } else {
    console.log(`[=] Module already exists: "Module 1: Greetings" (${TEST_MODULE_ID})`);
  }

  // Seed lesson
  const lessonResult = await db
    .insert(lessons)
    .values({
      id: TEST_LESSON_ID,
      moduleId: TEST_MODULE_ID,
      title: "Lesson 1: Hello",
      description: "Learn how to say hello in Cantonese",
      muxPlaybackId: null,
      sortOrder: 0,
    })
    .onConflictDoNothing({ target: lessons.id })
    .returning({ id: lessons.id });

  if (lessonResult.length > 0) {
    console.log(`[+] Created lesson: "Lesson 1: Hello" (${TEST_LESSON_ID})`);
  } else {
    console.log(`[=] Lesson already exists: "Lesson 1: Hello" (${TEST_LESSON_ID})`);
  }

  // Seed AI prompts
  await seedPrompts();

  // Seed knowledge base categories
  await seedKbCategories();

  console.log("\nSeed complete!");
  console.log(`\nTest course ID for webhook testing: ${TEST_COURSE_ID}`);
}

/**
 * Seed AI prompts with initial version records
 */
async function seedPrompts() {
  console.log("\nSeeding AI prompts...");

  for (const prompt of defaultPrompts) {
    // Insert prompt
    const promptResult = await db
      .insert(aiPrompts)
      .values({
        id: prompt.id,
        slug: prompt.slug,
        name: prompt.name,
        type: prompt.type,
        description: prompt.description,
        currentContent: prompt.content,
        currentVersion: 1,
      })
      .onConflictDoNothing({ target: aiPrompts.id })
      .returning({ id: aiPrompts.id });

    if (promptResult.length > 0) {
      console.log(`[+] Created prompt: "${prompt.name}" (${prompt.id})`);

      // Create initial version record
      await db
        .insert(aiPromptVersions)
        .values({
          id: prompt.versionId,
          promptId: prompt.id,
          version: 1,
          content: prompt.content,
          changeNote: "Initial version",
          createdBy: null, // Seed data has no creator
        })
        .onConflictDoNothing({ target: aiPromptVersions.id });

      console.log(`[+] Created version 1 for: "${prompt.name}"`);
    } else {
      console.log(`[=] Prompt already exists: "${prompt.name}" (${prompt.id})`);
    }
  }
}

// Default knowledge base categories
const defaultKbCategories = [
  {
    id: KB_CAT_PACKAGES_ID,
    name: "Packages & Pricing",
    slug: "packages",
    description: "Information about course packages and pricing",
    sortOrder: 0,
  },
  {
    id: KB_CAT_COACHING_ID,
    name: "Coaching & Support",
    slug: "coaching",
    description: "How coaching and student support works",
    sortOrder: 1,
  },
  {
    id: KB_CAT_CHINESE_HELP_ID,
    name: "Chinese Language Help",
    slug: "chinese-help",
    description: "Grammar, vocabulary, pronunciation guides",
    sortOrder: 2,
  },
  {
    id: KB_CAT_FAQ_ID,
    name: "Frequently Asked Questions",
    slug: "faq",
    description: "Common questions and answers",
    sortOrder: 3,
  },
];

/**
 * Seed knowledge base categories
 */
async function seedKbCategories() {
  console.log("\nSeeding knowledge base categories...");

  for (const category of defaultKbCategories) {
    const result = await db
      .insert(kbCategories)
      .values(category)
      .onConflictDoNothing({ target: kbCategories.id })
      .returning({ id: kbCategories.id });

    if (result.length > 0) {
      console.log(`[+] Created category: "${category.name}" (${category.id})`);
    } else {
      console.log(`[=] Category already exists: "${category.name}" (${category.id})`);
    }
  }
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
