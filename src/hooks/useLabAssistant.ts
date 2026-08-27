'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { LabAssistantMessage } from '@/lib/lab-assistant/message';

/**
 * Chat state for the CMB Lab Assistant support widget.
 * Session-scoped: identity is resolved server-side from the Clerk session,
 * so the client sends only the messages.
 */
export function useLabAssistant() {
  return useChat<LabAssistantMessage>({
    transport: new DefaultChatTransport({
      api: '/api/lab-assistant',
    }),
  });
}
