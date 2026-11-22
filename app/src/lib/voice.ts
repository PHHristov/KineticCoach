import * as Speech from 'expo-speech';

/**
 * Thin wrapper around text-to-speech. Later on, sensor-driven cues
 * (rep counted, form correction, ...) will go through the same `say` call.
 */
let enabled = true;

export function setVoiceEnabled(on: boolean) {
  enabled = on;
  if (!on) Speech.stop();
}

export function say(text: string, opts: { interrupt?: boolean } = {}) {
  if (!enabled) return;
  if (opts.interrupt !== false) Speech.stop();
  Speech.speak(text, { language: 'en-US', rate: 1.0 });
}

export function stopVoice() {
  Speech.stop();
}
