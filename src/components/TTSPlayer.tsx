'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface TTSPlayerProps {
  scriptParts: string[];
  pauseGapMs?: number;
  onStateChange?: (playing: boolean) => void;
}

type PlayState = 'idle' | 'playing' | 'paused';
const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
const LS_VOICE_KEY = 'ocv-tts-voice';

// Low-quality synthesis engines to avoid
const BAD_ENGINES = ['espeak', 'festival', 'mbrola', 'flite'];

// Ordered list of substrings to match for best-first auto-selection.
// Checked in order; first match wins.
const QUALITY_TIERS = [
  'google us english',
  'google uk english',
  'google',          // any other Google online voice
  'microsoft',       // Windows neural voices
  'samantha',        // macOS
  'alex',
  'karen',
  'daniel',
  'moira',
  'rishi',
  'nicky',
  'zoe',
];

function rankVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const en = voices.filter((v) => v.lang.startsWith('en'));
  const clean = en.filter((v) => !BAD_ENGINES.some((b) => v.name.toLowerCase().includes(b)));

  for (const tier of QUALITY_TIERS) {
    const match = clean.find((v) => v.name.toLowerCase().includes(tier));
    if (match) {
      // Return match first, then the rest
      return [match, ...clean.filter((v) => v !== match)];
    }
  }
  return clean.length > 0 ? clean : en;
}

export default function TTSPlayer({ scriptParts, pauseGapMs = 1500, onStateChange }: TTSPlayerProps) {
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [speedIdx, setSpeedIdx] = useState<number>(1);
  const [partIdx, setPartIdx] = useState<number>(0);
  const [supported, setSupported] = useState<boolean>(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('');

  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const partIdxRef = useRef<number>(0);
  const playStateRef = useRef<PlayState>('idle');
  const speedRef = useRef<number>(SPEEDS[1]);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSupported(false);
      return;
    }

    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices();
      if (all.length === 0) return;

      const ranked = rankVoices(all);
      // Fall back to all voices if ranked filtering left nothing
      const display = ranked.length > 0 ? ranked : all;
      setVoices(display);

      // Restore saved preference, or default to best available
      const saved = localStorage.getItem(LS_VOICE_KEY);
      const preferred = (saved ? all.find((v) => v.name === saved) : null) ?? display[0] ?? null;
      voiceRef.current = preferred;
      setSelectedVoiceName(preferred?.name ?? '');
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    // Some browsers fire onvoiceschanged before components mount,
    // so the handler above never triggers. Retry after a short delay.
    const t1 = setTimeout(loadVoices, 100);
    const t2 = setTimeout(loadVoices, 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Keep refs in sync with state
  useEffect(() => { partIdxRef.current = partIdx; }, [partIdx]);
  useEffect(() => { playStateRef.current = playState; }, [playState]);
  useEffect(() => { speedRef.current = SPEEDS[speedIdx]; }, [speedIdx]);

  const handleVoiceChange = useCallback((name: string) => {
    const all = window.speechSynthesis.getVoices();
    const voice = all.find((v) => v.name === name) ?? null;
    voiceRef.current = voice;
    setSelectedVoiceName(name);
    localStorage.setItem(LS_VOICE_KEY, name);
  }, []);

  const cancelAll = useCallback(() => {
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
  }, []);

  const speakPart = useCallback((idx: number) => {
    if (idx >= scriptParts.length) {
      setPlayState('idle');
      setPartIdx(0);
      onStateChange?.(false);
      return;
    }

    const text = scriptParts[idx];
    if (!text?.trim()) {
      pauseTimeoutRef.current = setTimeout(() => speakPart(idx + 1), pauseGapMs);
      return;
    }

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = speedRef.current;
    if (voiceRef.current) utt.voice = voiceRef.current;
    utteranceRef.current = utt;

    utt.onend = () => {
      if (playStateRef.current !== 'playing') return;
      setPartIdx(idx + 1);
      if (idx + 1 < scriptParts.length) {
        pauseTimeoutRef.current = setTimeout(() => speakPart(idx + 1), pauseGapMs);
      } else {
        setPlayState('idle');
        setPartIdx(0);
        onStateChange?.(false);
      }
    };

    utt.onerror = () => {
      setPlayState('idle');
      onStateChange?.(false);
    };

    window.speechSynthesis.speak(utt);
  }, [scriptParts, pauseGapMs, onStateChange]);

  const handlePlay = useCallback(() => {
    if (!supported) return;
    if (playState === 'paused') {
      window.speechSynthesis.resume();
      setPlayState('playing');
      onStateChange?.(true);
      return;
    }
    cancelAll();
    const startIdx = playState === 'idle' ? 0 : partIdxRef.current;
    setPartIdx(startIdx);
    setPlayState('playing');
    onStateChange?.(true);
    speakPart(startIdx);
  }, [playState, supported, cancelAll, speakPart, onStateChange]);

  const handlePause = useCallback(() => {
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }
    window.speechSynthesis.pause();
    setPlayState('paused');
    onStateChange?.(false);
  }, [onStateChange]);

  const handleStop = useCallback(() => {
    cancelAll();
    setPlayState('idle');
    setPartIdx(0);
    onStateChange?.(false);
  }, [cancelAll, onStateChange]);

  useEffect(() => { return () => { cancelAll(); }; }, [cancelAll]);

  useEffect(() => {
    if (playState === 'playing') handleStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptParts]);

  if (!supported) return null;

  const totalParts = scriptParts.filter((p) => p.trim()).length;
  const progress = totalParts > 0 ? Math.round((partIdx / totalParts) * 100) : 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Play / Pause */}
      {playState === 'playing' ? (
        <button
          onClick={handlePause}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-xs text-white transition-colors"
          aria-label="Pause"
        >
          <PauseIcon /> Pause
        </button>
      ) : (
        <button
          onClick={handlePlay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-xs text-white transition-colors"
          aria-label={playState === 'paused' ? 'Resume' : 'Play'}
        >
          <PlayIcon /> {playState === 'paused' ? 'Resume' : 'Listen'}
        </button>
      )}

      {/* Stop — only when active */}
      {playState !== 'idle' && (
        <button
          onClick={handleStop}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 text-xs text-gray-400 hover:text-white transition-colors"
          aria-label="Stop"
        >
          <StopIcon />
        </button>
      )}

      {/* Speed picker */}
      <div className="flex items-center gap-0.5 rounded-lg border border-gray-700 overflow-hidden">
        {SPEEDS.map((s, idx) => (
          <button
            key={s}
            onClick={() => {
              setSpeedIdx(idx);
              if (playState === 'playing' && utteranceRef.current) {
                utteranceRef.current.rate = s;
              }
            }}
            className={`px-2 py-1.5 text-xs transition-colors ${
              speedIdx === idx
                ? 'bg-indigo-800 text-indigo-200'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      {/* Voice picker — shown when voices have loaded */}
      {voices.length > 0 && (
        <select
          value={selectedVoiceName}
          onChange={(e) => handleVoiceChange(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-gray-700 bg-gray-900 text-xs text-gray-400 hover:border-gray-600 focus:outline-none focus:border-indigo-600 transition-colors max-w-[160px] truncate"
          aria-label="Select voice"
          title={selectedVoiceName}
        >
          {voices.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name}
            </option>
          ))}
        </select>
      )}

      {/* Progress — only when active */}
      {playState !== 'idle' && totalParts > 1 && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-16 h-1 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span>{progress}%</span>
        </div>
      )}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <svg className="w-3 h-3 fill-current" viewBox="0 0 16 16">
      <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="w-3 h-3 fill-current" viewBox="0 0 16 16">
      <rect x="3" y="2" width="4" height="12" rx="1" />
      <rect x="9" y="2" width="4" height="12" rx="1" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="w-3 h-3 fill-current" viewBox="0 0 16 16">
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
    </svg>
  );
}
