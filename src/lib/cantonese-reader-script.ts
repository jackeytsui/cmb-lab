import { convertScript, type ScriptMode } from "@/lib/chinese-convert";

/**
 * Cantonese reader passages always use Hong Kong Traditional Chinese as their
 * canonical source. OpenCC safely leaves already-Traditional characters alone,
 * so this also normalises pasted or previously saved Simplified passages.
 */
export async function canonicalizeCantonesePassage(text: string): Promise<string> {
  return convertScript(text, "simplified", "traditional");
}

/**
 * Derive the visible script from the canonical Traditional source. "Original"
 * is treated as Traditional in the dedicated Cantonese reader.
 */
export async function getCantonesePassageDisplayText(
  traditionalSource: string,
  scriptMode: ScriptMode,
): Promise<string> {
  if (scriptMode !== "simplified") return traditionalSource;
  return convertScript(traditionalSource, "traditional", "simplified");
}

export function getCantoneseReaderScriptMode(scriptMode: ScriptMode): ScriptMode {
  return scriptMode === "simplified" ? "simplified" : "traditional";
}
