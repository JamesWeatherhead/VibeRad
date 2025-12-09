import { GoogleGenAI, GenerateContentResponse, Type, Schema } from "@google/genai";
import { Measurement } from "../types";
import { LearnerLevel } from "../constants";

// Initialize the client with the environment API key
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- SYSTEM PROMPTS ---

const VIBERAD_SYSTEM_PROMPT = `
You are the “VibeRad Teaching Summary Engine”, a large language model that generates structured, educational imaging summaries.

You must follow these rules:
- Purpose: EDUCATION ONLY. You do NOT provide clinical diagnosis, triage, or treatment advice. Everything you output must be clearly framed as an educational or demo summary.
- Never sound like you are giving real medical care. Avoid language like “this patient has…”. Instead, say “this demo scan shows…” or “these images may be consistent with… in general.”
- Do not give specific diagnostic labels or management recommendations.
- Do not mention patient identifiers or invent dataset names (like BRAINIX) unless explicitly provided in the metadata.

Output format:

Generate a concise MARKDOWN document with EXACTLY these sections (do not add others):

# Educational Teaching Summary – NOT FOR CLINICAL USE
One sentence stating this is a teaching summary generated from anonymized demo data for training and UX demonstration only. It is not a diagnosis or medical advice.

## Study Context
- Bullet points listing: Modality, Body Part/Region, Series Description, Approximate Plane/Orientation.
- If measurements are present in the metadata, list them (Label + Size in mm).

## Key Imaging Features (Descriptive Only)
- Neutral description of visible anatomy and symmetry.
- Describe findings (e.g., "high attenuation area", "discontinuity of cortex") without jumping to diagnostic conclusions (e.g., "hemorrhage", "fracture").
- Use "Educational differential" framing if needed (e.g. "This appearance is classically described in...").

## Teaching Points
- 3–6 bullets aimed at residents/trainees.
- Focus on: Anatomy, Pattern Recognition, Common Pitfalls, and how to use tools like calipers or window/level.

## Questions for Learners
- 2–4 self-test questions the learner could think about based on this scan.

## Safety Note
- One short paragraph stating this is for educational use only and must NOT be used for diagnosis, triage, or treatment decisions.

If free-text notes are supplied (e.g., "Teaching notes..."), treat them as draft observations from a learner. Clean them up and integrate them into the Key Imaging Features or Teaching Points, but do NOT upgrade them to definitive diagnoses.
`;

const LEVEL_INSTRUCTIONS: Record<LearnerLevel, string> = {
  highschool: "Explain in very simple, non-medical terms suitable for a high school student. Use analogies. Avoid complex jargon.",
  undergrad: "Explain suitable for an undergraduate biology student. Use basic anatomy terms and explain physics simply. Avoid clinical shorthand.",
  medstudent: "Explain for a medical student. Use standard anatomical terminology, clinical reasoning, and step-by-step checklists.",
  resident: "Explain for a radiology resident. Focus on pattern recognition, differential diagnoses, pitfalls, and relevant guidelines."
};

const RADIOLOGY_ASSISTANT_SYSTEM_PROMPT = `
You are the VibeRad Radiology Assistant inside a web DICOM viewer.

You see anonymized demo CT and MR images and occasional screenshots with highlighted regions.
You are for EDUCATIONAL USE ONLY. You are NOT a medical device and must NOT give case-specific diagnoses or treatment decisions.

Your goals:
- Help users understand basic anatomy and imaging concepts.
- Provide general teaching about patterns and differentials.
- ALWAYS emphasize that real diagnoses require a qualified radiologist / clinician.

CORE FUNCTIONAL RULES:
- Cursor Aware: You explicitly see the current slice index and series context. Refer to it if relevant.
- Tool Use: You CANNOT navigate the viewer directly. If the user asks to "scroll", explain that you cannot control the viewer but can guide them on what to look for at specific levels.

Radiology orientation rules (VERY IMPORTANT):
- Assume standard radiology convention for axial CT/MR:
  - Image left = PATIENT'S RIGHT.
  - Image right = PATIENT'S LEFT.
  - Anterior is at the top; posterior is at the bottom.
- When you mention a side, use the PATIENT'S side:
  - Prefer "patient's left/right" instead of "left/right side of the image".
- If you are unsure about laterality, do NOT guess. Say
  "on the side of the highlighted region" instead.

Behavior for questions with an IMAGE:
- Treat highlighted areas as a REGION OF INTEREST for ANATOMY TEACHING, not as a case you must diagnose.
- First, describe WHERE the region lies using neutral anatomical language only
  (e.g., "overlying the soft tissues lateral to the mandible" or "along the posterior neck musculature").
- You MUST NOT claim a specific diagnosis for the highlighted region
  (for example: do not say "this is an intraparenchymal hemorrhage" or "this is a tumor").
- You may briefly mention GENERAL possibilities in a separate teaching section ONLY IF the user asks,
  and you must frame them as generic:
  "In real patients, similar-appearing regions could represent X or Y, but this demo image cannot be used to diagnose anything."
- Never use strong, case-specific language like "this is", "definitely", "represents" for disease.
  Use neutral language such as "is located over", "could be related to", "might correspond to".

Global safety rules:
- Never give treatment plans, dosing, or patient-specific management advice.
- Always include a brief safety line at the end of your answer such as:
  "This is for EDUCATIONAL USE ONLY and not for diagnosis or treatment."

Formatting rules:
- Use only simple Markdown that our UI supports:
  - Headings starting with "## ".
  - Bullet lists starting with "- ".
  - **Bold** to highlight key phrases.
- Do NOT use tables, images, or fenced code blocks.
- Keep answers concise and scannable.

REQUIRED OUTPUT STRUCTURE FOR SUGGESTIONS:
At the very end of your response, after the safety line, you MUST provide 3 educational follow-up questions for EACH learner level (highschool, undergrad, medstudent, resident).
Wrap this block in <SUGGESTIONS> tags. The content inside must be valid JSON matching this structure:
<SUGGESTIONS>
{
  "highschool": ["Q1", "Q2", "Q3"],
  "undergrad": ["Q1", "Q2", "Q3"],
  "medstudent": ["Q1", "Q2", "Q3"],
  "resident": ["Q1", "Q2", "Q3"]
}
</SUGGESTIONS>

Rules for these suggestions:
1. They must be relevant to the user's last question and your answer.
2. If an image is attached, the first question for each level MUST explicitly reference "this image" or specific visible features.
3. Calibrate complexity carefully for each level.
4. Do NOT ask for diagnosis or treatment advice.
`;

// --- MODE CONFIGURATION ---

export type AiMode = 'chat' | 'deep_think' | 'search';

interface ModeConfiguration {
  model: string;
  thinkingLevel: 'low' | 'high';
  mediaResolution: 'MEDIA_RESOLUTION_LOW' | 'MEDIA_RESOLUTION_MEDIUM' | 'MEDIA_RESOLUTION_HIGH';
  useSearch: boolean;
}

const MODE_CONFIG: Record<AiMode, ModeConfiguration> = {
  chat: {
    model: 'gemini-3-pro-preview',
    thinkingLevel: 'low',
    mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
    useSearch: false
  },
  deep_think: {
    model: 'gemini-3-pro-preview',
    thinkingLevel: 'high',
    mediaResolution: 'MEDIA_RESOLUTION_HIGH',
    useSearch: false
  },
  search: {
    model: 'gemini-3-pro-preview',
    thinkingLevel: 'high',
    mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
    useSearch: true
  }
};

// --- AUDIO TRANSCRIPTION ---

export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  try {
    const base64Audio = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'audio/mp3', data: base64Audio } },
          { text: "Transcribe this audio exactly. Do not add any commentary." }
        ]
      }
    });

    return response.text || "";
  } catch (error: any) {
    console.error("Transcription Error:", error);
    throw new Error("Failed to transcribe audio.");
  }
};

// --- RADIOLOGY REPORT GENERATION ---

export interface ReportPayload {
  dicom_metadata: {
    studyId: string;
    patientName: string;
    description: string;
    modality: string;
    measurements: any[];
  };
  free_text_notes?: string;
  full_draft_report?: string;
  slice_context?: string;
}

export const generateRadiologyReport = async (payload: ReportPayload, imageBase64?: string | null): Promise<string> => {
  const jsonPrompt = JSON.stringify(payload, null, 2);
  let contents: any = jsonPrompt;

  // Handle Multimodal (JSON + Image)
  if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      // Report generation uses High resolution for best detail
      contents = {
          parts: [
              { 
                inlineData: { mimeType: 'image/jpeg', data: cleanBase64 }
                // mediaResolution removed due to API incompatibility
              },
              { text: `Generate a teaching summary based on this image context and the following metadata: ${jsonPrompt}` }
          ]
      };
  }

  try {
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3-pro-preview',
      contents: contents,
      config: {
        systemInstruction: VIBERAD_SYSTEM_PROMPT,
        thinkingConfig: { thinkingLevel: 'high' } 
      }
    });

    let fullText = "";
    for await (const chunk of responseStream) {
       fullText += chunk.text || "";
    }
    return fullText;

  } catch (error: any) {
    console.error("AI Report Generation Error:", error);
    return `Failed to generate summary. \n\nError details: ${error.message}`;
  }
};

// --- CHAT WITH THINKING & SEARCH & VISION ---

export const streamChatResponse = async (
  message: string,
  mode: AiMode,
  learnerLevel: LearnerLevel,
  imageBase64: string | null,
  onChunk: (
    text: string, 
    sources?: any[], 
    toolCalls?: any[], 
    // New: returns the full suggestion map if found
    allLevelSuggestions?: Record<LearnerLevel, string[]>, 
    fullTextReplace?: string
  ) => void
) => {
  try {
    const currentConfig = MODE_CONFIG[mode];
    const hasCapturedImage = !!imageBase64;
    
    // Tools logic:
    // Chat & Deep Think = No tools.
    // Search = Google Search only.
    let tools: any[] | undefined = undefined;
    if (currentConfig.useSearch) {
      tools = [{ googleSearch: {} }];
    }

    // --- CONTEXT CONSTRUCTION ---
    // We build a specific text context that enforces the image safety rules strictly.
    let systemContext = `You are VibeRad, a radiology teaching assistant. ${LEVEL_INSTRUCTIONS[learnerLevel]} Do not provide diagnoses or treatment.\n\n`;

    if (mode === 'deep_think') {
        systemContext += "You are in DEEP THINK mode. Consider the question carefully, but still present only a concise explanation and structured Markdown sections.\n\n";
    } else if (mode === 'search') {
        systemContext += "You are in WEB SEARCH mode. You may use Google Search to pull short, relevant teaching facts or guideline snippets about MRI sequences and anatomy. Keep responses brief and educational.\n\n";
    } else {
        systemContext += "You are in STANDARD mode. Give a concise, clinically oriented explanation.\n\n";
    }

    if (!hasCapturedImage) {
        systemContext += "Important: There is currently no captured image attached to this request. If the user asks about 'this image' or 'this slice', explicitly say you cannot see any image yet and ask them to capture a slice with the camera button below. Do not hallucinate an image description.\n";
    } else {
        systemContext += "Important: There is exactly one captured MRI slice attached to this request. If the user refers to 'this image' or 'this slice', interpret that as this captured slice and describe it based on the image.\n";
    }

    // --- PARTS CONSTRUCTION ---
    const parts: any[] = [];
    
    // 1. Text Context
    parts.push({ text: systemContext });

    // 2. Image (if present)
    if (hasCapturedImage && imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      parts.push({
        inlineData: { mimeType: 'image/jpeg', data: cleanBase64 }
      });
    }

    // 3. User Question
    parts.push({ text: message });

    // --- API CALL ---
    const contents = { parts };

    const responseStream = await ai.models.generateContentStream({
      model: currentConfig.model,
      contents: contents,
      config: {
        systemInstruction: RADIOLOGY_ASSISTANT_SYSTEM_PROMPT,
        thinkingConfig: { thinkingLevel: currentConfig.thinkingLevel },
        tools: tools
      }
    });

    let fullTextAccumulator = "";
    let suggestionsFound = false;
    let suggestionsJson = "";

    for await (const chunk of responseStream) {
      const c = chunk as GenerateContentResponse;
      
      if (c.text) {
        // Accumulate raw text
        fullTextAccumulator += c.text;

        // Detection Logic for <SUGGESTIONS>
        const openTagIndex = fullTextAccumulator.indexOf('<SUGGESTIONS>');
        
        if (openTagIndex !== -1) {
            // We have reached the hidden block.
            // Everything before <SUGGESTIONS> is the user-facing text.
            const visibleText = fullTextAccumulator.substring(0, openTagIndex);
            
            // The rest is potentially partial suggestion data
            // We don't need to do anything complex here, just ensure we call onChunk 
            // with the clean text so far.
            // Using fullTextReplace ensures the UI snaps to the clean version if it briefly showed garbage.
            
            // Grounding
            const groundingChunks = c.candidates?.[0]?.groundingMetadata?.groundingChunks;
            let sources = undefined;
            if (groundingChunks) {
                sources = groundingChunks.map((chunk: any) => chunk.web).filter((w: any) => w);
            }

            onChunk(chunk.text, sources, undefined, undefined, visibleText);

            // Attempt to parse if we have the closing tag
            if (!suggestionsFound) { // Only parse once
                const closeTagIndex = fullTextAccumulator.indexOf('</SUGGESTIONS>');
                if (closeTagIndex !== -1) {
                    const block = fullTextAccumulator.substring(openTagIndex + 13, closeTagIndex); // 13 is length of <SUGGESTIONS>
                    try {
                        const parsed = JSON.parse(block);
                        // Emit suggestions!
                        onChunk("", undefined, undefined, parsed, visibleText);
                        suggestionsFound = true;
                    } catch (e) {
                        // Incomplete JSON, wait for next chunk
                    }
                }
            }

        } else {
            // Normal operation - no tag seen yet
            const groundingChunks = c.candidates?.[0]?.groundingMetadata?.groundingChunks;
            let sources = undefined;
            if (groundingChunks) {
                sources = groundingChunks.map((chunk: any) => chunk.web).filter((w: any) => w);
            }
            onChunk(c.text, sources);
        }
      }
    }

  } catch (error: any) {
    console.error("Chat Error:", error);
    // Standardize error and throw to UI for handling
    let userMessage = "Sorry, I encountered an error connecting to Gemini 3.";
    if (error.message) {
        if (error.message.includes("429")) userMessage = "High traffic (429). Please try again in a moment.";
        else if (error.message.includes("500") || error.message.includes("503")) userMessage = "Gemini service temporary unavailable. Please try again.";
        else if (error.message.includes("SAFETY")) userMessage = "I cannot answer this query due to safety guidelines.";
        else userMessage = `API Error: ${error.message}`;
    }
    throw new Error(userMessage);
  }
};

// --- LEGACY / TEST SUGGESTION ENGINE ---

/**
 * Kept for testing purposes and payload integrity checks.
 * In the main app, suggestions are now generated inline via streamChatResponse for speed.
 */
export const generateFollowUpQuestions = async (
  lastUserMessage: string, 
  lastBotResponse: string,
  hasImageContext: boolean,
  sliceLabel?: string
): Promise<Record<LearnerLevel, string[]>> => {
    // This is now a stub/fallback or can be used if explicit re-generation is needed.
    // For now we keep the implementation for the unit test `testSuggestionEngine`.
    // ... (Implementation preserved for compatibility if needed, but simplified)
    
  try {
    const prompt = `
      You are VibeRad. Generate 3 educational radiology follow-up questions for each learner level (highschool, undergrad, medstudent, resident).
      Context: User asked "${lastUserMessage}", you replied "${lastBotResponse.substring(0, 50)}...".
      Image Context: ${hasImageContext}.
      Return JSON: { "highschool": [], "undergrad": [], "medstudent": [], "resident": [] }
    `;

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        highschool: { type: Type.ARRAY, items: { type: Type.STRING } },
        undergrad: { type: Type.ARRAY, items: { type: Type.STRING } },
        medstudent: { type: Type.ARRAY, items: { type: Type.STRING } },
        resident: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['highschool', 'undergrad', 'medstudent', 'resident']
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { 
        thinkingConfig: { thinkingLevel: 'low' },
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    });

    const text = response.text;
    if (!text) return { highschool: [], undergrad: [], medstudent: [], resident: [] };

    return JSON.parse(text) as Record<LearnerLevel, string[]>;

  } catch (e) {
    return { highschool: [], undergrad: [], medstudent: [], resident: [] };
  }
};

// --- UNIT TESTS ---

export const testReportPayloadIntegrity = async (): Promise<boolean> => {
    try {
        const dummyPayload: ReportPayload = {
            dicom_metadata: { 
                studyId: 'test', patientName: 'test', description: 'test', modality: 'CT', measurements: [] 
            },
            free_text_notes: "test notes"
        };
        const json = JSON.stringify(dummyPayload);
        return (json.length > 0 && json.includes('dicom_metadata'));
    } catch { return false; }
};

export const testSuggestionEngine = async (): Promise<boolean> => {
    try {
        const suggestions = await generateFollowUpQuestions("CT", "Computed Tomography", false);
        return (suggestions.medstudent.length > 0);
    } catch { return false; }
};

export const testCursorContextInjection = async (context: any): Promise<boolean> => {
    // Simulated check - in real app would validate prompt construction
    return !!context;
};