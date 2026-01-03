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
    const { description, type, item, image, productImage, nutritionImage } = body;
    
    const ai = new GoogleGenAI({ apiKey: Deno.env.get('GEMINI_API_KEY') });
    
    if (type === 'nutrition') {
      // Check if this is just a product name (no nutrition info provided)
      const wordCount = description.split(' ').length;
      // Allow numbers in brand names like "99s" but not standalone nutrition numbers
      const hasNutritionNumbers = /\b\d+\s?(calories?|kcal|g|grams?|oz|lbs?|mg|mcg)\b/i.test(description);
      const hasNutritionTerms = /calories|kcal|protein|carbs|fat|grams?|g\b/i.test(description);
      const isJustProductName = wordCount <= 10 && !hasNutritionNumbers && !hasNutritionTerms;
      
      console.log('Nutrition request analysis:', {
        description,
        wordCount,
        hasNutritionNumbers,
        hasNutritionTerms,
        isJustProductName
      });
      
      if (isJustProductName) {
        console.log('Triggering web search for product nutrition');
        // Use web search for product nutrition
        try {
          const webResponse = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: `Search for nutrition facts for: "${description}". 
            IMPORTANT: 
            - Find the official nutrition information from the manufacturer's website or reliable sources
            - Look for the specific product mentioned (e.g., "Gatorade Zero" has 0-10 calories depending on flavor)
            - If multiple variations exist, choose the most common/original version
            - Always verify the information matches the exact product name
            
            Return ONLY a valid JSON object (no markdown, no code blocks) with these fields:
            {
              "name": "Full product name",
              "calories": number,
              "protein": number,
              "carbs": number,
              "fat": number,
              "servingSize": "serving size description",
              "sourceUrl": "URL where you found this",
              "confidence": number between 0 and 1
            }`,
            config: {
              tools: [{ googleSearch: {} }],
            },
          });
          
          console.log('Web search raw response:', webResponse.text);
          // Extract JSON from response (may have markdown code blocks)
          let jsonText = webResponse.text || '';
          // Remove markdown code blocks if present
          jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const webResult = JSON.parse(jsonText);
          console.log('Web search parsed result:', webResult);
          
          // Convert to expected format
          const responseData = {
            items: [{
              name: webResult.name,
              calories: webResult.calories,
              protein: webResult.protein,
              carbs: webResult.carbs,
              fat: webResult.fat,
            }],
            totalCalories: webResult.calories,
            confidence: webResult.confidence,
            source: 'web',
            sourceUrl: webResult.sourceUrl,
            servingSize: webResult.servingSize,
          };
          console.log('Returning web search response:', responseData);
          return new Response(JSON.stringify(responseData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } catch (error) {
          console.error('Web search failed, falling back to estimation:', error);
          // Fall back to estimation if web search fails
        }
      }
      
      // Regular estimation for meals or when web search fails
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

      const result = JSON.parse(response.text);
      result.source = 'estimated';
      
      return new Response(JSON.stringify(result), {
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

                IMPORTANT: Try to identify what product this is from any visible text, branding, or context in the image.
                
                Return a simple text description in this format:
                "[Product Name], [serving size], [calories] calories, [protein]g protein, [carbs]g carbs, [fat]g fat"
                
                Examples:
                - "Cheerios cereal, 1 cup (28g), 100 calories, 3g protein, 20g carbs, 2g fat"
                - "Coca-Cola, 12 fl oz can, 140 calories, 0g protein, 39g carbs, 0g fat"
                - "Greek yogurt, 1 container (150g), 120 calories, 15g protein, 8g carbs, 0g fat"
                
                If you cannot identify the product name, use a generic description based on what you can infer (e.g., "Granola bar", "Chips", "Soda").
                
                If you cannot read the label clearly at all, return null.`,
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

    if (type === 'nutrition-label-dual') {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: productImage,
                },
              },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: nutritionImage,
                },
              },
              {
                text: `I'm showing you two images of a food product:
                1. The first image shows the FRONT of the product (brand name, product name, packaging)
                2. The second image shows the NUTRITION FACTS label
                
                Please identify the product and extract the nutrition information.
                
                Return a simple text description in this format:
                "[Product Name by Brand], [serving size], [calories] calories, [protein]g protein, [carbs]g carbs, [fat]g fat"
                
                Examples:
                - "Cheerios by General Mills, 1 cup (28g), 100 calories, 3g protein, 20g carbs, 2g fat"
                - "Coca-Cola Classic, 12 fl oz can, 140 calories, 0g protein, 39g carbs, 0g fat"
                - "Chobani Greek Yogurt Vanilla, 1 container (150g), 120 calories, 15g protein, 8g carbs, 0g fat"
                
                Be specific with the product name - include flavor, variety, or type if visible.
                
                If you cannot read either image clearly, return null.`,
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
