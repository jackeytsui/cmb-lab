'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useLanguagePreference } from './useLanguagePreference';

interface UseChatbotOptions {
  chatId?: string;
  lessonId?: string | null;
  initialMessages?: Array<{ id: string; role: string; parts: unknown[] }>;
}

/**
 * Wrapper around AI SDK useChat that automatically injects
 * language preference, chatId, and lessonId into each request to /api/chat.
 *
 * Supports initialMessages for restoring persisted conversations
 * and chatId for scoping the chat instance.
 *
 * @returns AI SDK useChat helpers with streaming support
 */
export function useChatbot(options: UseChatbotOptions = {}) {
  const { preference } = useLanguagePreference();
  const { chatId, lessonId, initialMessages } = options;

  const chatHelpers = useChat({
    id: chatId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: initialMessages as any, // AI SDK v6 uses `messages` to seed initial conversation
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { languagePreference: preference, chatId, lessonId },
    }),
  });

  return chatHelpers;
}
