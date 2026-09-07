import { convertScript } from "@/lib/chinese-convert";

type NotePane = "mandarin" | "cantonese" | string;

let convertersReady: Promise<void> | null = null;

function ensureConvertersReady(): Promise<void> {
  convertersReady ??= Promise.all([
    convertScript("", "simplified", "traditional"),
    convertScript("", "traditional", "simplified"),
  ]).then(() => undefined);
  return convertersReady;
}

/**
 * Return stable script variants for a starred Notepad or coaching note.
 *
 * Notes predate the flashcard table and store only one source string. A
 * Mandarin note may therefore contain either script, depending on what the
 * coach typed. Deriving both variants when the Flashcards API reads the note
 * makes its Simplified/Traditional toggle accurate for existing records too.
 * Cantonese notes intentionally keep their Hong Kong written form unchanged.
 */
export async function normalizeNoteFlashcardScripts(
  text: string,
  pane: NotePane,
): Promise<{ chinese: string; simplified?: string }> {
  if (pane !== "mandarin") {
    return { chinese: text };
  }

  // Prime each lazy OpenCC direction exactly once. Without this shared
  // promise, a large deck can initialize one converter per card when all
  // notes are normalized concurrently.
  await ensureConvertersReady();
  const [traditional, simplified] = await Promise.all([
    convertScript(text, "simplified", "traditional"),
    convertScript(text, "traditional", "simplified"),
  ]);

  return {
    chinese: traditional,
    simplified,
  };
}
