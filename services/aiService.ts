
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Measurement } from "../types";

// Initialize the client with the environment API key
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- RADIOLOGY REPORT GENERATION ---

export const generateRadiologyReport = async (
  measurements: Measurement[],
  patientName: string,
  studyDescription: string,
  modality: string
): Promise<string> => {
  
  if (measurements.length === 0) {
    return "No measurements provided. Unable to generate report.";
  }

  // Format measurements for the prompt
  const measurementText = measurements.map((m, i) => {
    return `- Measurement ${i + 1} (${m.label || 'Unlabeled'}): ${(m.value * 0.5).toFixed(1)} mm (Slice ${m.sliceIndex + 1})`;
  }).join("\n");

  const prompt = `
    You are an expert Radiologist Assistant. 
    Write a concise, professional medical imaging report based *only* on the following findings.
    
    Context:
    - Patient: ${patientName}
    - Study: ${studyDescription} (${modality})
    
    Measurements Taken:
    ${measurementText}
    
    Instructions:
    1. Structure the response with sections: "Technique", "Findings", and "Impression".
    2. In "Findings", describe the measurements in a professional tone. If a label exists (e.g., "Tumor"), refer to it specifically.
    3. In "Impression", summarize the key takeaways based on the size of the measured findings.
    4. Use standard medical terminology.
    5. Keep it strictly based on the provided data. Do not hallucinate other anatomical findings not mentioned.
    
    Output Format: Markdown.
  `;

  try {
    // Use gemini-3-pro-preview with thinking for high quality reports
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 16384 } // Moderate thinking budget for reports
      }
    });

    return response.text || "Error: No response generated.";
  } catch (error: any) {
    console.error("AI Report Generation Error:", error);
    return `Failed to generate report. \n\nError details: ${error.message}`;
  }
};

// --- CHAT WITH THINKING & SEARCH & VISION ---

export const streamChatResponse = async (
  message: string,
  useThinking: boolean,
  useSearch: boolean,
  imageBase64: string | null,
  onChunk: (text: string, sources?: any[]) => void
) => {
  try {
    let model = 'gemini-2.5-flash';
    let config: any = {};
    let tools: any[] = [];
    let contents: any = message;

    // Construct Payload
    if (imageBase64) {
      // Multimodal Request
      // Remove data prefix if present
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      
      contents = {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          },
          { text: message }
        ]
      };
      
      // Upgrade to Pro if thinking is requested, otherwise Flash is fine for vision
      if (useThinking) {
        model = 'gemini-3-pro-preview';
        config = {
            thinkingConfig: { thinkingBudget: 32768 }
        };
      }
    } else if (useThinking) {
      model = 'gemini-3-pro-preview';
      config = {
        thinkingConfig: { thinkingBudget: 32768 }
      };
    } else if (useSearch) {
      model = 'gemini-2.5-flash';
      tools = [{ googleSearch: {} }];
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
      if (c.text) {
        // Check for grounding metadata
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

// --- IMAGE ANALYSIS ---

export const analyzeUploadedImage = async (
    file: File, 
    prompt: string,
    onChunk: (text: string) => void
) => {
    try {
        // Convert file to base64
        const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result as string;
                // Remove data URL prefix (e.g. "data:image/jpeg;base64,")
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });

        // Use gemini-3-pro-preview for advanced multimodal analysis
        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-3-pro-preview',
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: file.type,
                            data: base64Data
                        }
                    },
                    { text: prompt }
                ]
            }
        });

        for await (const chunk of responseStream) {
            const c = chunk as GenerateContentResponse;
            if (c.text) {
                onChunk(c.text);
            }
        }

    } catch (error: any) {
        console.error("Image Analysis Error:", error);
        onChunk(`\n[System Error]: ${error.message}`);
    }
}