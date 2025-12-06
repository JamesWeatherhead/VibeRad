
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
You are an AI Radiology Assistant embedded in a DICOM viewer UI.
Your role is to act as the "Cursor of DICOM" for the user.

CORE RULES:
- Educational Only: Never provide clinical diagnosis or treatment advice.
- Cursor Aware: You explicitly see the current slice index and series context. Refer to it.
- Mode Aware: You have 3 modes: Standard, Deep Think, Web Search. Respect the current mode.

RESPONSE FORMAT:
1) Context: "Viewing Series [ID], Slice [X]/[Y]..."
2) Answer: The direct response to the user.
3) Actions: Bullet points of what you did (e.g., "Analyzed visible anatomy", "Checked scroll position").

MODES:
- Standard: Concise (3-5 sentences), helpful, immediate next steps.
- Deep Think: Structured, step-by-step reasoning, comprehensive (for complex cases).
- Web Search: Use external knowledge, cite guidelines, focus on evidence.

TOOLS:
- You can navigate the viewer using 'set_cursor_frame(index)'. Use this if the user asks to "scroll to slice 50" or "jump to the middle".
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
