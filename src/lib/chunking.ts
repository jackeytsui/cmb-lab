/**
 * Maximum chunk size in characters.
 * ~500 chars ≈ ~125 tokens, good for RAG retrieval.
 */
const MAX_CHUNK_SIZE = 500;

/**
 * Overlap between chunks in characters.
 * Ensures context is preserved across chunk boundaries.
 */
const CHUNK_OVERLAP = 50;

/**
 * Extract plain text from a PDF buffer.
 * Returns the full text content of the PDF.
 * Uses dynamic import to avoid type issues with pdf-parse at build time.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

/**
 * Split text into overlapping chunks for search/RAG.
 *
 * Strategy:
 * 1. Split by double newline (paragraphs) first
 * 2. If a paragraph exceeds MAX_CHUNK_SIZE, split by sentences
 * 3. Merge small paragraphs together up to MAX_CHUNK_SIZE
 * 4. Add overlap between chunks for context continuity
 *
 * @param text - The source text to chunk
 * @returns Array of chunk strings
 */
export function chunkText(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Split by double newline to get paragraphs
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed max size
    if (currentChunk.length + paragraph.length + 1 > MAX_CHUNK_SIZE) {
      // Save current chunk if it has content
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        // Keep overlap from end of current chunk
        const overlapStart = Math.max(0, currentChunk.length - CHUNK_OVERLAP);
        currentChunk = currentChunk.slice(overlapStart).trim();
      }

      // If single paragraph exceeds max, split by sentences
      if (paragraph.length > MAX_CHUNK_SIZE) {
        const sentences = paragraph.match(/[^.!?]+[.!?]+\s*/g) || [paragraph];
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > MAX_CHUNK_SIZE) {
            if (currentChunk.length > 0) {
              chunks.push(currentChunk.trim());
              const overlapStart = Math.max(
                0,
                currentChunk.length - CHUNK_OVERLAP
              );
              currentChunk = currentChunk.slice(overlapStart).trim();
            }
          }
          currentChunk += (currentChunk ? " " : "") + sentence.trim();
        }
      } else {
        currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
