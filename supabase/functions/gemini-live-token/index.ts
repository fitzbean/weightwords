import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenAI } from "@google/genai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Latest Gemini Live model with native audio dialog.
const LIVE_MODEL = 'gemini-3.1-flash-live-preview';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Ephemeral tokens live on the v1alpha surface. The long-lived GEMINI_API_KEY
    // never leaves the server; the browser only ever receives this short-lived token.
    const ai = new GoogleGenAI({
      apiKey: Deno.env.get('GEMINI_API_KEY'),
      httpOptions: { apiVersion: 'v1alpha' },
    });

    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        // Single use: one Live session per minted token.
        uses: 1,
        // Token itself is accepted for 30 min; a new session must be opened within 2 min.
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(),
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });

    return new Response(JSON.stringify({ token: token.name, model: LIVE_MODEL }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('gemini-live-token error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
})
