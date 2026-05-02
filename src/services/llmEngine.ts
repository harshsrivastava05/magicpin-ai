import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

// Initialize the API using process.env
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

export const generateMessage = async (
  category: any,
  merchant: any,
  trigger: any,
  customer: any
) => {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          body: {
            type: SchemaType.STRING,
            description: 'The highly compelling WhatsApp message body.'
          },
          cta: {
            type: SchemaType.STRING,
            description: 'The type of CTA used. Must be "binary_yes_no", "multi_choice_slot", "open_ended", or "none".'
          },
          rationale: {
            type: SchemaType.STRING,
            description: 'A 1-2 sentence explanation of why this message works (e.g. proof, urgency, curiosity levers used).'
          }
        },
        required: ['body', 'cta', 'rationale']
      }
    }
  });

  const prompt = `You are Vera, an expert AI marketing assistant for magicpin merchants.
Your goal is to compose a single, highly compelling WhatsApp message to a merchant (or occasionally to a customer on behalf of a merchant).

### HARD CONSTRAINTS:
1. ONLY output JSON in the requested format.
2. DO NOT fabricate any numbers, facts, competitors, or research. Use ONLY the data provided below.
3. Be CONCISE. Max 2-3 sentences.
4. Voice: MUST match the category taboos and tones. E.g., if Dentist, use clinical terms and "Dr." prefix. Avoid promotional jargon like "10% off".
5. Use Levers: Use at least 2 of these: Proof (verifiable numbers), Urgency (window closing), Curiosity (want to see?), Single Binary CTA (Reply YES/NO).
6. Intent: Directly address the "Trigger Kind" and "Trigger Payload". DO NOT send a generic "improve profile" nudge if the trigger is about a perf_dip or a festival.

### CONTEXT:
---
CATEGORY DATA:
Name: ${category?.slug}
Tone rules: ${JSON.stringify(category?.voice || {})}
Offers to use: ${JSON.stringify(category?.offer_catalog || [])}

MERCHANT DATA:
Name: ${merchant?.identity?.name}
Owner: ${merchant?.identity?.owner_first_name}
Locality: ${merchant?.identity?.locality}
Performance (30d): ${JSON.stringify(merchant?.performance || {})}
Active Offers: ${JSON.stringify(merchant?.offers || [])}

TRIGGER DATA:
Kind: ${trigger?.kind}
Payload: ${JSON.stringify(trigger?.payload?.payload || {})}
Urgency: ${trigger?.urgency}

CUSTOMER DATA (if applicable):
${customer ? JSON.stringify(customer.payload) : 'N/A (This message is merchant-facing)'}
---

Draft the message now.
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Failed to parse LLM response: ' + text);
  }
};
