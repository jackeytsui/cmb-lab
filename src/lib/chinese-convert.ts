/**
 * Chinese script conversion wrapper around opencc-js.
 *
 * Uses dynamic import() to avoid bundling the ~2MB opencc-js dictionary
 * data eagerly. Converters are memoized at module level so the dictionary
 * loads only once per direction.
 *
 * Uses HK variant (not generic traditional) since this project focuses
 * on Cantonese/Hong Kong Chinese.
 */

/** Script mode for text display in the reader. */
export type ScriptMode = "original" | "simplified" | "traditional";

/** Memoized converter: Traditional (HK) → Simplified (CN) */
let toSimplifiedFn: ((text: string) => string) | null = null;

/** Memoized converter: Simplified (CN) → Traditional (HK) */
let toTraditionalFn: ((text: string) => string) | null = null;

/**
 * Convert Chinese text between simplified and traditional scripts.
 *
 * - If `from === to` or `to === 'original'`, returns text unchanged.
 * - For `to === 'simplified'`: converts from HK traditional to CN simplified.
 * - For `to === 'traditional'`: converts from CN simplified to HK traditional.
 *
 * The opencc-js library is loaded lazily via dynamic import on first use.
 * Subsequent calls reuse the memoized converter function.
 *
 * @param text - The Chinese text to convert
 * @param from - The source script mode
 * @param to - The target script mode
 * @returns The converted text
 *
 * @example
 * ```ts
 * await convertScript('漢語', 'traditional', 'simplified') // => '汉语'
 * await convertScript('计算机', 'simplified', 'traditional') // => '計算機'
 * await convertScript('你好', 'original', 'simplified')     // => '你好' (no change needed)
 * ```
 */
export async function convertScript(
  text: string,
  from: ScriptMode,
  to: ScriptMode,
): Promise<string> {
  if (from === to || to === "original") {
    return text;
  }

  if (to === "simplified") {
    if (!toSimplifiedFn) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const OpenCC = (await import("opencc-js")) as any;
      toSimplifiedFn = OpenCC.Converter({ from: "hk", to: "cn" }) as (
        text: string,
      ) => string;
    }
    return toSimplifiedFn(text);
  }

  if (to === "traditional") {
    if (!toTraditionalFn) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const OpenCC = (await import("opencc-js")) as any;
      toTraditionalFn = OpenCC.Converter({ from: "cn", to: "hk" }) as (
        text: string,
      ) => string;
    }
    return toTraditionalFn(text);
  }

  return text;
}

/**
 * Synchronous simplified conversion — returns the simplified form if the
 * converter has already been loaded, otherwise returns the text unchanged.
 *
 * Used by WordSpan to always derive Mandarin pinyin from simplified characters
 * (source of truth) regardless of the display script mode.
 *
 * Safe to call at any time; if opencc-js hasn't been loaded yet the text
 * passes through unchanged (pinyin-pro will use its own best guess).
 */
export function toSimplifiedSync(text: string): string {
  return toSimplifiedFn ? toSimplifiedFn(text) : text;
}

/**
 * Pre-load the simplified converter so it's available synchronously.
 * Call once when the Reader mounts or when script mode changes.
 */
export async function ensureSimplifiedConverter(): Promise<void> {
  if (toSimplifiedFn) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const OpenCC = (await import("opencc-js")) as any;
  toSimplifiedFn = OpenCC.Converter({ from: "hk", to: "cn" }) as (
    text: string,
  ) => string;
}
