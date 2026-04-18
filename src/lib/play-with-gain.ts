/**
 * Play an audio URL with a gain boost via the Web Audio API.
 *
 * Uploaded clips are usually recorded quieter than Azure TTS output, so
 * playing them at default volume makes them feel muffled next to
 * TTS-generated lines. We route uploaded audio through a GainNode with a
 * constant multiplier. Gain > 1.0 pushes amplitude above the source's
 * original range; very loud source files may clip slightly.
 *
 * Falls back silently to default volume if the Web Audio API is
 * unavailable (old browsers) or a MediaElementSource can't be created.
 */

const DEFAULT_GAIN = 1.8;

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export interface PlayWithGainHandle {
  audio: HTMLAudioElement;
  ended: Promise<void>;
  stop: () => void;
}

export function playWithGain(
  url: string,
  gain: number = DEFAULT_GAIN,
): PlayWithGainHandle {
  const audio = new Audio(url);
  let context: AudioContext | null = null;

  try {
    const AudioCtx =
      window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (AudioCtx) {
      context = new AudioCtx();
      const source = context.createMediaElementSource(audio);
      const gainNode = context.createGain();
      gainNode.gain.value = gain;
      source.connect(gainNode).connect(context.destination);
    }
  } catch {
    // Web Audio unavailable — proceed at default volume.
    context = null;
  }

  let settled = false;
  let resolver: () => void = () => {};
  const ended = new Promise<void>((resolve) => {
    resolver = resolve;
  });

  const finish = () => {
    if (settled) return;
    settled = true;
    if (context) {
      context.close().catch(() => {});
      context = null;
    }
    resolver();
  };

  audio.onended = finish;
  audio.onerror = finish;
  audio.play().catch(finish);

  const stop = () => {
    audio.pause();
    finish();
  };

  return { audio, ended, stop };
}
