
import React, { useState, useRef } from 'react';
import { X, Mic, StopCircle, Sparkles, Copy, Check, Download, FileText, Loader2, AlertTriangle } from 'lucide-react';
import { generateRadiologyReport, transcribeAudio, ReportPayload } from '../services/aiService';
import { Measurement } from '../types';
import { renderMarkdown } from '../utils/markdownUtils';

interface AiReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  studyMetadata: {
    studyId: string;
    patientName: string;
    description: string;
    modality: string;
  };
  measurements: Measurement[];
  pixelSpacing?: number;
  currentSliceIndex?: number;
  onCaptureScreen?: () => string | null;
}

const AiReportModal: React.FC<AiReportModalProps> = ({ 
  isOpen, 
  onClose, 
  studyMetadata, 
  measurements,
  pixelSpacing = 0.5,
  currentSliceIndex,
  onCaptureScreen
}) => {
  // Input State - Single Note Field
  const [notes, setNotes] = useState(`Axial ${studyMetadata.modality} of ${studyMetadata.description}. Findings: `);
  
  // Audio State
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportResult, setReportResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // --- AUDIO LOGIC ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        setIsTranscribing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' });
        try {
          const text = await transcribeAudio(audioBlob);
          setNotes(prev => prev + (prev ? ' ' : '') + text);
        } catch (e) {
          console.error("Transcription failed", e);
        } finally {
          setIsTranscribing(false);
        }
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      alert("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => isRecording ? stopRecording() : startRecording();

  // --- GENERATION LOGIC ---
  const handleGenerate = async () => {
    setIsGenerating(true);
    setReportResult(null);

    let imageBase64 = null;
    if (onCaptureScreen) imageBase64 = onCaptureScreen();

    const measurementData = measurements.map(m => ({
        label: m.label || 'Measurement',
        value_mm: (m.value * pixelSpacing).toFixed(1),
        sliceIndex: m.sliceIndex
    }));

    const payload: ReportPayload = {
      dicom_metadata: {
        studyId: studyMetadata.studyId,
        patientName: studyMetadata.patientName,
        description: studyMetadata.description,
        modality: studyMetadata.modality,
        measurements: measurementData
      },
      free_text_notes: notes,
      slice_context: `Current Slice: ${currentSliceIndex}`
    };

    try {
        const report = await generateRadiologyReport(payload, imageBase64);
        setReportResult(report);
    } catch (e) {
        setReportResult("Error generating report.");
    } finally {
        setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (reportResult) {
      navigator.clipboard.writeText(reportResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadReport = () => {
      if (!reportResult) return;
      const blob = new Blob([reportResult], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `viberad_report.txt`;
      a.click();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-[800px] h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 bg-slate-950 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" /> AI Report Engine
            </h3>
            <button onClick={onClose}><X className="w-6 h-6 text-slate-400" /></button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left: Input */}
            <div className="w-full md:w-1/2 p-4 flex flex-col border-r border-slate-800 bg-slate-900">
                <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Report Notes / Dictation</label>
                    <button onClick={toggleRecording} className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-800 text-slate-300'}`}>
                        {isRecording ? <StopCircle className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                        {isRecording ? 'Stop' : 'Dictate'}
                    </button>
                </div>
                <div className="relative flex-1">
                    <textarea 
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        className="w-full h-full bg-slate-950 border border-slate-700 rounded p-3 text-sm text-slate-300 resize-none focus:border-indigo-500 outline-none"
                    />
                    {isTranscribing && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-indigo-400">
                            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Transcribing...
                        </div>
                    )}
                </div>
                <button 
                    onClick={handleGenerate} 
                    disabled={isGenerating}
                    className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold flex justify-center gap-2 disabled:opacity-50"
                >
                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    Generate Report
                </button>
            </div>

            {/* Right: Output */}
            <div className="w-full md:w-1/2 p-4 bg-slate-950 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Generated Output</label>
                    {reportResult && (
                        <div className="flex gap-2">
                            <button onClick={copyToClipboard} className="p-1 bg-slate-800 rounded text-slate-400 hover:text-white">
                                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <button onClick={downloadReport} className="p-1 bg-slate-800 rounded text-slate-400 hover:text-white">
                                <Download className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex-1 bg-slate-900 border border-slate-800 rounded p-4 overflow-y-auto text-sm text-slate-300">
                  {isGenerating ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600">
                      <Sparkles className="w-8 h-8 animate-pulse mb-2" /> Generating...
                    </div>
                  ) : reportResult ? (
                    <div className="prose prose-invert max-w-none">
                      {renderMarkdown(reportResult)}
                    </div>
                  ) : (
                    <span className="text-slate-600">Report will appear here.</span>
                  )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AiReportModal;
