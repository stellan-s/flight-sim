/**
 * Morse Code Audio Player
 * Plays morse code beeps for VOR station identifiers
 */

import { MORSE_CODE } from '../utils/morse-data.js';

export class MorseCodePlayer {
  constructor() {
    this.audioContext = null;
    this.frequency = 1020; // Hz (typical VOR morse tone)
    this.dotDuration = 80; // ms (faster for VOR stations)
    this.dashDuration = this.dotDuration * 3;
    this.symbolGap = this.dotDuration;
    this.letterGap = this.dotDuration * 3;
    this.isPlaying = false;
  }

  // Initialize audio context (must be called after user interaction)
  initAudio() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioContext;
  }

  // Convert text to morse code
  textToMorse(text) {
    return text.toUpperCase().split('').map(char => MORSE_CODE[char] || '').join(' ');
  }

  // Play a single beep
  playBeep(duration) {
    return new Promise((resolve) => {
      if (!this.audioContext) {
        this.initAudio();
      }

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.value = this.frequency;
      oscillator.type = 'sine';

      // Envelope to avoid clicks
      const now = this.audioContext.currentTime;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.005); // Quick attack
      gainNode.gain.setValueAtTime(0.3, now + duration / 1000 - 0.005);
      gainNode.gain.linearRampToValueAtTime(0, now + duration / 1000); // Quick release

      oscillator.start(now);
      oscillator.stop(now + duration / 1000);

      setTimeout(resolve, duration);
    });
  }

  // Play morse code for a string
  async playMorse(text) {
    if (this.isPlaying) {
      return; // Don't overlap morse code
    }

    this.isPlaying = true;

    try {
      const morse = this.textToMorse(text);

      for (let i = 0; i < morse.length; i++) {
        const char = morse[i];

        if (char === '.') {
          await this.playBeep(this.dotDuration);
          await this.wait(this.symbolGap);
        } else if (char === '-') {
          await this.playBeep(this.dashDuration);
          await this.wait(this.symbolGap);
        } else if (char === ' ') {
          await this.wait(this.letterGap);
        }
      }
    } finally {
      this.isPlaying = false;
    }
  }

  // Helper to wait
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Stop any playing morse code
  stop() {
    this.isPlaying = false;
    if (this.audioContext) {
      // Create new context to stop all sounds
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
