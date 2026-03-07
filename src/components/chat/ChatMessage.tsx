'use client';

import { ChatBubble } from './ChatBubble';
import { ChatExercise } from './ChatExercise';
import { ChineseAnnotation, parseAnnotatedText } from './ChineseAnnotation';
import { PhoneticText } from '@/components/phonetic/PhoneticText';

interface ChatMessageProps {
  message: {
    id: string;
    role: string;
    createdAt?: Date | string;
    parts: Array<{
      type: string;
      text?: string;
      toolInvocation?: {
        state: string;
        toolName?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result?: any;
      };
    }>;
  };
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const hasAnyContent = message.parts.some(
    (p) => (p.type === 'text' && p.text) || p.type === 'tool-invocation'
  );

  return (
    <ChatBubble
      role={message.role as 'user' | 'assistant'}
      timestamp={message.createdAt ? new Date(message.createdAt) : undefined}
    >
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          return (
            <p key={i} className="whitespace-pre-wrap text-sm">
              {isUser
                ? renderUserText(part.text ?? '')
                : renderAnnotatedText(part.text ?? '')}
            </p>
          );
        }

        if (part.type === 'tool-invocation') {
          // Exercise tool
          if (part.toolInvocation?.toolName === 'generateExercise') {
            if (part.toolInvocation.state === 'result') {
              const exerciseData = part.toolInvocation.result?.exercise;
              if (exerciseData) {
                return <ChatExercise key={i} definition={exerciseData} />;
              }
            }
            return (
              <p key={i} className="text-xs text-zinc-400 animate-pulse">
                Generating exercise...
              </p>
            );
          }

          // Knowledge base tool (existing behavior)
          if (part.toolInvocation?.state !== 'result') {
            return (
              <p key={i} className="text-xs italic text-zinc-400">
                Searching knowledge base...
              </p>
            );
          }
          // Don't render KB results directly -- they're consumed by the AI
          return null;
        }

        return null;
      })}

      {/* Streaming indicator when no content yet */}
      {!hasAnyContent && isStreaming && (
        <p className="text-sm animate-pulse text-zinc-400">...</p>
      )}
    </ChatBubble>
  );
}

// ============================================================
// Text Rendering Helpers
// ============================================================

/** Non-global regex for testing if a string contains Chinese characters */
const CHINESE_CHAR_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/;

/**
 * Renders user-typed text with PhoneticText applied to Chinese character segments.
 * English text renders in default font; Chinese text gets phonetic annotations.
 */
function renderUserText(text: string) {
  const splitRegex = /([\u4e00-\u9fff\u3400-\u4dbf]+)/g;
  const segments = text.split(splitRegex);

  return segments.map((segment, i) => {
    if (CHINESE_CHAR_REGEX.test(segment)) {
      return <PhoneticText key={i}>{segment}</PhoneticText>;
    }
    return <span key={i}>{segment}</span>;
  });
}

/**
 * Renders assistant text with Chinese annotations inline.
 * Plain text segments render as PhoneticText spans, annotations render as ruby elements.
 */
function renderAnnotatedText(text: string) {
  const segments = parseAnnotatedText(text);

  return segments.map((segment, i) => {
    if (segment.type === 'annotation') {
      return <ChineseAnnotation key={i} text={segment.content} />;
    }
    return <PhoneticText key={i}>{segment.content}</PhoneticText>;
  });
}
