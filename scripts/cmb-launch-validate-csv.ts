import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { reconcileStudents, type SourceStudent } from "../src/lib/cmb-launch/reconcile";

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) throw new Error("Usage: npm run launch:validate-csv -- /private/path/students.csv");
  const resolved = path.resolve(csvPath);
  if (!fs.existsSync(resolved)) throw new Error(`CSV not found: ${resolved}`);

  const workbook = new ExcelJS.Workbook();
  const sheet = await workbook.csv.readFile(resolved);
  const headerRow = sheet.getRow(1);
  const headers = Array.from({ length: headerRow.cellCount }, (_, position) =>
    String(headerRow.getCell(position + 1).value ?? "").trim(),
  );
  const index = new Map(headers.map((header, position) => [header.toLowerCase(), position + 1]));
  const cell = (row: ExcelJS.Row, name: string) => {
    const column = index.get(name.toLowerCase());
    if (!column) return "";
    const value = row.getCell(column).value;
    return value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value ?? "").trim();
  };
  const dateCell = (row: ExcelJS.Row, name: string) => {
    const raw = cell(row, name);
    if (!raw || /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const match = raw.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/);
    if (!match) return raw;
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
      .indexOf(match[1].toLowerCase()) + 1;
    return month > 0
      ? `${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`
      : raw;
  };

  const students: SourceStudent[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    students.push({
      rowNumber,
      ghlContactId: cell(row, "Contact Id"), email: cell(row, "Email"),
      product: cell(row, "Product line?"), courseEligibility: cell(row, "Course Eligibility"),
      oneOnOneEligibility: cell(row, "1:1 Eligibility"), productStartDate: dateCell(row, "Product Start Date"),
      productEndDate: dateCell(row, "Product END date"),
    });
  });

  const result = reconcileStudents({ students, existingUsers: [], asOfDate: new Date().toISOString().slice(0, 10) });
  // Aggregate-only stdout: row-level data must be written only by a future command
  // that has an explicit private output directory.
  console.log(JSON.stringify({ source: path.basename(resolved), rows: students.length, counts: result.counts, blockingErrorCount: result.blockingErrors.length }, null, 2));
  if (result.blockingErrors.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "CSV validation failed");
  process.exitCode = 1;
});
