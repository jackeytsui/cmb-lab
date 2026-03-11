import { db } from "@/db";
import { lessons, modules, courses, interactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPrompt } from "@/lib/prompts";
import type { LanguagePreference } from "@/lib/interactions";

/**
 * Default system prompt for voice AI tutor (fallback if DB unavailable)
 */
const DEFAULT_VOICE_TUTOR_SYSTEM = `You are a Cantonese and Mandarin language tutor helping a student practice.

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

Teaching approach: Help students see connections between Cantonese and Mandarin. Point out when a word sounds similar or different in both languages. Use cross-language comparisons to deepen understanding.`;

/**
 * Default lesson context template (fallback if DB unavailable)
 * Uses {{variableName}} placeholders for lesson-specific values
 */
const DEFAULT_LESSON_TEMPLATE = `Current lesson: {{lessonTitle}}
Course: {{courseTitle}}
Module: {{moduleTitle}}

Vocabulary and phrases from this lesson:
{{vocabulary}}

PRACTICE TOPICS based on this lesson:
Based on the vocabulary above, suggest and practice these types of exercises:
1. Pronunciation drills: Ask the student to repeat key vocabulary items, focusing on tones
2. Sentence building: Help the student form sentences using the lesson vocabulary
3. Conversational practice: Create mini-dialogues that naturally use the lesson phrases
4. Comparison exercises: If vocabulary has Cantonese/Mandarin pairs, practice pronunciation differences

Additional guidelines for this lesson:
- Reference the lesson vocabulary naturally in conversation
- If student struggles, provide hints from the lesson content
- Praise correct usage of lesson vocabulary
- Proactively suggest a practice topic if the student seems unsure what to practice
- When the student completes a topic, suggest the next one from the list above`;

/**
 * Build AI instructions from lesson data with pronunciation feedback guidelines.
 * These instructions are sent to OpenAI Realtime API to customize the voice tutor.
 *
 * Loads prompts from database with fallback to hardcoded defaults.
 *
 * @param lessonId - The lesson ID to build context for
 * @param languagePreference - Student's language preference (cantonese, mandarin, or both)
 * @returns Formatted instruction string for the AI tutor
 */
export async function buildLessonInstructions(
  lessonId: string,
  languagePreference: LanguagePreference = "both"
): Promise<string> {
  try {
    // Load system prompt from database (with fallback)
    const systemPrompt = await getPrompt("voice-tutor-system", DEFAULT_VOICE_TUTOR_SYSTEM);

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

    // Handle case where lesson not found - return just system prompt
    if (lessonData.length === 0) {
      return systemPrompt;
    }

    const lesson = lessonData[0];

    // 2. Query interactions for this lesson
    const interactionData = await db
      .select({
        prompt: interactions.prompt,
        expectedAnswer: interactions.expectedAnswer,
      })
      .from(interactions)
      .where(eq(interactions.lessonId, lessonId));

    // Build vocabulary section from interactions
    const vocabularySection =
      interactionData.length > 0
        ? interactionData
            .map((i) => {
              if (i.expectedAnswer) {
                return `- Prompt: "${i.prompt}" / Expected: "${i.expectedAnswer}"`;
              }
              return `- Prompt: "${i.prompt}"`;
            })
            .join("\n")
        : "No specific vocabulary for this lesson.";

    // 3. Load lesson template from database (with fallback)
    const lessonTemplate = await getPrompt("voice-tutor-lesson-template", DEFAULT_LESSON_TEMPLATE);

    // Replace template placeholders with actual values
    const lessonContext = lessonTemplate
      .replace(/\{\{lessonTitle\}\}/g, lesson.lessonTitle)
      .replace(/\{\{courseTitle\}\}/g, lesson.courseTitle)
      .replace(/\{\{moduleTitle\}\}/g, lesson.moduleTitle)
      .replace(/\{\{vocabulary\}\}/g, vocabularySection);

    // 4. Build language directive based on student's preference
    const languageDirective = buildLanguageDirective(languagePreference);

    // 5. Combine system prompt with lesson context and language directive
    return `${systemPrompt}

${lessonContext}

${languageDirective}`;
  } catch (error) {
    console.error("Error building lesson instructions:", error);
    // Fallback to default system prompt on error
    return DEFAULT_VOICE_TUTOR_SYSTEM;
  }
}

/**
 * Build a LANGUAGE DIRECTIVE section based on student's language preference.
 *
 * @param preference - The student's language preference
 * @returns Formatted language directive string
 */
function buildLanguageDirective(preference: LanguagePreference): string {
  switch (preference) {
    case "cantonese":
      return `LANGUAGE DIRECTIVE:
- Student's language preference: Cantonese
- Speak primarily in Cantonese (Traditional Chinese characters, Jyutping romanization)
- Use Cantonese pronunciation, vocabulary, and grammar patterns
- When introducing new vocabulary, give the Cantonese pronunciation first
- You may briefly mention the Mandarin equivalent for cross-reference, but keep focus on Cantonese
- Encourage the student to respond in Cantonese`;

    case "mandarin":
      return `LANGUAGE DIRECTIVE:
- Student's language preference: Mandarin
- Speak primarily in Mandarin (Simplified or Traditional Chinese, Pinyin romanization)
- Use Mandarin pronunciation, vocabulary, and grammar patterns
- When introducing new vocabulary, give the Mandarin pronunciation first
- You may briefly mention the Cantonese equivalent for cross-reference, but keep focus on Mandarin
- Encourage the student to respond in Mandarin`;

    case "both":
    default:
      return `LANGUAGE DIRECTIVE:
- Student's language preference: Both Cantonese and Mandarin
- Actively compare both languages when introducing vocabulary and phrases
- Show how words sound in Cantonese (Jyutping) and Mandarin (Pinyin) side by side
- Point out cognates, false friends, and tonal differences between the two languages
- Help the student build bridges between Cantonese and Mandarin knowledge
- Encourage the student to try saying words in both languages`;
  }
}
