import ExcelJS from "exceljs";
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

  const simplifiedTexts = await Promise.all(
    traditionalTexts.map((t) => convertScript(t, "traditional", "simplified")),
  );

  const simplifiedMap = new Map<string, string>();
  traditionalTexts.forEach((trad, i) => {
    simplifiedMap.set(trad, simplifiedTexts[i]);
  });

  // Create workbook
  const wb = new ExcelJS.Workbook();

  // Mandarin tab
  const mandarinSheet = wb.addWorksheet("Mandarin");
  mandarinSheet.columns = [
    { header: "Traditional Chinese", key: "traditional", width: 30 },
    { header: "Simplified Chinese", key: "simplified", width: 30 },
    { header: "Pinyin", key: "romanization", width: 40 },
    { header: "English Meaning", key: "translation", width: 40 },
  ];
  // Bold header row
  mandarinSheet.getRow(1).font = { bold: true };

  for (const note of mandarinNotes) {
    const traditional = note.textOverride || note.text;
    const simplified = simplifiedMap.get(traditional) ?? traditional;
    const romanization =
      note.romanizationOverride || pinyin(traditional, { toneType: "symbol" });
    const translation = note.translationOverride || "";
    mandarinSheet.addRow({ traditional, simplified, romanization, translation });
  }

  // Cantonese tab
  const cantoneseSheet = wb.addWorksheet("Cantonese");
  cantoneseSheet.columns = [
    { header: "Traditional Chinese", key: "traditional", width: 30 },
    { header: "Simplified Chinese", key: "simplified", width: 30 },
    { header: "Jyutping", key: "romanization", width: 40 },
    { header: "English Meaning", key: "translation", width: 40 },
  ];
  cantoneseSheet.getRow(1).font = { bold: true };

  for (const note of cantoneseNotes) {
    const traditional = note.textOverride || note.text;
    const simplified = simplifiedMap.get(traditional) ?? traditional;
    const romanization =
      note.romanizationOverride || toJyutpingString(traditional);
    const translation = note.translationOverride || "";
    cantoneseSheet.addRow({ traditional, simplified, romanization, translation });
  }

  // Generate filename
  const fileName =
    options?.fileName ??
    `coaching-notes${options?.sessionTitle ? `-${options.sessionTitle}` : ""}.xlsx`;

  // Download via blob
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Convert traditional Chinese text to Jyutping using ToJyutping.
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
