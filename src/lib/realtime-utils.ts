/**
 * OpenAI Realtime API WebRTC utilities
 * Low-level functions for establishing and managing WebRTC connections
 */

const OPENAI_REALTIME_URL = "https://api.openai.com/v1/realtime";
const REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";

/**
 * Result from creating a realtime session
 */
export interface RealtimeSession {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  localStream: MediaStream;
}

/**
 * Creates a WebRTC session with OpenAI Realtime API
 *
 * Flow:
 * 1. Get user's microphone audio
 * 2. Create RTCPeerConnection with audio track
 * 3. Create data channel for events
 * 4. Generate offer SDP
 * 5. Send offer to OpenAI, get answer SDP
 * 6. Set remote description
 *
 * @param token - Ephemeral token from /api/realtime/token
 * @returns Promise resolving to session with peer connection and data channel
 */
export async function createRealtimeSession(token: string): Promise<RealtimeSession> {
  // 1. Get user's microphone
  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });

  // 2. Create peer connection
  const pc = new RTCPeerConnection();

  // 3. Add local audio track to peer connection
  localStream.getAudioTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // 4. Create data channel for JSON events
  const dc = pc.createDataChannel("oai-events");

  // 5. Create offer SDP
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // 6. Send offer to OpenAI and get answer
  const response = await fetch(`${OPENAI_REALTIME_URL}?model=${REALTIME_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/sdp",
    },
    body: offer.sdp,
  });

  if (!response.ok) {
    // Clean up on failure
    localStream.getTracks().forEach((track) => track.stop());
    pc.close();
    throw new Error(`Failed to connect to OpenAI Realtime: ${response.status}`);
  }

  // 7. Set remote description from OpenAI's answer
  const answerSdp = await response.text();
  await pc.setRemoteDescription({
    type: "answer",
    sdp: answerSdp,
  });

  return { pc, dc, localStream };
}

/**
 * Sends a session.update event to configure the AI assistant
 *
 * @param dc - Data channel from createRealtimeSession
 * @param instructions - System instructions for the AI
 */
export function sendSessionUpdate(dc: RTCDataChannel, instructions: string): void {
  if (dc.readyState !== "open") {
    console.warn("Data channel not open, cannot send session update");
    return;
  }

  const event = {
    type: "session.update",
    session: {
      instructions,
    },
  };

  dc.send(JSON.stringify(event));
}

/**
 * Sends a text message to the AI via the data channel
 * Useful for debugging or accessibility fallback
 *
 * @param dc - Data channel from createRealtimeSession
 * @param text - Text message to send
 */
export function sendTextMessage(dc: RTCDataChannel, text: string): void {
  if (dc.readyState !== "open") {
    console.warn("Data channel not open, cannot send message");
    return;
  }

  const event = {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text,
        },
      ],
    },
  };

  dc.send(JSON.stringify(event));

  // Trigger response generation
  const responseEvent = {
    type: "response.create",
  };
  dc.send(JSON.stringify(responseEvent));
}

/**
 * Cleans up a realtime session
 * Stops all tracks and closes the peer connection
 *
 * @param pc - Peer connection to clean up
 * @param localStream - Optional local stream to stop
 */
export function cleanupRealtimeSession(
  pc: RTCPeerConnection,
  localStream?: MediaStream
): void {
  // Stop local stream tracks
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }

  // Stop all tracks on peer connection senders
  pc.getSenders().forEach((sender) => {
    if (sender.track) {
      sender.track.stop();
    }
  });

  // Close data channels
  // Note: No direct API to get all data channels, but closing PC handles it

  // Close peer connection
  pc.close();
}

/**
 * Sets up audio playback for remote stream from AI
 * Creates a hidden audio element and plays the AI's voice
 *
 * @param pc - Peer connection to listen for remote tracks
 * @returns Cleanup function to remove audio element
 */
export function setupRemoteAudioPlayback(pc: RTCPeerConnection): () => void {
  let audioElement: HTMLAudioElement | null = null;

  const handleTrack = (event: RTCTrackEvent) => {
    // Only handle audio tracks
    if (event.track.kind !== "audio") return;

    // Create audio element if not exists
    if (!audioElement) {
      audioElement = document.createElement("audio");
      audioElement.autoplay = true;
      // Note: We don't append to DOM, just use for playback
    }

    // Set the remote stream as source
    audioElement.srcObject = event.streams[0];
  };

  pc.addEventListener("track", handleTrack);

  // Return cleanup function
  return () => {
    pc.removeEventListener("track", handleTrack);
    if (audioElement) {
      audioElement.srcObject = null;
      audioElement = null;
    }
  };
}
