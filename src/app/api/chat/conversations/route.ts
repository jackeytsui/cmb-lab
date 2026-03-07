import { getCurrentUser } from "@/lib/auth";
import { listUserConversations } from "@/lib/chat-persistence";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/chat/conversations
 * Lists the current user's chat conversations, optionally filtered by lessonId.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const lessonId = searchParams.get("lessonId") || undefined;

  const conversations = await listUserConversations(user.id, lessonId);
  return NextResponse.json(conversations);
}
