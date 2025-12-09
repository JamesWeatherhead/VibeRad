# VibeRad: Radiology Education Reimagined with Gemini 3 Pro

**VibeRad** is an AI-powered DICOM viewer and radiology teaching assistant designed to *reimagine learning* and *accelerate discovery*. Built for the **Google DeepMind - Vibe Code with Gemini 3 Pro** Kaggle hackathon, this application bridges the gap between complex medical imaging and accessible education using the latest advancements in reasoning and native multimodality from Gemini 3 Pro.

The core codebase was generated with Gemini 3 Pro in AI Studio, with human review and iteration, for the 2025 Google DeepMind – Vibe Code with Gemini 3 Pro in AI Studio Kaggle competition.

![VibeRad viewer and AI Assistant](./viberad-screenshot.png)

## The Vibe
Radiology is notoriously difficult to learn. VibeRad acts as an intelligent teaching assistant beside the student, capable of seeing what they see, reasoning through complex anatomy, and grounding findings in real-world medical guidelines.

> **Note:** This application is for **EDUCATIONAL USE ONLY**. It uses anonymized demo data and is not a medical device.

## Key Features

### Advanced Reasoning with Gemini 3 Pro
VibeRad uses **Gemini 3 Pro Preview** exclusively for all AI interactions, leveraging `thinking_level` to control reasoning depth.
- **Deep Think Mode:** Uses `thinking_level = "high"` and `media_resolution_high` to reason through complex anatomical relationships and fine details before answering.
- **Chat Mode:** Uses `thinking_level = "low"` for low-latency, conversational interactions.
- **Search Mode:** Uses `thinking_level = "high"` combined with Google Search to ground answers in medical literature.

### Camera-based Multimodality
To ensure transparency and control, VibeRad uses an explicit **capture-based vision system**:
- **Opt-in Vision:** Gemini 3 Pro does not passively watch the viewport. The user must click the **Capture 📸** button to explicitly send the current slice to the AI.
- **Persistent Context:** Once captured, that specific slice remains the "active context" for all subsequent questions until cleared or replaced.
- **No Hallucination:** If no image is captured, Gemini 3 is instructed to explicitly state that it cannot see the image, preventing accidental hallucinations about unseen data.
- **High Fidelity:** When using Deep Think mode, the captured image is processed with `media_resolution_high` for maximum anatomical detail.

### Grounded in Reality
Using the **Google Search Tool**, VibeRad can cross-reference imaging findings with up-to-date medical guidelines and literature, reducing hallucinations and giving students citation-style links for further reading.

### Full-Featured DICOM Viewer
Unlike static chat interfaces, VibeRad is a fully functional DICOMweb viewer built from scratch in React:
- **Tools:** Window/Level (Contrast), Pan, Zoom, Scroll, Measure.
- **Segmentation:** Paint brush tools for anatomical highlighting.
- **Connectivity:** Connects read-only to public DICOMweb endpoints (for example, the Orthanc demo server).

## Suggested demo flow

This walkthrough is the quickest way to see the app in action using the provided demo data.

**3 Steps: (1) Pick a series, (2) capture a slice with the camera, (3) ask VibeRad to teach you what you are seeing.**

1.  **Start VibeRad**: Launch the app and acknowledge the safety disclaimer (Educational Use Only).
2.  **Step 1 – Pick a series**: Select a brain MRI study. In the bottom "Series browser," select a distinct sequence (e.g., T1/SE/extrp or T2 FLAIR) to load it.
3.  **Step 2 – Capture a slice**: Scroll to an anatomical slice of interest. Click the **Camera 📸** button next to the chat input. Note that a thumbnail of the slice appears, indicating Gemini 3 Pro (preview) can now "see" this specific view.
4.  **Step 3 – Ask VibeRad**: Ensure the mode is set to **Chat** (Low Thinking) and the Teaching Level (bottom right) is set to **Med**. Ask: "What am I looking at on this slice?" or click a suggestion. The AI will describe the anatomy visible in your captured image.
5.  **Deep Think Mode**: Switch the mode to **Deep Think** (High Thinking). Click one of the suggested follow-up chips (e.g., "Key structures" or "Step-by-step"). Gemini 3 Pro will reason more deeply to generate a structured, Markdown-formatted teaching explanation.
6.  **Adjust Learner Level**: Change the Teaching Level from **Med** to **HS** (High School) or **Resident**. Notice how the "Suggested Follow-ups" immediately update to match the new complexity level while maintaining context of the same captured slice.
7.  **Search Mode (Optional)**: Switch to **Search** mode. Ask a question like "What do guidelines say about reporting this anatomy?" Gemini will use Google Search grounding to provide a concise answer with cited links.

*All AI interactions run on `gemini-3-pro-preview`. The camera capture is required for multimodal reasoning to ensure the AI analyzes the exact pixel data you are viewing.*

## Tech Stack & Implementation

- **Framework:** React 19.2.1 + TypeScript + Tailwind CSS
- **AI SDK:** `@google/genai`
- **Models:**
  - `gemini-3-pro-preview` (All AI modes run on Gemini 3 Pro Preview)
  - **Context Window:** 1M input tokens / 64k output tokens.
  - **Knowledge Cutoff:** Jan 2025.
- **Protocol:** DICOMweb (QIDO-RS, WADO-RS)

### Code Highlights
- **`aiService.ts`**: Centralized logic for streaming chat, handling `thinking_level`, `media_resolution`, and managing tool calls (like navigating the viewer via AI).
- **`ViewerCanvas.tsx`**: High-performance Canvas API rendering for DICOM frames and segmentation layers.
- **`AiAssistantPanel.tsx`**: A dedicated workflow that aggregates measurements and metadata to help learners describe what they see and capture teaching notes. The assistant does not generate clinical reports or treatment recommendations.

## Usage

1. **API Key:** The app requires a valid Google Cloud API Key with access to the Gemini API. In AI Studio, this is handled via the `process.env.API_KEY` injection.
2. **Data Source:** By default, the app connects read-only to anonymized public DICOM studies (for example, the Orthanc demo server at `demo.orthanc-server.com`). No real patient PHI is used or required.
3. **Safety:** Upon launch, users must acknowledge the safety disclaimer.

## Hackathon Tracks
- **Education:** Reimagining how medical students and residents learn radiology.
- **Health:** Improving future patient care by training better doctors.
- **Technology:** Pushing the boundaries of what's possible in a browser-based AI app.

---
*Built using Google AI Studio.*

---

## Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View the app in AI Studio: https://ai.studio/apps/drive/1pCMrggBue_gNE9IhzjN-KEdLm8cVPGjW

### Run Locally
Prerequisites: a recent version of Node.js.

1. Install dependencies: `npm install`
2. Set the `API_KEY` in `.env.local` to your Gemini API key
3. Run the app: `npm run dev`