import { NextResponse } from "next/server";

/**
 * Parse date range from URL search params.
 * Accepts `from` and `to` as ISO date strings.
 */
export function parseDateRange(searchParams: URLSearchParams): {
  from: Date | null;
  to: Date | null;
} {
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  const from = fromStr ? new Date(fromStr) : null;
  const to = toStr ? new Date(toStr) : null;

  // Validate parsed dates
  return {
    from: from && !isNaN(from.getTime()) ? from : null,
    to: to && !isNaN(to.getTime()) ? to : null,
  };
}

/**
 * Format a single CSV row, escaping commas and quotes.
 */
export function formatCsvRow(values: (string | number | null)[]): string {
  return (
    values
      .map((v) => {
        if (v === null || v === undefined) return "";
        const str = String(v);
        // Escape if contains comma, quote, or newline
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",") + "\n"
  );
}

/**
 * Build a full CSV response with headers and rows.
 */
export function formatCsvResponse(
  headers: string[],
  rows: (string | number | null)[][]
): NextResponse {
  let csv = formatCsvRow(headers);
  for (const row of rows) {
    csv += formatCsvRow(row);
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="analytics.csv"',
    },
  });
}
