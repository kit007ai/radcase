/**
 * VoiceNarrator - Voice narration module for RadCase
 * Uses Web Speech API (speechSynthesis) for hands-free case learning
 */
class VoiceNarrator {
  constructor() {
    this.synth = window.speechSynthesis;
    this.queue = [];
    this.speaking = false;
    this.paused = false;
    this.currentUtterance = null;
    this.rate = 1.0;
    this.selectedVoice = null;
    this.voices = [];

    // Event callbacks
    this.onStart = null;
    this.onEnd = null;
    this.onPause = null;
    this.onResume = null;
    this.onError = null;

    this._loadVoices();
    // Voices may load async in some browsers
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this._loadVoices();
    }

    // Auto-pause when tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.speaking && !this.paused) {
        this.pause();
      } else if (!document.hidden && this.paused) {
        this.resume();
      }
    });
  }

  _loadVoices() {
    this.voices = this.synth.getVoices();
    if (!this.selectedVoice && this.voices.length > 0) {
      this.selectedVoice = this._pickDefaultVoice();
    }
  }

  _pickDefaultVoice() {
    // Prefer clear English voices
    const preferred = [
      'Google US English',
      'Google UK English Female',
      'Samantha',
      'Alex',
      'Daniel',
    ];
    for (const name of preferred) {
      const match = this.voices.find(v => v.name.includes(name));
      if (match) return match;
    }
    // Fallback: first English voice
    const english = this.voices.find(v => v.lang.startsWith('en'));
    return english || this.voices[0] || null;
  }

  getVoices() {
    return this.voices;
  }

  setVoice(voice) {
    if (typeof voice === 'string') {
      const match = this.voices.find(v => v.name === voice);
      if (match) this.selectedVoice = match;
    } else if (voice instanceof SpeechSynthesisVoice) {
      this.selectedVoice = voice;
    }
  }

  setRate(rate) {
    this.rate = Math.max(0.5, Math.min(2.0, rate));
  }

  speak(text) {
    if (!text || !this.synth) return;
    this.queue.push(text);
    if (!this.speaking) {
      this._processQueue();
    }
  }

  _processQueue() {
    if (this.queue.length === 0) {
      this.speaking = false;
      return;
    }

    this.speaking = true;
    const text = this.queue.shift();
    const utterance = new SpeechSynthesisUtterance(text);

    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }
    utterance.rate = this.rate;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      if (this.onStart) this.onStart(text);
    };

    utterance.onend = () => {
      this.currentUtterance = null;
      if (this.queue.length === 0) {
        this.speaking = false;
        if (this.onEnd) this.onEnd();
      } else {
        this._processQueue();
      }
    };

    utterance.onerror = (e) => {
      this.currentUtterance = null;
      this.speaking = false;
      if (this.onError) this.onError(e);
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  pause() {
    if (this.speaking && !this.paused) {
      this.synth.pause();
      this.paused = true;
      if (this.onPause) this.onPause();
    }
  }

  resume() {
    if (this.paused) {
      this.synth.resume();
      this.paused = false;
      if (this.onResume) this.onResume();
    }
  }

  stop() {
    this.queue = [];
    this.synth.cancel();
    this.speaking = false;
    this.paused = false;
    this.currentUtterance = null;
    if (this.onEnd) this.onEnd();
  }

  readCase(caseData) {
    if (!caseData) return;
    this.stop();

    const parts = [];

    if (caseData.title) {
      parts.push(`Case: ${caseData.title}.`);
    }
    if (caseData.modality) {
      parts.push(`${caseData.modality} study.`);
    }
    if (caseData.clinical_history) {
      parts.push(`History: ${caseData.clinical_history}.`);
    }
    if (caseData.findings) {
      parts.push(`Findings: ${caseData.findings}.`);
    }
    if (caseData.diagnosis) {
      parts.push(`Diagnosis: ${caseData.diagnosis}.`);
    }
    if (caseData.teaching_points) {
      parts.push(`Teaching points: ${caseData.teaching_points}.`);
    }

    // Split into separate utterances for better queue management
    for (const part of parts) {
      this.speak(part);
    }
  }
}

// Global instance
const voiceNarrator = new VoiceNarrator();
