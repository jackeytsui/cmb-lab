import * as XLSX from "xlsx";
import { convertScript } from "@/lib/chinese-convert";
import { pinyin } from "pinyin-pro";
import ToJyutping from "to-jyutping";

type ExportNote = {
  text: string;
  pane: "mandarin" | "cantonese";
  textOverride?: string | null;
  romanizationOverride?: string | null;
  translationOverride?: string | null;
};

type ExportSession = {
  title: string;
  notes: ExportNote[];
};

type ExportOptions = {
  sessionTitle?: string;
  fileName?: string;
};

/**
 * Export coaching notes to an Excel file with two tabs: Mandarin and Cantonese.
 *
 * Tab 1 "Mandarin": Traditional Chinese | Simplified Chinese | Pinyin | English
 * Tab 2 "Cantonese": Traditional Chinese | Simplified Chinese | Jyutping | English
 */
export async function exportCoachingNotes(
  sessions: ExportSession[],
  options?: ExportOptions,
) {
  // Collect all notes separated by pane
  const mandarinNotes: Array<ExportNote & { sessionTitle: string }> = [];
  const cantoneseNotes: Array<ExportNote & { sessionTitle: string }> = [];

  for (const session of sessions) {
    for (const note of session.notes) {
      const entry = { ...note, sessionTitle: session.title };
      if (note.pane === "mandarin") {
        mandarinNotes.push(entry);
      } else if (note.pane === "cantonese") {
        cantoneseNotes.push(entry);
      }
    }
  }

  // Batch convert all texts to simplified Chinese
  const allNotes = [...mandarinNotes, ...cantoneseNotes];
  const traditionalTexts = allNotes.map((n) => n.textOverride || n.text);

  // Convert each text to simplified
  const simplifiedTexts = await Promise.all(
    traditionalTexts.map((t) => convertScript(t, "traditional", "simplified")),
  );

  // Build simplified lookup
  const simplifiedMap = new Map<string, string>();
  traditionalTexts.forEach((trad, i) => {
    simplifiedMap.set(trad, simplifiedTexts[i]);
  });

  // Build Mandarin tab data
  const mandarinRows: string[][] = [
    ["Traditional Chinese", "Simplified Chinese", "Pinyin", "English Meaning"],
  ];
  for (const note of mandarinNotes) {
    const traditional = note.textOverride || note.text;
    const simplified = simplifiedMap.get(traditional) ?? traditional;
    const romanization =
      note.romanizationOverride || pinyin(traditional, { toneType: "symbol" });
    const translation = note.translationOverride || "";
    mandarinRows.push([traditional, simplified, romanization, translation]);
  }

  // Build Cantonese tab data
  const cantoneseRows: string[][] = [
    [
      "Traditional Chinese",
      "Simplified Chinese",
      "Jyutping",
      "English Meaning",
    ],
  ];
  for (const note of cantoneseNotes) {
    const traditional = note.textOverride || note.text;
    const simplified = simplifiedMap.get(traditional) ?? traditional;
    const romanization =
      note.romanizationOverride || toJyutpingString(traditional);
    const translation = note.translationOverride || "";
    cantoneseRows.push([traditional, simplified, romanization, translation]);
  }

  // Create workbook
  const wb = XLSX.utils.book_new();

  const mandarinSheet = XLSX.utils.aoa_to_sheet(mandarinRows);
  XLSX.utils.book_append_sheet(wb, mandarinSheet, "Mandarin");

  const cantoneseSheet = XLSX.utils.aoa_to_sheet(cantoneseRows);
  XLSX.utils.book_append_sheet(wb, cantoneseSheet, "Cantonese");

  // Set column widths for readability
  const colWidths = [
    { wch: 30 },
    { wch: 30 },
    { wch: 40 },
    { wch: 40 },
  ];
  mandarinSheet["!cols"] = colWidths;
  cantoneseSheet["!cols"] = colWidths;

  // Generate filename
  const fileName =
    options?.fileName ??
    `coaching-notes${options?.sessionTitle ? `-${options.sessionTitle}` : ""}.xlsx`;

  // Download
  XLSX.writeFile(wb, fileName);
}

/**
 * Convert traditional Chinese text to Jyutping using ToJyutping.
 * Returns the romanized string or the original text if conversion fails.
 */
function toJyutpingString(text: string): string {
  try {
    const result = ToJyutping.getJyutpingList(text);
    if (!result) return text;
    return result
      .map(([char, jyutping]: [string, string | null]) => jyutping ?? char)
      .join(" ");
  } catch {
    return text;
  }
}
