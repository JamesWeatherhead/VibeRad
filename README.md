# VibeRad: Radiology Education Reimagined with Gemini 3 Pro

**VibeRad** is an AI-powered DICOM viewer and radiology teaching assistant designed to "reimagine learning" and "accelerate discovery." Built for the **Google DeepMind - Vibe Code with Gemini 3 Pro** Kaggle hackathon, this application bridges the gap between complex medical imaging and accessible education using the latest advancements in reasoning and native multimodality from Gemini 3 Pro.

All code was written by Gemini 3 Pro for the 2025 Kaggle Google DeepMind - Vibe Code with Gemini 3 Pro in AI Studio competition.

<img width="1187" height="815" alt="Screenshot 2025-12-06 at 20 09 39" src="https://github.com/user-attachments/assets/a4fc133e-0567-456a-bf4e-088921f20969" />

## The Vibe
Radiology is notoriously difficult to learn. VibeRad acts as an intelligent copilot, sitting beside the student, capable of seeing what they see, reasoning through complex anatomy, and grounding findings in real-world medical guidelines.

> **Note:** This application is for **EDUCATIONAL USE ONLY**. It uses anonymized demo data and is not a medical device.

## Key Features

### Advanced Reasoning with Gemini 3 Pro
VibeRad leverages the `thinkingConfig` of **Gemini 3 Pro Preview** to provide "Deep Think" responses.
- **Deep Think Mode:** Uses a high `thinkingBudget` (32k tokens) to reason through complex anatomical relationships before answering.
- **Standard Mode:** Uses `gemini-2.5-flash` for low-latency, conversational interactions.

### Native Multimodality
- **Vision:** The AI "sees" the current DICOM slice and viewport state to answer context-aware questions (e.g., "What region is highlighted?").
- **Audio:** Integrated dictation uses Gemini to transcribe voice notes directly into the report engine, bypassing traditional speech-to-text libraries.

### Grounded in Reality
Using the **Google Search Tool**, VibeRad can cross-reference imaging findings with up-to-date medical guidelines and literature, reducing hallucinations and providing students with citation-style sources.

### Full-Featured DICOM Viewer
Unlike static chat interfaces, VibeRad is a fully functional DICOMweb viewer built from scratch in React:
- **Tools:** Window/Level (Contrast), Pan, Zoom, Scroll, Measure.
- **Segmentation:** Paint brush tools for anatomical highlighting.
- **Diagnostics:** Auto-detects and configures connections to public DICOM servers (Orthanc/AWS).

## Tech Stack & Implementation

- **Framework:** React 19 + Tailwind CSS
- **AI SDK:** `@google/genai`
- **Models:**
  - `gemini-3-pro-preview` (Report Generation, Deep Reasoning)
  - `gemini-2.5-flash` (Chat, Search, Transcription)
- **Protocol:** DICOMweb (QIDO-RS, WADO-RS)

### Code Highlights
- **`aiService.ts`**: Centralized logic for streaming chat, handling `thinkingBudget`, and managing tool calls (like navigating the viewer via AI).
- **`ViewerCanvas.tsx`**: High-performance Canvas API rendering for DICOM frames and segmentation layers.
- **`AiReportModal.tsx`**: A dedicated workflow that aggregates measurements, metadata, and audio dictation to generate structured Markdown reports.

## Usage

1. **API Key:** The app requires a valid Google Cloud API Key with access to the Gemini API. This is handled via the `process.env.API_KEY` injection in AI Studio.
2. **Data Source:** The app automatically connects to public demo servers (e.g., Orthanc Demo or AWS Public Datasets). No local DICOM server is required.
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
Prerequisites: Node.js

1. Install dependencies: `npm install`
2. Set the `API_KEY` in `.env.local` to your Gemini API key
3. Run the app: `npm run dev`
