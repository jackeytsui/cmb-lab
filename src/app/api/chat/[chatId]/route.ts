import { getCurrentUser } from "@/lib/auth";
import { loadChat } from "@/lib/chat-persistence";
import { NextResponse } from "next/server";

/**
 * GET /api/chat/[chatId]
 * Loads a specific conversation and its messages.
 * Verifies the conversation belongs to the current user.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatId } = await params;
  const { conversation, messages } = await loadChat(chatId);

  if (!conversation || conversation.userId !== user.id) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ conversation, messages });
}
