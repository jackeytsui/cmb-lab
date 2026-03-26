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
  explanation?: string | null;
};

type ExportSession = {
  title: string;
  studentEmail?: string | null;
  fathomLink?: string | null;
  recordingUrl?: string | null;
  notes: ExportNote[];
};

type ExportOptions = {
  sessionTitle?: string;
  fileName?: string;
};

/**
 * Export coaching notes to an Excel file with two tabs: Mandarin and Cantonese.
 *
 * Single session export:
 *   Traditional Chinese | Simplified Chinese | Pinyin/Jyutping | English Meaning
 *
 * Multi-session export (adds context columns):
 *   Session | Student Email | Traditional Chinese | Simplified Chinese | Pinyin/Jyutping | English Meaning
 */
export async function exportCoachingNotes(
  sessions: ExportSession[],
  options?: ExportOptions,
) {
  const isMultiSession = sessions.length > 1;

  // Collect all notes separated by pane
  const mandarinNotes: Array<ExportNote & { sessionTitle: string; studentEmail: string; fathomLink: string }> = [];
  const cantoneseNotes: Array<ExportNote & { sessionTitle: string; studentEmail: string; fathomLink: string }> = [];

  for (const session of sessions) {
    for (const note of session.notes) {
      const entry = {
        ...note,
        sessionTitle: session.title,
        studentEmail: session.studentEmail ?? "",
        fathomLink: session.fathomLink ?? "",
      };
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

  // Build column definitions based on single vs multi-session
  const contextColumns: ExcelJS.Column[] = isMultiSession
    ? [
        { header: "Session", key: "session", width: 20 } as Partial<ExcelJS.Column> as ExcelJS.Column,
        { header: "Student Email", key: "studentEmail", width: 28 } as Partial<ExcelJS.Column> as ExcelJS.Column,
      ]
    : [];

  // Collect unique recording links
  const recordingLinks = [...new Set(
    sessions.map((s) => s.recordingUrl ?? s.fathomLink).filter(Boolean)
  )];
  const recordingLine = recordingLinks.length > 0
    ? `Recording: ${recordingLinks.join(", ")}`
    : null;

  // Column definitions (without ExcelJS auto-headers — we build rows manually)
  const contextHeaders = isMultiSession ? ["Session", "Student Email"] : [];
  const mandarinHeaders = [...contextHeaders, "Traditional Chinese", "Simplified Chinese", "Pinyin", "English Meaning", "Notes"];
  const cantoneseHeaders = [...contextHeaders, "Traditional Chinese", "Simplified Chinese", "Jyutping", "English Meaning", "Notes"];
  const colWidths = isMultiSession ? [20, 28, 30, 30, 40, 40, 40] : [30, 30, 40, 40, 40];

  function setupSheet(sheet: ExcelJS.Worksheet, headers: string[]) {
    // Row 1: Recording link (if any)
    if (recordingLine) {
      const linkRow = sheet.addRow([recordingLine]);
      linkRow.font = { italic: true, color: { argb: "FF666666" } };
    }
    // Header row
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
    // Set column widths
    colWidths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });
  }

  // Mandarin tab
  const mandarinSheet = wb.addWorksheet("Mandarin");
  setupSheet(mandarinSheet, mandarinHeaders);

  for (const note of mandarinNotes) {
    const traditional = note.textOverride || note.text;
    const simplified = simplifiedMap.get(traditional) ?? traditional;
    const romanization =
      note.romanizationOverride || pinyin(simplified, { toneType: "symbol" });
    const translation = note.translationOverride || "";
    const explanation = note.explanation || "";
    const cells = isMultiSession
      ? [note.sessionTitle, note.studentEmail, traditional, simplified, romanization, translation, explanation]
      : [traditional, simplified, romanization, translation, explanation];
    mandarinSheet.addRow(cells);
  }

  // Cantonese tab
  const cantoneseSheet = wb.addWorksheet("Cantonese");
  setupSheet(cantoneseSheet, cantoneseHeaders);

  for (const note of cantoneseNotes) {
    const traditional = note.textOverride || note.text;
    const simplified = simplifiedMap.get(traditional) ?? traditional;
    const romanization =
      note.romanizationOverride || toJyutpingString(traditional);
    const translation = note.translationOverride || "";
    const explanation = note.explanation || "";
    const cells = isMultiSession
      ? [note.sessionTitle, note.studentEmail, traditional, simplified, romanization, translation, explanation]
      : [traditional, simplified, romanization, translation, explanation];
    cantoneseSheet.addRow(cells);
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
