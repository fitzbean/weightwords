import { GoogleGenAI, Modality, Type, type Session, type LiveServerMessage } from '@google/genai';
import { FoodItemEstimate } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The Live API expects 16 kHz PCM input and returns 24 kHz PCM output.
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

export type LiveStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error' | 'closed';

// Prebuilt Gemini Live voices (the stable, documented set) with a short vibe label.
export const LIVE_VOICES: { name: string; vibe: string }[] = [
  { name: 'Puck', vibe: 'Upbeat' },
  { name: 'Charon', vibe: 'Informative' },
  { name: 'Kore', vibe: 'Firm' },
  { name: 'Fenrir', vibe: 'Excitable' },
  { name: 'Aoede', vibe: 'Breezy' },
  { name: 'Leda', vibe: 'Youthful' },
  { name: 'Orus', vibe: 'Steady' },
  { name: 'Zephyr', vibe: 'Bright' },
];

export const DEFAULT_LIVE_VOICE = 'Puck';

export interface LiveStartOptions {
  voice?: string;
}

export interface LiveCallbacks {
  onStatus?: (status: LiveStatus) => void;
  onUserTranscript?: (text: string) => void;   // incremental transcript of what the user says
  onModelTranscript?: (text: string) => void;  // incremental transcript of what the assistant says
  onFoodLogged?: (items: FoodItemEstimate[]) => void;
  onTurnComplete?: () => void;
  onEnd?: () => void; // model signalled the conversation is over (after its goodbye finishes)
  onError?: (message: string) => void;
}

// ---- PCM helpers -----------------------------------------------------------

// Float32 [-1,1] samples -> base64-encoded little-endian PCM16.
const floatTo16BitPCMBase64 = (float32: Float32Array): string => {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
};

// base64 PCM16 -> Float32 [-1,1] samples for playback.
const base64PCM16ToFloat32 = (base64: string): Float32Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const float32 = new Float32Array(bytes.length / 2);
  for (let i = 0; i < float32.length; i++) {
    float32[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return float32;
};

// The food-logging tool the model calls to push items into the app.
const LOG_FOOD_TOOL = {
  functionDeclarations: [
    {
      name: 'log_food',
      description:
        'Record one or more food or drink items the user says they ate or drank. Provide your best nutrition estimate per item. Call this whenever the user mentions eating or drinking something concrete; you may call it multiple times in a session.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          items: {
            type: Type.ARRAY,
            description: 'The food/drink items to log.',
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: 'Short human-readable name, e.g. "2 scrambled eggs".' },
                calories: { type: Type.NUMBER, description: 'Estimated total calories (kcal) for the stated portion.' },
                protein: { type: Type.NUMBER, description: 'Grams of protein.' },
                carbs: { type: Type.NUMBER, description: 'Grams of carbohydrates.' },
                fat: { type: Type.NUMBER, description: 'Grams of fat.' },
                fiber: { type: Type.NUMBER, description: 'Grams of fiber.' },
              },
              required: ['name', 'calories', 'protein', 'carbs', 'fat', 'fiber'],
            },
          },
        },
        required: ['items'],
      },
    },
    {
      name: 'end_session',
      description:
        'End the live logging session. Call this immediately after you give a short goodbye/sign-off, once the user has indicated they are finished (e.g. "I\'m done", "that\'s everything", "nothing else", "goodbye").',
      parameters: { type: Type.OBJECT, properties: {} },
    },
  ],
};

const SYSTEM_INSTRUCTION = `You are the WeightWords voice logging assistant. Your job is to help the user log the food and drinks they ate, quickly and naturally.

Guidelines:
- Keep spoken replies short and conversational — one sentence is ideal.
- When the user names something they ate or drank, estimate its nutrition and call the log_food tool. Then briefly confirm out loud, e.g. "Got it — two eggs and toast, about 320 calories. Anything else?"
- If a portion is ambiguous, assume a typical single serving rather than interrogating the user; you can note the assumption briefly.
- Log items as the user mentions them; don't wait for them to finish a long list.
- Do not read out full macro breakdowns unless asked; the app shows those on screen.
- When the user indicates they are finished (e.g. "I'm done", "that's everything", "nothing else", "goodbye"), give a short friendly sign-off out loud AND call the end_session tool in the same turn. Always call end_session when wrapping up — do not just say goodbye without it.`;

export class GeminiLiveService {
  private session: Session | null = null;
  private callbacks: LiveCallbacks = {};

  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;

  // Playback scheduling: sequential buffers keyed to a running clock.
  private nextPlayTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private stopped = false;
  private connected = false;
  private endRequested = false; // model called end_session; close once its goodbye finishes

  isActive(): boolean {
    return !!this.session;
  }

  async start(callbacks: LiveCallbacks, options: LiveStartOptions = {}): Promise<void> {
    this.callbacks = callbacks;
    this.stopped = false;
    this.connected = false;
    this.endRequested = false;
    this.setStatus('connecting');

    // 1. Mint an ephemeral token server-side (keeps the real key off the client).
    let token: string;
    let model: string;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/gemini-live-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
      });
      if (!res.ok) throw new Error(`Token request failed (${res.status})`);
      const data = await res.json();
      if (!data.token) throw new Error(data.error || 'No token returned');
      token = data.token;
      model = data.model || 'gemini-3.1-flash-live-preview';
    } catch (err: any) {
      this.fail(`Could not start live session: ${err?.message || err}`);
      return;
    }
    if (this.stopped) return; // aborted (e.g. StrictMode remount) during token fetch

    // 2. Acquire the microphone before opening the socket so we fail fast on denial.
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (err: any) {
      this.fail('Microphone access was denied. Enable it to use live logging.');
      return;
    }
    if (this.stopped) {
      // Aborted while the mic prompt was open — release it and bail.
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
      return;
    }

    // 3. Connect to the Live API using the ephemeral token.
    try {
      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
      const session = await ai.live.connect({
        model,
        callbacks: {
          onopen: () => {
            if (this.stopped) return;
            this.connected = true;
          },
          onmessage: (msg: LiveServerMessage) => this.handleMessage(msg),
          onerror: (e: ErrorEvent) => this.fail(e.message || 'Live connection error'),
          onclose: (e: CloseEvent) => this.handleClose(e),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [LOG_FOOD_TOOL],
          ...(options.voice
            ? { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voice } } } }
            : {}),
        },
      });

      // If we were torn down while connecting, close the freshly-opened socket.
      if (this.stopped) {
        try { session.close(); } catch { /* noop */ }
        return;
      }
      this.session = session;
      this.startMicPump();
    } catch (err: any) {
      this.fail(`Live connection failed: ${err?.message || err}`);
    }
  }

  private handleClose(e: CloseEvent): void {
    this.connected = false;
    this.teardownAudio(); // stop the mic pump so it can't keep sending on a dead socket
    if (this.stopped) return; // we closed it on purpose
    // 1000 = normal closure. Anything else is unexpected — surface why.
    if (e && e.code && e.code !== 1000) {
      const reason = e.reason ? `: ${e.reason}` : ` (code ${e.code})`;
      this.callbacks.onError?.(`Live session closed${reason}`);
      this.setStatus('error');
    } else {
      this.setStatus('closed');
    }
  }

  // Stream microphone audio as 16 kHz PCM16 chunks.
  private startMicPump(): void {
    if (!this.micStream || this.stopped) return;
    try {
      this.inputCtx = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
      this.sourceNode = this.inputCtx.createMediaStreamSource(this.micStream);
      this.processor = this.inputCtx.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (event) => {
        // Only send once the socket is actually open and still alive.
        if (!this.session || !this.connected || this.stopped) return;
        const input = event.inputBuffer.getChannelData(0);
        const data = floatTo16BitPCMBase64(input);
        try {
          this.session.sendRealtimeInput({
            audio: { data, mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` },
          });
        } catch {
          // Socket closed between checks; stop pumping.
          this.connected = false;
        }
      };

      this.sourceNode.connect(this.processor);
      this.processor.connect(this.inputCtx.destination);

      this.outputCtx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
      this.nextPlayTime = 0;
      this.setStatus('listening');
    } catch (err: any) {
      this.fail(`Audio setup failed: ${err?.message || err}`);
    }
  }

  private handleMessage(msg: LiveServerMessage): void {
    const content = msg.serverContent;

    if (content?.inputTranscription?.text) {
      this.callbacks.onUserTranscript?.(content.inputTranscription.text);
    }
    if (content?.outputTranscription?.text) {
      this.callbacks.onModelTranscript?.(content.outputTranscription.text);
    }

    // Model interrupted mid-utterance (barge-in): drop any queued audio.
    if (content?.interrupted) {
      this.flushPlayback();
      this.setStatus('listening');
    }

    // Play any audio parts the model returned.
    const parts = content?.modelTurn?.parts;
    if (parts) {
      for (const part of parts) {
        const inline = (part as any).inlineData;
        if (inline?.data && typeof inline.mimeType === 'string' && inline.mimeType.startsWith('audio/')) {
          this.enqueuePlayback(inline.data);
        }
      }
    }

    if (content?.turnComplete) {
      this.callbacks.onTurnComplete?.();
      if (this.endRequested) {
        this.scheduleEnd();
      } else {
        this.setStatus('listening');
      }
    }

    // The model wants to log food.
    if (msg.toolCall?.functionCalls?.length) {
      this.handleToolCalls(msg.toolCall.functionCalls);
    }
  }

  private handleToolCalls(calls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>): void {
    const responses: Array<{ id?: string; name?: string; response: Record<string, unknown> }> = [];

    for (const call of calls) {
      if (call.name === 'log_food') {
        const rawItems = (call.args?.items as any[]) || [];
        const items: FoodItemEstimate[] = rawItems.map((it) => ({
          name: String(it?.name ?? 'Food'),
          calories: Math.round(Number(it?.calories) || 0),
          protein: Math.round(Number(it?.protein) || 0),
          carbs: Math.round(Number(it?.carbs) || 0),
          fat: Math.round(Number(it?.fat) || 0),
          fiber: Math.round(Number(it?.fiber) || 0),
          source: 'estimated',
        }));
        if (items.length) this.callbacks.onFoodLogged?.(items);
        responses.push({
          id: call.id,
          name: call.name,
          response: { status: 'logged', count: items.length },
        });
      } else if (call.name === 'end_session') {
        // Let the goodbye finish playing, then close (handled on turnComplete).
        this.endRequested = true;
        responses.push({ id: call.id, name: call.name, response: { status: 'ending' } });
      } else {
        responses.push({ id: call.id, name: call.name, response: { status: 'ignored' } });
      }
    }

    try {
      this.session?.sendToolResponse({ functionResponses: responses });
    } catch {
      // Session closed; nothing to do.
    }
  }

  private enqueuePlayback(base64Audio: string): void {
    if (!this.outputCtx) return;
    const float32 = base64PCM16ToFloat32(base64Audio);
    if (!float32.length) return;

    const buffer = this.outputCtx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const src = this.outputCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.outputCtx.destination);

    const now = this.outputCtx.currentTime;
    if (this.nextPlayTime < now) this.nextPlayTime = now;
    src.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;

    this.setStatus('speaking');
    this.activeSources.add(src);
    src.onended = () => {
      this.activeSources.delete(src);
    };
  }

  private flushPlayback(): void {
    for (const src of this.activeSources) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    this.activeSources.clear();
    this.nextPlayTime = 0;
  }

  // Close the session once any remaining goodbye audio has played out.
  private scheduleEnd(): void {
    const remainingMs = this.outputCtx
      ? Math.max(0, (this.nextPlayTime - this.outputCtx.currentTime) * 1000)
      : 0;
    window.setTimeout(() => {
      if (this.stopped) return;
      this.callbacks.onEnd?.();
    }, remainingMs + 400);
  }

  private setStatus(status: LiveStatus): void {
    this.callbacks.onStatus?.(status);
  }

  private fail(message: string): void {
    this.callbacks.onError?.(message);
    this.setStatus('error');
    this.stop();
  }

  // Tear down the mic capture + playback graph. Safe to call more than once.
  private teardownAudio(): void {
    this.flushPlayback();

    try { this.processor?.disconnect(); } catch { /* noop */ }
    try { this.sourceNode?.disconnect(); } catch { /* noop */ }
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor = null;
    this.sourceNode = null;

    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;

    if (this.inputCtx && this.inputCtx.state !== 'closed') this.inputCtx.close().catch(() => {});
    if (this.outputCtx && this.outputCtx.state !== 'closed') this.outputCtx.close().catch(() => {});
    this.inputCtx = null;
    this.outputCtx = null;
  }

  stop(): void {
    this.stopped = true;
    this.connected = false;
    this.teardownAudio();
    try { this.session?.close(); } catch { /* noop */ }
    this.session = null;
  }
}
