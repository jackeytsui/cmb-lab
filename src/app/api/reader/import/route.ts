import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { extractTextFromPdf } from "@/lib/chunking";
import { detect } from "jschardet";

/**
 * Map jschardet encoding names to TextDecoder-compatible labels.
 * jschardet returns names like "GB2312" but TextDecoder uses WHATWG labels.
 */
const ENCODING_MAP: Record<string, string> = {
  GB2312: "gbk",
  GBK: "gbk",
  GB18030: "gb18030",
  Big5: "big5",
  "UTF-8": "utf-8",
  ASCII: "utf-8",
  "windows-1252": "utf-8", // fallback for misdetection
  "EUC-TW": "utf-8", // fallback — rare encoding
  "HZ-GB-2312": "utf-8", // fallback — rare encoding
  "ISO-2022-CN": "utf-8", // fallback — rare encoding
};

/** CJK Unified Ideographs range check */
const CJK_REGEX = /[\u4e00-\u9fff]/;

/** Maximum text length before truncation (soft limit) */
const MAX_TEXT_LENGTH = 20_000;

/**
 * POST /api/reader/import
 *
 * Import a PDF or text file containing Chinese text.
 * Accepts multipart/form-data with a 'file' field.
 *
 * For PDF files: extracts text layer via pdf-parse.
 * For text files: detects encoding (UTF-8, GB2312, GBK, Big5) and decodes.
 * Validates that extracted text contains CJK characters.
 * Truncates text exceeding 20,000 characters with a flag.
 *
 * Returns: { text: string, encoding: string, truncated: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth: verify user is authenticated
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Include a 'file' field in the form data." },
        { status: 400 },
      );
    }

    // 3. Determine file type from name extension or explicit type field
    const fileType =
      (formData.get("type") as string | null) ??
      (file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "text");

    let text: string;
    let encoding = "utf-8";

    // 4. Extract text based on file type
    if (fileType === "pdf") {
      // PDF: use pdf-parse via extractTextFromPdf
      const buffer = Buffer.from(await file.arrayBuffer());
      text = await extractTextFromPdf(buffer);

      // Validate extraction — scanned PDFs have no text layer
      if (!text.trim() || !CJK_REGEX.test(text)) {
        return NextResponse.json(
          {
            error:
              "Could not extract Chinese text from this PDF. The PDF may contain scanned images instead of text.",
          },
          { status: 422 },
        );
      }
    } else {
      // Text file: detect encoding and decode
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      // First try UTF-8
      text = new TextDecoder("utf-8").decode(uint8);

      // If UTF-8 decode yields no CJK, try encoding detection
      if (!CJK_REGEX.test(text)) {
        const detection = detect(Buffer.from(arrayBuffer));

        if (detection.encoding && detection.confidence >= 0.5) {
          encoding =
            ENCODING_MAP[detection.encoding] ??
            detection.encoding.toLowerCase();
        }

        // Re-decode with detected encoding if different from utf-8
        if (encoding !== "utf-8") {
          try {
            text = new TextDecoder(encoding).decode(uint8);
          } catch {
            // TextDecoder may throw RangeError for unsupported encodings
            // Fall back to UTF-8 result
            encoding = "utf-8";
          }
        }
      }

      // Final CJK validation
      if (!CJK_REGEX.test(text)) {
        return NextResponse.json(
          {
            error: "No Chinese text detected in file.",
          },
          { status: 422 },
        );
      }
    }

    // 5. Enforce 20,000 character soft limit
    let truncated = false;
    if (text.length > MAX_TEXT_LENGTH) {
      text = text.slice(0, MAX_TEXT_LENGTH);
      truncated = true;
    }

    return NextResponse.json({ text, encoding, truncated });
  } catch (error) {
    console.error("Reader import error:", error);
    return NextResponse.json(
      { error: "Failed to process file. Please try again." },
      { status: 500 },
    );
  }
}
