'use client';

/**
 * ChineseAnnotation - Renders Chinese characters with ruby annotations
 *
 * Parses annotated text in format [char|pinyin|jyutping] and renders
 * as HTML ruby elements with color-coded annotations.
 *
 * Colors follow existing SubtitleOverlay convention:
 * - Yellow for Pinyin
 * - Cyan for Jyutping
 */

interface ChineseAnnotationProps {
  /** Annotated segment content (without brackets), e.g. "你好|nǐ hǎo|nei5 hou2" */
  text: string;
}

/**
 * Renders a single annotated Chinese segment as ruby elements.
 * Expects text in format: "character(s)|pinyin" or "character(s)|pinyin|jyutping"
 */
export function ChineseAnnotation({ text }: ChineseAnnotationProps) {
  const parts = text.split('|');

  // Malformed (no pipe) - render as plain text
  if (parts.length < 2) {
    return <span>{text}</span>;
  }

  const character = parts[0];
  const pinyin = parts[1];
  const jyutping = parts[2]; // may be undefined

  return (
    <ruby className="inline-flex flex-col items-center">
      {character}
      <rp>(</rp>
      <rt className="text-xs text-yellow-400 font-normal">{pinyin}</rt>
      <rp>)</rp>
      {jyutping && (
        <>
          <rp>(</rp>
          <rt className="text-xs text-cyan-400 font-normal">{jyutping}</rt>
          <rp>)</rp>
        </>
      )}
    </ruby>
  );
}

/**
 * Segment produced by parseAnnotatedText
 */
export interface AnnotatedSegment {
  type: 'text' | 'annotation';
  content: string;
}

/**
 * Parses text containing [char|pinyin|jyutping] annotations into segments.
 *
 * Example:
 *   parseAnnotatedText('Hello [你好|nǐ hǎo|nei5 hou2] world')
 *   => [
 *     { type: 'text', content: 'Hello ' },
 *     { type: 'annotation', content: '你好|nǐ hǎo|nei5 hou2' },
 *     { type: 'text', content: ' world' },
 *   ]
 */
export function parseAnnotatedText(text: string): AnnotatedSegment[] {
  const segments: AnnotatedSegment[] = [];
  // Match [content] where content contains at least one pipe (annotation marker)
  const regex = /\[([^\]]*\|[^\]]*)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add preceding plain text if any
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    // Add annotation segment (content inside brackets)
    segments.push({
      type: 'annotation',
      content: match[1],
    });

    lastIndex = match.index + match[0].length;
  }

  // Add trailing plain text if any
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  // If no annotations found, return full text as single segment
  if (segments.length === 0) {
    segments.push({ type: 'text', content: text });
  }

  return segments;
}
