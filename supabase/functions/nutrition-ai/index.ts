import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

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
    const body = await req.json();
    const { description, type, item, image } = body;
    
    const ai = new GoogleGenAI({ apiKey: Deno.env.get('GEMINI_API_KEY') });
    
    if (type === 'nutrition') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze the following meal description: "${description}". 
        Break it down into individual components (e.g., if it says 'eggs and toast', create separate entries for eggs and toast). 
        For each item, estimate calories and macros (Protein, Carbs, Fat in grams).
        
        IMPORTANT: Keep food names concise and clean:
        - Use title case (first letter capitalized)
        - Remove articles (a, an, the)
        - Remove unnecessary words (about, approximately, some, just, really)
        - Keep essential descriptors (e.g., "whole wheat", "grilled", "fried")
        - Include quantities if specified (e.g., "2 slices", "1 cup")
        - Maximum 4 words per item name
        - Examples: "2 Slices Bread" not "Two slices of bread", "Grilled Chicken" not "A piece of grilled chicken"
        
        Return a structured JSON response.`,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: 'Concise name of the food component (max 4 words, title case)' },
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
    
    if (type === 'item-insight') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Provide a quick nutritional insight for: "${item.name}" (${item.calories} kcal, P: ${item.protein}g, C: ${item.carbs}g, F: ${item.fat}g).
        
        Give a brief, engaging summary that includes:
        1. A one-line verdict (is this generally healthy, moderate, or indulgent?)
        2. 2-3 key nutritional highlights (good or bad)
        3. A quick tip for making it healthier or pairing it well
        
        Keep it concise and friendly - max 3-4 sentences total.`,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: { type: Type.STRING, description: 'One word: healthy, moderate, or indulgent' },
              summary: { type: Type.STRING, description: 'Brief 2-3 sentence nutritional insight' },
              highlights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING, description: 'The highlight text' },
                    isPositive: { type: Type.BOOLEAN, description: 'True if this is a positive/good thing' },
                  },
                  required: ["text", "isPositive"],
                }
              },
              tip: { type: Type.STRING, description: 'Quick tip for improvement or pairing' },
            },
            required: ["verdict", "summary", "highlights", "tip"],
          },
        },
      });

      return new Response(JSON.stringify(JSON.parse(response.text)), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (type === 'nutrition-label') {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: image,
                },
              },
              {
                text: `Look at this nutrition facts label image and extract the key nutrition information.
                
                Return a simple text description that includes:
                - Serving size (if visible)
                - Calories per serving
                - Any other visible macros (protein, carbs, fat)
                
                Format it as a natural description like: "1 serving (28g), 150 calories, 3g protein, 15g carbs, 9g fat"
                
                If you cannot read the label clearly, return null.`,
              },
            ],
          },
        ],
      });

      const nutritionText = response.text?.trim() || null;
      
      return new Response(JSON.stringify({ nutritionText }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (type === 'advice') {
      const { profile, recentLogs } = body;
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
