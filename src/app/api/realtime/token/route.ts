import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * OpenAI Realtime API session response shape
 */
interface OpenAIRealtimeSessionResponse {
  id: string;
  object: "realtime.session";
  model: string;
  client_secret: {
    value: string;
    expires_at: number;
  };
}

/**
 * POST /api/realtime/token
 * Generates an ephemeral OpenAI Realtime API token for WebRTC connection.
 * Token is short-lived (60 seconds) - client must use immediately.
 */
export async function POST() {
  // 1. Verify user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Check for OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY not configured");
    return NextResponse.json(
      { error: "Voice conversation not configured" },
      { status: 500 }
    );
  }

  try {
    // 3. Request ephemeral token from OpenAI
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "alloy",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenAI Realtime API error: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: "Failed to create voice session" },
        { status: 500 }
      );
    }

    // 4. Parse response and extract client secret
    const data: OpenAIRealtimeSessionResponse = await response.json();

    // 5. Return token to client (API key never exposed)
    return NextResponse.json({
      token: data.client_secret.value,
      expiresAt: data.client_secret.expires_at,
    });
  } catch (error) {
    console.error("Realtime token generation error:", error);
    return NextResponse.json(
      { error: "Failed to create voice session" },
      { status: 500 }
    );
  }
}
