import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FoodItemEstimate } from '../types';
import { GeminiLiveService, LiveStatus } from '../services/geminiLiveService';

interface LiveFoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFoodLogged: (items: FoodItemEstimate[]) => void;
  onConfirmEntries: () => Promise<{ count: number; spouse: boolean }>;
  onSetSpouseSharing: (enabled: boolean) => void;
  hasSpouse?: boolean;
  voice?: string;
}

interface TranscriptTurn {
  role: 'user' | 'assistant';
  text: string;
}

const STATUS_LABEL: Record<LiveStatus, string> = {
  idle: 'Ready',
  connecting: 'Connecting…',
  listening: 'Listening…',
  speaking: 'Speaking…',
  error: 'Error',
  closed: 'Session ended',
};

const LiveFoodModal: React.FC<LiveFoodModalProps> = ({ isOpen, onClose, onFoodLogged, onConfirmEntries, onSetSpouseSharing, hasSpouse, voice }) => {
  const serviceRef = useRef<GeminiLiveService | null>(null);
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loggedCount, setLoggedCount] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);

  // In-progress transcript fragments for the current turn.
  const userBuf = useRef('');
  const modelBuf = useRef('');
  const [liveUser, setLiveUser] = useState('');
  const [liveModel, setLiveModel] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const service = new GeminiLiveService();
    serviceRef.current = service;
    setStatus('connecting');
    setError(null);
    setLoggedCount(0);
    setTranscript([]);
    userBuf.current = '';
    modelBuf.current = '';
    setLiveUser('');
    setLiveModel('');

    service.start({
      onStatus: setStatus,
      onUserTranscript: (t) => {
        userBuf.current += t;
        setLiveUser(userBuf.current);
      },
      onModelTranscript: (t) => {
        modelBuf.current += t;
        setLiveModel(modelBuf.current);
      },
      onTurnComplete: () => {
        const u = userBuf.current.trim();
        const m = modelBuf.current.trim();
        setTranscript((prev) => {
          const next = [...prev];
          if (u) next.push({ role: 'user', text: u });
          if (m) next.push({ role: 'assistant', text: m });
          return next;
        });
        userBuf.current = '';
        modelBuf.current = '';
        setLiveUser('');
        setLiveModel('');
      },
      onFoodLogged: (items) => {
        onFoodLogged(items);
        setLoggedCount((c) => c + items.length);
      },
      onConfirmEntries: onConfirmEntries,
      onSetSpouseSharing: onSetSpouseSharing,
      onEnd: () => {
        // Model wrapped up the conversation — tear down and close the modal.
        service.stop();
        onClose();
      },
      onError: (msg) => setError(msg),
    }, { voice, hasSpouse });

    return () => {
      service.stop();
      serviceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Keep the transcript scrolled to the newest line.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [transcript, liveUser, liveModel]);

  const handleClose = () => {
    serviceRef.current?.stop();
    onClose();
  };

  if (!isOpen) return null;

  const isSpeaking = status === 'speaking';
  const isListening = status === 'listening';
  const isConnecting = status === 'connecting';

  // Portal to <body> so the fixed overlay is positioned against the viewport,
  // not against Dashboard's animated (transformed) container.
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 ww-backdrop-in" onClick={handleClose}>
      <div
        className="bg-card border border-line rounded-t-3xl sm:rounded-3xl shadow-pop w-full max-w-md max-h-[92dvh] flex flex-col p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-line2 mx-auto mb-4 sm:hidden shrink-0" />

        <div className="flex justify-between items-center mb-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {(isListening || isSpeaking) && (
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${isSpeaking ? 'bg-brand-400' : 'bg-rose-500'}`}></span>
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isSpeaking ? 'bg-brand-400' : isListening ? 'bg-rose-500' : 'bg-mist'}`}></span>
            </span>
            <h2 className="font-display text-lg font-bold text-snow">Live Logging</h2>
          </div>
          <button
            onClick={handleClose}
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-xl text-mist hover:text-snow hover:bg-card2 transition-colors"
            aria-label="End session"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Talking orb */}
        <div className="flex flex-col items-center justify-center py-4 shrink-0">
          <div className="relative w-28 h-28 flex items-center justify-center">
            {(isListening || isSpeaking) && (
              <>
                <span className={`absolute inset-0 rounded-full ${isSpeaking ? 'bg-brand-500/20' : 'bg-rose-500/15'} animate-ping`} style={{ animationDuration: '1.6s' }}></span>
                <span className={`absolute inset-3 rounded-full ${isSpeaking ? 'bg-brand-500/25' : 'bg-rose-500/20'} animate-pulse`}></span>
              </>
            )}
            <div className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
              isSpeaking
                ? 'bg-gradient-to-br from-brand-400 to-brand-600 shadow-glow scale-110'
                : isListening
                  ? 'bg-gradient-to-br from-rose-500 to-rose-700 shadow-[0_4px_24px_-6px_rgba(244,63,94,0.5)]'
                  : 'bg-card2 border border-line2'
            }`}>
              {isConnecting ? (
                <svg className="animate-spin h-7 w-7 text-brand-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              ) : (
                <svg className={`w-8 h-8 ${isListening || isSpeaking ? 'text-white' : 'text-mist'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </div>
          </div>
          <p className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] ${
            status === 'error' ? 'text-rose-400' : isSpeaking ? 'text-brand-400' : isListening ? 'text-rose-400' : 'text-mist'
          }`}>
            {STATUS_LABEL[status]}
          </p>
          {loggedCount > 0 && (
            <p className="mt-1 text-xs text-fog">
              <span className="font-bold text-brand-400 tabular-nums">{loggedCount}</span> item{loggedCount === 1 ? '' : 's'} added
            </p>
          )}
        </div>

        {error ? (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">{error}</div>
        ) : (
          <>
            {/* Transcript — bounded scroll box so the modal never grows past the viewport */}
            <div ref={scrollRef} className="overflow-y-auto rounded-2xl bg-canvas/60 border border-line p-3 space-y-2 h-[34vh] min-h-[112px]">
              {transcript.length === 0 && !liveUser && !liveModel ? (
                <p className="text-mist text-sm text-center py-4">
                  Say what you ate — e.g. “I had two eggs, toast, and a coffee with milk.”
                </p>
              ) : (
                <>
                  {transcript.map((turn, i) => (
                    <TranscriptBubble key={i} role={turn.role} text={turn.text} />
                  ))}
                  {liveUser && <TranscriptBubble role="user" text={liveUser} live />}
                  {liveModel && <TranscriptBubble role="assistant" text={liveModel} live />}
                </>
              )}
            </div>

            <button
              onClick={handleClose}
              className="mt-4 w-full h-12 rounded-2xl bg-card2 border border-line2 text-fog font-semibold text-sm hover:text-snow transition-all active:scale-[0.98] shrink-0"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

const TranscriptBubble: React.FC<{ role: 'user' | 'assistant'; text: string; live?: boolean }> = ({ role, text, live }) => {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
        isUser
          ? 'bg-brand-500/15 border border-brand-500/25 text-snow rounded-br-md'
          : 'bg-card2 border border-line text-fog rounded-bl-md'
      } ${live ? 'opacity-70' : ''}`}>
        {text}
      </div>
    </div>
  );
};

export default LiveFoodModal;
