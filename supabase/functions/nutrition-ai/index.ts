import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenAI, Type } from "@google/genai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { description, type } = await req.json();
    
    const ai = new GoogleGenAI({ apiKey: Deno.env.get('GEMINI_API_KEY') });
    
    if (type === 'nutrition') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze the following meal description: "${description}". 
        Break it down into individual components (e.g., if it says 'eggs and toast', create separate entries for eggs and toast). 
        For each item, estimate calories and macros (Protein, Carbs, Fat in grams). 
        Return a structured JSON response.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: 'Name of the specific food component' },
                    calories: { type: Type.NUMBER, description: 'Estimated calories for this component' },
                    protein: { type: Type.NUMBER, description: 'Protein in grams' },
                    carbs: { type: Type.NUMBER, description: 'Carbs in grams' },
                    fat: { type: Type.NUMBER, description: 'Fat in grams' },
                  },
                  required: ["name", "calories", "protein", "carbs", "fat"],
                }
              },
              totalCalories: { type: Type.NUMBER, description: 'Sum of all item calories' },
              confidence: { type: Type.NUMBER, description: 'Confidence level from 0 to 1' },
            },
            required: ["items", "totalCalories", "confidence"],
          },
        },
      });

      return new Response(JSON.stringify(JSON.parse(response.text)), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
    
    if (type === 'advice') {
      const { profile, recentLogs } = await req.json();
      const logsSummary = recentLogs.map((l: any) => `${l.name} (${l.calories}kcal)`).join(', ');
      const prompt = `
        User Profile:
        - Age: ${profile.age}
        - Weight: ${profile.weightLbs} lbs
        - Height: ${profile.heightFt}'${profile.heightIn}"
        - Goal: ${profile.weightGoal}
        - Daily Target: ${profile.dailyCalorieTarget} kcal
        
        Recent Food: ${logsSummary}
        
        Provide a short, motivating 2-sentence piece of advice for this user's nutrition journey.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      return new Response(JSON.stringify({ advice: response.text || "Keep up the good work!" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    throw new Error('Invalid request type');
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
})
