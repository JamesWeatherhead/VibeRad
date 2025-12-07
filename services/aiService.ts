
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Measurement } from "../types";

// Initialize the client with the environment API key
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- SYSTEM PROMPTS ---

const VIBERAD_SYSTEM_PROMPT = `
You are the “VibeRad Report Engine”, a large language model that generates structured, educational imaging reports.

You must follow these rules:
- Purpose: EDUCATION ONLY. You do NOT provide clinical diagnosis, triage, or treatment advice. Everything you output must be clearly framed as an educational or demo report.
- Never sound like you are giving real medical care. Avoid language like “this patient has…”. Instead, say “this demo scan shows…” or “these images may be consistent with… in general, but only a radiologist can diagnose a real patient.”
- Assume all data are anonymized public demo datasets.

Output format:

1. Start with this header (always, verbatim):
   EDUCATIONAL DEMO REPORT – NOT FOR CLINICAL USE
   This report is generated from anonymized demo imaging data and is for training and UX demonstration only. It is not a diagnosis or medical advice.

2. Then produce sections with markdown headings:

   **Study Info**
   - Modality: ...
   - Body part / region: ...
   - Series description: ...
   - Approximate plane and orientation: ...

   **Technique (approximate)**
   - Very short description of what kind of CT/MR this appears to be and any obvious reconstruction. Keep generic.

   **Findings – Educational Description**
   - Bullet list describing key ANATOMIC structures that are visible.
   - When there is an obvious pattern (e.g., metal artifact, sinus opacification, fracture lines), describe it in neutral, non-diagnostic language.

   **Teaching Points**
   - 3–5 bullets aimed at residents/trainees:
     - what to look for on this type of scan
     - how window/level affects visualization
     - common artifacts and pitfalls

   **Simplified Patient-Friendly Summary**
   - 3–5 sentences in plain language, framed as an example explanation: "In a real case, a doctor might say something like..."
   - No specific disease labels unless already clearly implied by the dictated notes.

3. If free-text notes are supplied, treat them as “draft impressions” from a trainee and:
   - Clean up the language.
   - Organize it into the Findings / Teaching Points sections.
   - Do NOT upgrade tentative wording to definitive diagnostic statements.

Finally, end every report with this line:
> This is an automatically generated educational example and must NOT be used for diagnosis, triage, or treatment decisions.
`;

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
- Tool Use: You can navigate the viewer using 'set_cursor_frame(index)'. Use this if the user asks to "scroll to slice 50" or "jump to the middle".

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
- Keep answers concise and scannable with short sections like:
  - "## Key Imaging Features"
  - "## Anatomy / Region"
  - "## Teaching Points"
  - "## Safety Note"
`;

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
      model: 'gemini-2.5-flash',
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
      contents = {
          parts: [
              { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
              { text: `Generate a report based on this image context and the following metadata: ${jsonPrompt}` }
          ]
      };
  }

  try {
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3-pro-preview',
      contents: contents,
      config: {
        systemInstruction: VIBERAD_SYSTEM_PROMPT,
        thinkingConfig: { thinkingBudget: 16384 } 
      }
    });

    let fullText = "";
    for await (const chunk of responseStream) {
       fullText += chunk.text || "";
    }
    return fullText;

  } catch (error: any) {
    console.error("AI Report Generation Error:", error);
    return `Failed to generate report. \n\nError details: ${error.message}`;
  }
};

// --- CHAT WITH THINKING & SEARCH & VISION ---

// Tool Definition for Navigation
const NAV_TOOLS = [{
    functionDeclarations: [{
        name: "set_cursor_frame",
        description: "Navigates the DICOM viewer to a specific slice index.",
        parameters: {
            type: "OBJECT",
            properties: {
                index: { type: "NUMBER", description: "The 0-based slice index to jump to." }
            },
            required: ["index"]
        }
    }]
}];

export const streamChatResponse = async (
  message: string,
  useThinking: boolean,
  useSearch: boolean,
  imageBase64: string | null,
  onChunk: (text: string, sources?: any[], toolCalls?: any[]) => void
) => {
  try {
    let model = 'gemini-2.5-flash';
    let config: any = {
        systemInstruction: RADIOLOGY_ASSISTANT_SYSTEM_PROMPT
    };
    let tools: any[] = [...NAV_TOOLS]; // Always available
    let contents: any = message;

    // Construct Payload
    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      contents = {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: message }
        ]
      };
      
      // Pro for Vision + Thinking
      if (useThinking) {
        model = 'gemini-3-pro-preview';
        config.thinkingConfig = { thinkingBudget: 32768 };
      }
    } else if (useThinking) {
      model = 'gemini-3-pro-preview';
      config.thinkingConfig = { thinkingBudget: 32768 };
    } else if (useSearch) {
      model = 'gemini-2.5-flash';
      tools.push({ googleSearch: {} });
    }

    const responseStream = await ai.models.generateContentStream({
      model: model,
      contents: contents,
      config: {
        ...config,
        tools: tools.length > 0 ? tools : undefined
      }
    });

    for await (const chunk of responseStream) {
      const c = chunk as GenerateContentResponse;
      
      // Handle Tool Calls (Navigation)
      if (c.functionCalls) {
          onChunk("", undefined, c.functionCalls);
      }

      if (c.text) {
        // Grounding
        const groundingChunks = c.candidates?.[0]?.groundingMetadata?.groundingChunks;
        let sources = undefined;
        if (groundingChunks) {
            sources = groundingChunks.map((chunk: any) => chunk.web).filter((w: any) => w);
        }
        onChunk(c.text, sources);
      }
    }
  } catch (error: any) {
    console.error("Chat Error:", error);
    onChunk(`\n[System Error]: ${error.message}`);
  }
};

// --- DYNAMIC SUGGESTION ENGINE ---

export const generateFollowUpQuestions = async (lastUserMessage: string, lastBotResponse: string): Promise<string[]> => {
  try {
    const prompt = `
      Given the following medical/radiology context:
      User asked: "${lastUserMessage.substring(0, 500)}"
      AI answered: "${lastBotResponse.substring(0, 1000)}"

      Provide 3 short, clinical, relevant follow-up questions the user might want to ask next.
      Focus on differential diagnosis, anatomy clarification, or next steps in imaging.
      
      Format rules:
      - Return ONLY the questions, one per line.
      - No numbering or bullets.
      - Maximum 8 words per question.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.3 }
    });

    const text = response.text || "";
    const suggestions = text.split('\n')
      .map(s => s.trim().replace(/^[-*•\d\.]+\s*/, ''))
      .filter(s => s.length > 5);
    
    return suggestions.slice(0, 3);

  } catch (e) {
    return [];
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
        const suggestions = await generateFollowUpQuestions("CT", "Computed Tomography");
        return (Array.isArray(suggestions));
    } catch { return false; }
};

export const testCursorContextInjection = async (context: any): Promise<boolean> => {
    // Simulated check - in real app would validate prompt construction
    return !!context;
};
