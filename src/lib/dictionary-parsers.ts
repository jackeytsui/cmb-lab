/**
 * Dictionary Parsers
 *
 * Pure parsing functions for CC-CEDICT, CC-Canto, and Make Me a Hanzi data formats.
 * No database or external library dependencies — just file reading and regex parsing.
 */

import { readFileSync } from "fs";

// ============================================================
// Types
// ============================================================

export interface ParsedCedictEntry {
  traditional: string;
  simplified: string;
  pinyin: string;
  definitions: string[];
}

export interface ParsedCantoEntry extends ParsedCedictEntry {
  jyutping: string | null;
}

export interface MakeHanziDict {
  character: string;
  definition: string | null;
  pinyin: string[];
  decomposition: string;
  radical: string;
  matches?: (number[] | null)[] | null;
  etymology?: {
    type?: string;
    hint?: string;
    phonetic?: string;
    semantic?: string;
  } | null;
}

export interface MakeHanziGraphics {
  character: string;
  strokes: string[];
  medians: number[][][];
}

// ============================================================
// Parsers
// ============================================================

/**
 * Replace u: with v for pinyin-pro compatibility.
 * CC-CEDICT uses "u:" to represent the u-umlaut (as in "nu:3" for female).
 * pinyin-pro expects "v" instead (e.g., "nv3").
 */
export function normalizeCedictPinyin(raw: string): string {
  return raw.replace(/u:/g, "v");
}

/**
 * Parse a single CC-CEDICT format line.
 *
 * Format: `Traditional Simplified [pinyin] /def1/def2/`
 * Lines starting with # are comments. Empty lines are skipped.
 *
 * Returns null for comment/empty lines or lines that don't match the format.
 */
export function parseCedictLine(line: string): ParsedCedictEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("%")) {
    return null;
  }

  const match = trimmed.match(
    /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/
  );
  if (!match) {
    return null;
  }

  const [, traditional, simplified, pinyin, defString] = match;
  const definitions = defString
    .split("/")
    .map((d) => d.trim())
    .filter(Boolean);

  return { traditional, simplified, pinyin, definitions };
}

/**
 * Parse a single CC-Canto format line.
 *
 * CC-Canto dictionary format: `Traditional Simplified [pinyin] {jyutping} /def1/def2/`
 * CC-Canto readings format:   `Traditional Simplified [pinyin] {jyutping}`
 *
 * The jyutping block and definitions are both optional to handle both file types.
 */
export function parseCantoLine(line: string): ParsedCantoEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("%")) {
    return null;
  }

  // Try full format with jyutping and definitions
  const fullMatch = trimmed.match(
    /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}\s+\/(.+)\/\s*$/
  );
  if (fullMatch) {
    const [, traditional, simplified, pinyin, jyutping, defString] = fullMatch;
    const definitions = defString
      .split("/")
      .map((d) => d.trim())
      .filter(Boolean);
    return { traditional, simplified, pinyin, jyutping, definitions };
  }

  // Try readings-only format (jyutping but no definitions)
  const readingsMatch = trimmed.match(
    /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}\s*$/
  );
  if (readingsMatch) {
    const [, traditional, simplified, pinyin, jyutping] = readingsMatch;
    return { traditional, simplified, pinyin, jyutping, definitions: [] };
  }

  return null;
}

/**
 * Parse the Make Me a Hanzi dictionary.txt file.
 *
 * Each line is a JSON object with character data (NDJSON format).
 * Uses optional chaining for etymology fields which may be missing.
 */
export function parseMakeHanziDictionary(filePath: string): MakeHanziDict[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const results: MakeHanziDict[] = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      results.push({
        character: obj.character,
        definition: obj.definition ?? null,
        pinyin: Array.isArray(obj.pinyin) ? obj.pinyin : [],
        decomposition: obj.decomposition ?? "",
        radical: obj.radical ?? "",
        matches: obj.matches ?? null,
        etymology: obj.etymology
          ? {
              type: obj.etymology?.type,
              hint: obj.etymology?.hint,
              phonetic: obj.etymology?.phonetic,
              semantic: obj.etymology?.semantic,
            }
          : null,
      });
    } catch {
      // Skip malformed lines
    }
  }

  return results;
}

/**
 * Parse the Make Me a Hanzi graphics.txt file.
 *
 * Each line is a JSON object with stroke SVG paths and median points (NDJSON format).
 */
export function parseMakeHanziGraphics(filePath: string): MakeHanziGraphics[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const results: MakeHanziGraphics[] = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      results.push({
        character: obj.character,
        strokes: Array.isArray(obj.strokes) ? obj.strokes : [],
        medians: Array.isArray(obj.medians) ? obj.medians : [],
      });
    } catch {
      // Skip malformed lines
    }
  }

  return results;
}
