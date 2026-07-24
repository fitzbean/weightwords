import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenAI, Modality } from "@google/genai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Single-shot TTS model used only to synthesize a short voice sample.
const TTS_MODEL = 'gemini-3.1-flash-tts-preview';
const SAMPLE_TEXT = "Hey! Ready to log some food?";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { voice } = await req.json();

    const ai = new GoogleGenAI({ apiKey: Deno.env.get('GEMINI_API_KEY') });

    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: SAMPLE_TEXT,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Puck' } },
        },
      },
    });

    // TTS returns inline PCM16 audio; pull the first audio part and its sample rate.
    const parts = response.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find((p: any) => p?.inlineData?.data);
    const data = audioPart?.inlineData?.data;
    const mimeType = audioPart?.inlineData?.mimeType || '';
    if (!data) throw new Error('No audio returned from TTS model');

    const rateMatch = /rate=(\d+)/.exec(mimeType);
    const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;

    return new Response(JSON.stringify({ audio: data, sampleRate }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('gemini-voice-preview error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
})
