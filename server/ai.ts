import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  EnergyTier,
  PotluckAnalysis,
  PotluckPayload,
  RecapStats,
  VoiceFormPayload,
} from '../src/types.ts';

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function transcribeAudioBuffer(base64Audio: string, mimeType: string): Promise<string> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }

  const normalizedMime = mimeType.split(';')[0] || 'audio/webm';
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: normalizedMime,
            data: base64Audio,
          },
        },
        {
          text: 'Transcribe this event RSVP voice note accurately in English (translating or preserving Indian names, function names like Mehendi/Sangeet/Haldi/Wedding/Reception, and numbers clearly). Return only the transcript text.',
        },
      ],
    },
  });

  return (response.text ?? '').trim();
}

export async function extractVoiceRsvp(
  transcript: string,
  availableFunctions: string[]
): Promise<Omit<VoiceFormPayload, 'transcript' | 'source'>> {
  const ai = getAiClient();
  if (!ai) {
    return fallbackExtractRsvp(transcript, availableFunctions);
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Extract structured RSVP details from this guest message.\nAvailable event functions: ${availableFunctions.join(', ')}.\n\nGuest message:\n"${transcript}"`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'You extract accurate structured RSVP records for an Indian festive event platform. If the guest gives a vague or uncertain headcount (e.g., "maybe 3 or 4", "me and the family", "depends on cousins"), set ambiguousHeadcount to true and write a concise clarificationQuestion.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          guestName: { type: Type.STRING, description: 'Full name or primary identifier of the guest' },
          phone: { type: Type.STRING, description: 'Phone number if mentioned, else empty string' },
          attending: { type: Type.BOOLEAN, description: 'Whether the guest is attending' },
          headcount: { type: Type.INTEGER, description: 'Best integer estimate of total guests attending (0 if not attending)' },
          ambiguousHeadcount: {
            type: Type.BOOLEAN,
            description: 'True if headcount was vague, ranged, or uncertain',
          },
          clarificationQuestion: {
            type: Type.STRING,
            description: 'Short follow-up question if ambiguousHeadcount is true, else empty string',
          },
          functions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Subset of available event functions the guest is attending',
          },
          dietaryNotes: { type: Type.STRING, description: 'Dietary restrictions or meal preferences' },
          arrivalNote: { type: Type.STRING, description: 'Travel, arrival date/time, or logistics note' },
        },
        required: [
          'guestName',
          'attending',
          'headcount',
          'ambiguousHeadcount',
          'functions',
          'dietaryNotes',
          'arrivalNote',
        ],
      },
    },
  });

  const raw = (response.text ?? '{}').trim();
  const parsed = JSON.parse(raw) as Partial<Omit<VoiceFormPayload, 'transcript' | 'source'>>;
  return {
    guestName: parsed.guestName || 'Guest',
    phone: parsed.phone || '',
    attending: parsed.attending ?? true,
    headcount: typeof parsed.headcount === 'number' ? parsed.headcount : parsed.attending === false ? 0 : 1,
    ambiguousHeadcount: Boolean(parsed.ambiguousHeadcount),
    clarificationQuestion: parsed.clarificationQuestion || '',
    functions: Array.isArray(parsed.functions) ? parsed.functions : [],
    dietaryNotes: parsed.dietaryNotes || '',
    arrivalNote: parsed.arrivalNote || '',
  };
}

function fallbackExtractRsvp(
  transcript: string,
  availableFunctions: string[]
): Omit<VoiceFormPayload, 'transcript' | 'source'> {
  const lower = transcript.toLowerCase();
  const notAttending =
    lower.includes("can't make") ||
    lower.includes('cannot make') ||
    lower.includes('not coming') ||
    lower.includes('unable to') ||
    lower.includes('miss it');

  const numbers = transcript.match(/\b(\d+)\b/g)?.map(Number) ?? [];
  const hasRange = /(\d+\s*(or|to|-)\s*\d+)|maybe|family|cousins|depends/i.test(transcript);
  const headcount = notAttending ? 0 : numbers[0] || 2;
  const matchedFunctions = availableFunctions.filter((fn) => lower.includes(fn.toLowerCase()));

  return {
    guestName: transcript.split(/[,.!]/)[0]?.slice(0, 40).trim() || 'Voice Guest',
    phone: '',
    attending: !notAttending,
    headcount,
    ambiguousHeadcount: !notAttending && hasRange,
    clarificationQuestion:
      !notAttending && hasRange ? 'Headcount sounded approximate — please confirm exact seats needed.' : '',
    functions: matchedFunctions.length > 0 ? matchedFunctions : notAttending ? [] : availableFunctions.slice(0, 2),
    dietaryNotes: lower.includes('jain') ? 'Jain' : lower.includes('veg') ? 'Vegetarian' : '',
    arrivalNote: '',
  };
}

export async function analyzePotluckMenu(
  dishes: PotluckPayload[],
  expectedHeadcount: number
): Promise<PotluckAnalysis> {
  const categoryCounts: Record<string, number> = {
    Starter: 0,
    Main: 0,
    Side: 0,
    Dessert: 0,
    Drink: 0,
  };
  let totalServings = 0;

  for (const d of dishes) {
    categoryCounts[d.category] = (categoryCounts[d.category] || 0) + 1;
    totalServings += Number(d.servings || 0);
  }

  const ai = getAiClient();
  if (!ai || dishes.length === 0) {
    return fallbackPotluckAnalysis(dishes, categoryCounts, totalServings, expectedHeadcount);
  }

  const dishLines = dishes
    .map((d, idx) => `${idx + 1}. "${d.dishName}" (${d.category}, ${d.servings} servings, ${d.dietary}) by ${d.guestName}`)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Expected headcount: ${expectedHeadcount} guests.\nCurrent potluck dishes:\n${dishLines}\n\nDetect near-duplicate dishes, flag category gaps against the headcount, and suggest specific dishes to balance the table.`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'You are a practical Indian potluck host assistant. Identify near-duplicates accurately (e.g. "Paneer Butter Masala" and "Butter Paneer & Naan"), flag category imbalances against headcount, and suggest concrete missing dishes.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          duplicateGroups: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                canonicalName: { type: Type.STRING },
                dishes: { type: Type.ARRAY, items: { type: Type.STRING } },
                reason: { type: Type.STRING },
              },
              required: ['canonicalName', 'dishes', 'reason'],
            },
          },
          gaps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Specific category or quantity gaps relative to expected headcount',
          },
          suggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2-3 specific dishes to request from remaining guests',
          },
          summary: {
            type: Type.STRING,
            description: 'One crisp sentence summarizing the potluck spread balance',
          },
        },
        required: ['duplicateGroups', 'gaps', 'suggestions', 'summary'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    duplicateGroups?: PotluckAnalysis['duplicateGroups'];
    gaps?: string[];
    suggestions?: string[];
    summary?: string;
  };

  return {
    duplicateGroups: parsed.duplicateGroups ?? [],
    categoryCounts,
    totalServings,
    gaps: parsed.gaps ?? [],
    suggestions: parsed.suggestions ?? [],
    summary: parsed.summary || 'Menu reviewed against expected headcount.',
  };
}

function fallbackPotluckAnalysis(
  dishes: PotluckPayload[],
  categoryCounts: Record<string, number>,
  totalServings: number,
  expectedHeadcount: number
): PotluckAnalysis {
  const gaps: string[] = [];
  if ((categoryCounts.Main || 0) < 2) gaps.push(`Only ${categoryCounts.Main || 0} Main dish(es) for ${expectedHeadcount} guests.`);
  if ((categoryCounts.Drink || 0) === 0) gaps.push('No Drinks / Beverages pledged yet.');
  if ((categoryCounts.Side || 0) === 0) gaps.push('No Sides / Breads / Rice pledged yet.');
  if ((categoryCounts.Dessert || 0) > (categoryCounts.Main || 0) + 1) {
    gaps.push(`Dessert-heavy spread (${categoryCounts.Dessert} desserts vs ${categoryCounts.Main} mains).`);
  }

  return {
    duplicateGroups: [],
    categoryCounts,
    totalServings,
    gaps,
    suggestions: ['Jeera Rice or Garlic Naan (Side)', 'Fresh Lime Soda / Kokum Cooler (Drink)', 'Dal Makhani or Thai Curry (Main)'],
    summary: `${dishes.length} dishes covering ${totalServings} total servings for ~${expectedHeadcount} expected guests.`,
  };
}

export function classifyTrackEnergy(trackName: string, genre?: string): { bpm: number; energyTier: EnergyTier } {
  const text = `${trackName} ${genre || ''}`.toLowerCase();
  if (
    text.includes('sufi') ||
    text.includes('acoustic') ||
    text.includes('lullaby') ||
    text.includes('ballad') ||
    text.includes('chill') ||
    text.includes('classical') ||
    text.includes('ambient') ||
    text.includes('baaliyan') ||
    text.includes('kun faya')
  ) {
    return { bpm: 80, energyTier: 'chill' };
  }
  if (
    text.includes('dance') ||
    text.includes('bhangra') ||
    text.includes('electronic') ||
    text.includes('hip') ||
    text.includes('party') ||
    text.includes('rock') ||
    text.includes('gallan') ||
    text.includes('ilahi')
  ) {
    return { bpm: 126, energyTier: 'high' };
  }
  return { bpm: 104, energyTier: 'mid' };
}

export async function generateRecapNarrative(stats: RecapStats): Promise<string> {
  const ai = getAiClient();
  if (!ai) {
    return stats.narrative;
  }

  const promptData = {
    eventName: stats.event.name,
    type: stats.event.type,
    location: stats.event.location,
    dates: `${stats.event.date_start} to ${stats.event.date_end}`,
    modulesEnabled: stats.event.modules_enabled,
    voiceform: stats.voiceform,
    ledger: stats.ledger,
    album: stats.album,
    potluck: stats.potluck,
    playlist: stats.playlist,
  };

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Write one warm, factual, 2-3 sentence Year-in-Review recap paragraph summarizing this event strictly from these real database numbers (never invent metrics not present in the JSON):\n${JSON.stringify(promptData, null, 2)}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'You write concise, celebratory yet grounded event recaps for Utsav. Cite exact rupee amounts (₹), guest counts, photo counts, dish counts, and song titles from the provided JSON. Keep it to one crisp paragraph under 60 words.',
    },
  });

  return (response.text ?? stats.narrative).trim();
}
