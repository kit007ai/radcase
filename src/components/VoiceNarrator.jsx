import React, { useState, useEffect, useRef, useCallback } from 'react';
import theme from '../theme';

const styles = {
  container: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  toggleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '44px',
    height: '44px',
    borderRadius: theme.radii.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.glassBg,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    fontSize: '1.2rem',
    transition: `all ${theme.transitions.fast}`,
    position: 'relative',
    fontFamily: theme.typography.fontFamily,
  },
  toggleBtnActive: {
    background: 'rgba(99, 102, 241, 0.3)',
    borderColor: theme.colors.accent,
    color: theme.colors.accentHover,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  controlBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: theme.radii.sm,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.glassBg,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    fontSize: '0.9rem',
    transition: `all ${theme.transitions.fast}`,
    fontFamily: theme.typography.fontFamily,
  },
  voiceSelect: {
    padding: '4px 8px',
    borderRadius: theme.radii.sm,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.bgTertiary,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.sizes.xs,
    fontFamily: theme.typography.fontFamily,
    maxWidth: '150px',
  },
  indicator: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: theme.colors.accent,
    animation: 'pulse 1.2s ease-in-out infinite',
  },
  pulseKeyframes: `
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.8); }
    }
  `,
};

/**
 * TTS-powered case narration component using Web Speech API.
 * Reads case fields in sequence: title, history, diagnosis, findings, teaching points.
 */
export default function VoiceNarrator({ caseData }) {
  const synthRef = useRef(window.speechSynthesis);
  const queueRef = useRef([]);
  const currentUtteranceRef = useRef(null);

  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');

  // Inject pulse animation keyframes
  useEffect(() => {
    const styleId = 'voice-narrator-keyframes';
    if (!document.getElementById(styleId)) {
      const el = document.createElement('style');
      el.id = styleId;
      el.textContent = styles.pulseKeyframes;
      document.head.appendChild(el);
    }
  }, []);

  // Load voices
  useEffect(() => {
    const synth = synthRef.current;
    if (!synth) return;

    const loadVoices = () => {
      const available = synth.getVoices();
      setVoices(available);

      if (!selectedVoiceName && available.length > 0) {
        // Pick a default English voice
        const preferred = ['Google US English', 'Google UK English Female', 'Samantha', 'Alex', 'Daniel'];
        let picked = null;
        for (const name of preferred) {
          const match = available.find((v) => v.name.includes(name));
          if (match) { picked = match; break; }
        }
        if (!picked) {
          picked = available.find((v) => v.lang.startsWith('en')) || available[0];
        }
        if (picked) setSelectedVoiceName(picked.name);
      }
    };

    loadVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }
  }, [selectedVoiceName]);

  // Auto-pause on tab hide, resume on show
  useEffect(() => {
    const handler = () => {
      if (document.hidden && speaking && !paused) {
        pause();
      } else if (!document.hidden && paused) {
        resume();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }); // Intentionally no deps - reads current state via closure over latest values

  const getSelectedVoice = useCallback(() => {
    return voices.find((v) => v.name === selectedVoiceName) || null;
  }, [voices, selectedVoiceName]);

  const processQueue = useCallback(() => {
    const synth = synthRef.current;
    if (!synth || queueRef.current.length === 0) {
      setSpeaking(false);
      return;
    }

    setSpeaking(true);
    const text = queueRef.current.shift();
    const utterance = new SpeechSynthesisUtterance(text);

    const voice = getSelectedVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      currentUtteranceRef.current = null;
      if (queueRef.current.length === 0) {
        setSpeaking(false);
      } else {
        processQueue();
      }
    };

    utterance.onerror = () => {
      currentUtteranceRef.current = null;
      setSpeaking(false);
    };

    currentUtteranceRef.current = utterance;
    synth.speak(utterance);
  }, [getSelectedVoice]);

  const stop = useCallback(() => {
    const synth = synthRef.current;
    queueRef.current = [];
    if (synth) synth.cancel();
    setSpeaking(false);
    setPaused(false);
    currentUtteranceRef.current = null;
  }, []);

  const readCase = useCallback(() => {
    if (!caseData) return;
    stop();

    const parts = [];
    if (caseData.title) parts.push(`Case: ${caseData.title}.`);
    if (caseData.modality) parts.push(`${caseData.modality} study.`);
    if (caseData.clinical_history) parts.push(`History: ${caseData.clinical_history}.`);
    if (caseData.diagnosis) parts.push(`Diagnosis: ${caseData.diagnosis}.`);
    if (caseData.findings) parts.push(`Findings: ${caseData.findings}.`);
    if (caseData.teaching_points) parts.push(`Teaching points: ${caseData.teaching_points}.`);

    if (parts.length === 0) return;

    queueRef.current = parts;
    processQueue();
  }, [caseData, stop, processQueue]);

  const toggleNarration = useCallback(() => {
    if (speaking) {
      stop();
    } else {
      readCase();
    }
  }, [speaking, stop, readCase]);

  const pause = useCallback(() => {
    const synth = synthRef.current;
    if (speaking && !paused && synth) {
      synth.pause();
      setPaused(true);
    }
  }, [speaking, paused]);

  const resume = useCallback(() => {
    const synth = synthRef.current;
    if (paused && synth) {
      synth.resume();
      setPaused(false);
    }
  }, [paused]);

  if (!window.speechSynthesis) return null;

  return (
    <div style={styles.container}>
      {/* Main toggle button */}
      <button
        style={{
          ...styles.toggleBtn,
          ...(speaking ? styles.toggleBtnActive : {}),
        }}
        onClick={toggleNarration}
        title={speaking ? 'Stop narration' : 'Read case aloud'}
        aria-label={speaking ? 'Stop narration' : 'Read case aloud'}
        aria-pressed={speaking}
      >
        {speaking ? (
          <>
            <span aria-hidden="true">&#x23F9;</span>
            <span style={{ ...styles.indicator, position: 'absolute', top: '4px', right: '4px' }} />
          </>
        ) : (
          <span aria-hidden="true">&#x1F50A;</span>
        )}
      </button>

      {/* Extended controls when speaking */}
      {speaking && (
        <div style={styles.controls}>
          <button
            style={styles.controlBtn}
            onClick={paused ? resume : pause}
            title={paused ? 'Resume' : 'Pause'}
            aria-label={paused ? 'Resume narration' : 'Pause narration'}
          >
            {paused ? '\u25B6' : '\u23F8'}
          </button>
        </div>
      )}

      {/* Voice selection (collapsed) */}
      {voices.length > 1 && !speaking && (
        <select
          style={styles.voiceSelect}
          value={selectedVoiceName}
          onChange={(e) => setSelectedVoiceName(e.target.value)}
          aria-label="Select voice"
        >
          {voices
            .filter((v) => v.lang.startsWith('en'))
            .map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
        </select>
      )}
    </div>
  );
}
