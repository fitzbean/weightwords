const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let ctx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

// base64 PCM16 -> Float32 [-1, 1]
const pcm16ToFloat32 = (base64: string): Float32Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(bytes.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
};

// Stop any preview currently playing.
export const stopVoicePreview = () => {
  if (currentSource) {
    try { currentSource.stop(); } catch { /* already stopped */ }
    currentSource = null;
  }
};

// Fetch a short synthesized sample for `voice` and play it. Resolves when playback ends.
// MUST be called directly from a user gesture (e.g. a click handler): mobile browsers
// only unlock audio if the AudioContext is created/resumed synchronously within the tap,
// which is why the context work happens BEFORE the network fetch.
export const previewVoice = async (voice: string): Promise<void> => {
  // Create + resume the context inside the gesture, before any await, so iOS unlocks audio.
  if (!ctx) {
    const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    ctx = new Ctor();
  }
  const ready = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();

  const res = await fetch(`${supabaseUrl}/functions/v1/gemini-voice-preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ voice }),
  });
  if (!res.ok) {
    let msg = `Preview failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }

  const { audio, sampleRate } = await res.json();
  if (!audio) throw new Error('No audio returned');

  const float32 = pcm16ToFloat32(audio);
  const rate = sampleRate || 24000;

  await ready;
  stopVoicePreview();

  const buffer = ctx.createBuffer(1, float32.length, rate);
  buffer.copyToChannel(float32, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  currentSource = src;

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (currentSource === src) currentSource = null;
      resolve();
    };
    src.onended = finish;
    try {
      src.start();
    } catch {
      finish();
      return;
    }
    // Safety net: if onended never fires (flaky mobile audio), resolve just after
    // the clip's expected duration so the UI never hangs.
    setTimeout(finish, buffer.duration * 1000 + 800);
  });
};
