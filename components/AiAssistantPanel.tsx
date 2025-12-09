import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Globe, BrainCircuit, X, Camera, ImageIcon, Trash2, CheckCircle2 } from 'lucide-react';
import { streamChatResponse, AiMode, generateFollowUpQuestions } from '../services/aiService';
import { ChatMessage, CursorContext } from '../types';
import { MarkdownText } from '../utils/markdownUtils';
import { LearnerLevel, LEARNER_LEVELS } from '../constants';

interface AiAssistantPanelProps {
  onCaptureScreen?: () => string | null;
  studyMetadata?: {
    studyId: string;
    patientName: string;
    description: string;
    modality: string;
  };
  cursor?: CursorContext;
  onJumpToSlice?: (index: number) => void;
  activeSeriesInfo?: {
    description: string;
    instanceCount: number;
  };
}

// Initial static suggestions for "Zero State" only
function getInitialSuggestions(
  learnerLevel: LearnerLevel,
  hasImageContext: boolean
): string[] {
  if (learnerLevel === 'highschool') {
    return hasImageContext 
      ? ["Explain simply", "What body part is this?"] 
      : ["What is MRI?", "Is MRI safe?"];
  }
  if (learnerLevel === 'undergrad') {
    return hasImageContext
      ? ["Big picture", "Key structures"]
      : ["MRI Physics intro", "Anatomy basics"];
  }
  if (learnerLevel === 'medstudent') {
    return hasImageContext
      ? ["Step-by-step", "Self-test", "Anatomical relations"]
      : ["Search patterns", "Sequence guide"];
  }
  if (learnerLevel === 'resident') {
     return hasImageContext
      ? ["Pearls & pitfalls", "Compare sequences", "Guideline check"]
      : ["Reporting templates", "Advanced physics artifacts"];
  }
  return [];
}

const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({ 
  onCaptureScreen, 
  studyMetadata, 
  cursor, 
  onJumpToSlice,
  activeSeriesInfo 
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { 
      id: 'welcome', 
      role: 'model', 
      text: "This is anonymized demo imaging from a public DICOM server. I’m a radiology teaching assistant: I can explain anatomy, help you describe what you see, and surface guideline snippets for learning — never real diagnoses, reports, or treatment decisions."
    }
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [mode, setMode] = useState<AiMode>('chat');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [attachedScreenshot, setAttachedScreenshot] = useState<string | null>(null);
  
  const [capturedSliceInfo, setCapturedSliceInfo] = useState<{
    slice: number;
    total?: number;
    label?: string;
  } | null>(null);
  
  const [showCaptureToast, setShowCaptureToast] = useState(false);
  
  // Learner Level State
  const [learnerLevel, setLearnerLevel] = useState<LearnerLevel>(() => {
    return (localStorage.getItem('viberad_learner_level') as LearnerLevel) || 'medstudent';
  });
  
  // Dynamic suggestions cache (pre-fetched for all levels)
  const [dynamicSuggestionsMap, setDynamicSuggestionsMap] = useState<Record<LearnerLevel, string[]> | null>(null);

  useEffect(() => {
    localStorage.setItem('viberad_learner_level', learnerLevel);
  }, [learnerLevel]);

  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [messages, isThinking]);

  // Trigger suggestion generation when a MODEL message finishes
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!isThinking && lastMsg && lastMsg.role === 'model' && messages.length > 1) {
       // Find the last user message for context
       const lastUserMsg = messages[messages.length - 2];
       if (lastUserMsg) {
          const hasImageContext = !!lastUserMsg.hasAttachment;
          const label = capturedSliceInfo?.label || studyMetadata?.description || "MRI Slice";
          const fullSliceLabel = capturedSliceInfo ? `Slice ${capturedSliceInfo.slice} (${label})` : label;

          generateFollowUpQuestions(
            lastUserMsg.text, 
            lastMsg.text,
            hasImageContext,
            fullSliceLabel
          ).then(suggestions => {
             setDynamicSuggestionsMap(suggestions);
          });
       }
    }
  }, [messages, isThinking]);

  // Derived suggestions: Use Dynamic if available, else Static Initial
  const currentSuggestions = dynamicSuggestionsMap 
      ? dynamicSuggestionsMap[learnerLevel] 
      : getInitialSuggestions(learnerLevel, !!attachedScreenshot);

  const handleCapture = () => {
    if (onCaptureScreen) {
        const screenshot = onCaptureScreen();
        if (screenshot) {
            setAttachedScreenshot(screenshot);
            if (cursor) {
                setCapturedSliceInfo({ 
                  slice: cursor.frameIndex + 1,
                  total: activeSeriesInfo?.instanceCount,
                  label: activeSeriesInfo?.description || studyMetadata?.description 
                });
            }
            setShowCaptureToast(true);
            setTimeout(() => setShowCaptureToast(false), 4000);
            
            // Clear old suggestions when context changes drastically
            setDynamicSuggestionsMap(null); 
        }
    }
  };

  const handleClearChat = () => {
    setMessages([{ 
      id: 'welcome', 
      role: 'model', 
      text: "This is anonymized demo imaging from a public DICOM server. I’m a radiology teaching assistant: I can explain anatomy, help you describe what you see, and surface guideline snippets for learning — never real diagnoses, reports, or treatment decisions."
    }]);
    setAttachedScreenshot(null);
    setCapturedSliceInfo(null);
    setInput('');
    setShowCaptureToast(false);
    setDynamicSuggestionsMap(null);
  };

  const handleSendMessage = async (text: string = input, promptOverride?: string) => {
    const finalText = promptOverride || text;
    if ((!finalText.trim() && !attachedScreenshot) || isThinking) return;

    const userMsg: ChatMessage = { 
        id: Date.now().toString(), role: 'user', text: finalText, hasAttachment: !!attachedScreenshot
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);
    
    const imageToSend = attachedScreenshot;
    let promptToSend = finalText;
    
    // Inject Study Context only for Search Mode
    if (mode === 'search' && studyMetadata) {
        promptToSend += `\n\nContext: Patient Scan (${studyMetadata.modality}, ${studyMetadata.description})`;
        if (capturedSliceInfo) promptToSend += ` (Captured Slice: ${capturedSliceInfo.slice})`;
        else if (cursor) promptToSend += ` (Current Slice: ${cursor.frameIndex + 1})`;
    }

    const botMsgId = (Date.now() + 1).toString();
    
    let botMessageExtras = {};
    if (imageToSend) {
       let label = capturedSliceInfo?.label || studyMetadata?.description;
       if (!label || label === "No Description" || label === "OT") label = "MRI series";

       botMessageExtras = {
          attachedSliceThumbnailDataUrl: imageToSend,
          attachedSliceIndex: capturedSliceInfo?.slice,
          attachedSequenceLabel: label
       };
    }

    setMessages(prev => [...prev, { 
        id: botMsgId, 
        role: 'model', 
        text: '', 
        isThinking: mode === 'deep_think',
        ...botMessageExtras
    }]);

    let fullText = '';
    
    await streamChatResponse(
        promptToSend, 
        mode,
        learnerLevel, // Pass level to chat context
        imageToSend, 
        (chunk, sources, toolCalls, followUps, fullTextReplace) => {
            if (toolCalls && onJumpToSlice) {
                toolCalls.forEach(call => {
                    if (call.name === 'set_cursor_frame') {
                        const idx = Math.round(call.args.index);
                        if (!isNaN(idx)) onJumpToSlice(idx);
                    }
                });
            }
            
            if (fullTextReplace !== undefined) {
                fullText = fullTextReplace;
            } else {
                fullText += chunk;
            }
            
            setMessages(prev => prev.map(m => m.id === botMsgId ? { 
                ...m, 
                text: fullText, 
                sources: sources || m.sources
            } : m));
        }
    );

    setIsThinking(false);
  };

  const getThinkingLevelLabel = () => {
      switch(mode) {
          case 'chat': return 'Low';
          case 'deep_think': return 'High';
          case 'search': return 'High';
          default: return 'Low';
      }
  };

  const getLearnerLevelShortLabel = (id: string) => {
      switch(id) {
          case 'highschool': return "HS";
          case 'undergrad': return "Undergrad";
          case 'medstudent': return "Med";
          case 'resident': return "Resident";
          default: return "Gen";
      }
  };

  const getLearnerLevelTooltip = (id: string) => {
      switch(id) {
          case 'highschool': return "High school level explanation";
          case 'undergrad': return "Undergraduate biology/pre-med";
          case 'medstudent': return "Medical student level explanation";
          case 'resident': return "Radiology resident level explanation";
          default: return "";
      }
  };

  const hasCapturedImage = !!attachedScreenshot;

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Main Header */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-slate-100 font-bold">
          <Sparkles className="w-4 h-4 text-purple-400" /> <span>AI Assistant</span>
        </div>
        <button 
            onClick={handleClearChat} 
            className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-colors"
            title="Clear Chat / New Conversation"
        >
            <Trash2 className="w-4 h-4" />
        </button>
      </div>
      
      {/* Status Bar */}
      <div className="bg-slate-900/50 border-b border-slate-800 p-2 flex items-center justify-between text-[10px] flex-shrink-0">
          <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-slate-400">
                  <span className="font-bold text-slate-500 uppercase">Mode:</span>
                  <span className="text-purple-300 font-medium capitalize">{mode.replace('_', ' ')}</span>
              </div>
              <span className="text-slate-700">•</span>
              <div className="flex items-center gap-1 text-slate-400">
                  <BrainCircuit className="w-3 h-3 text-slate-600" />
                  <span>Thinking: <span className="text-slate-200">{getThinkingLevelLabel()}</span></span>
              </div>
          </div>
          <div className="flex items-center gap-1">
               {attachedScreenshot ? (
                   <span className="flex items-center gap-1 text-emerald-400 font-medium">
                       <ImageIcon className="w-3 h-3" />
                       Active {capturedSliceInfo && `(Slice ${capturedSliceInfo.slice})`}
                   </span>
               ) : (
                   <span className="flex items-center gap-1 text-slate-600">
                       <ImageIcon className="w-3 h-3" />
                       No image context
                   </span>
               )}
          </div>
      </div>

      <div className="flex-1 overflow-hidden relative flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-5 no-scrollbar" ref={chatContainerRef}>
            {messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[95%] rounded-xl p-3 shadow-sm ${m.role === 'user' ? 'bg-gradient-to-br from-purple-900/40 to-indigo-900/40 text-purple-100 border border-purple-700/50' : 'bg-slate-800/80 text-slate-200 border border-slate-700'}`}>
                        
                        {/* New Thumbnail Header for Model */}
                        {m.role === 'model' && m.attachedSliceThumbnailDataUrl && (
                             <div className="flex items-center gap-3 mb-3 pb-3 border-b border-white/10">
                                 <img 
                                    src={m.attachedSliceThumbnailDataUrl} 
                                    className="w-16 h-16 rounded object-cover border border-white/10 bg-black/50"
                                    alt="Analyzed Slice"
                                 />
                                 <div className="flex flex-col">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Teaching context</span>
                                    <span className="text-[11px] text-slate-300 font-medium">
                                       Slice {m.attachedSliceIndex ?? '?'} • {m.attachedSequenceLabel || 'Brain MRI series'}
                                    </span>
                                 </div>
                             </div>
                        )}

                        {m.hasAttachment && m.role === 'user' && (
                            <div 
                                className="mb-2 text-xs text-purple-300 bg-purple-950/50 px-2 py-1 rounded w-fit flex gap-1 cursor-help"
                                title="Gemini 3 is using the MRI slice you captured for this question."
                            >
                                <ImageIcon className="w-3 h-3"/> Using captured slice
                            </div>
                        )}
                        
                        {m.isThinking && !m.text && <div className="text-xs text-slate-400 italic mb-1"><BrainCircuit className="w-3 h-3 animate-pulse inline mr-1"/> Thinking...</div>}
                        <MarkdownText content={m.text} />
                        {m.sources && m.sources.length > 0 && (
                            <div className="mt-3 pt-2 border-t border-white/10">
                                <div className="text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><Globe className="w-3 h-3"/> Sources</div>
                                {m.sources.map((src, i) => <a key={i} href={src.uri} target="_blank" className="block text-xs text-blue-400 truncate hover:underline">{src.title || src.uri}</a>)}
                            </div>
                        )}
                    </div>
                </div>
            ))}

            {!isThinking && currentSuggestions.length > 0 && (
                <div className="mt-3 animate-in fade-in duration-300">
                    <div className="mb-2 text-[10px] text-slate-500 uppercase font-bold ml-1">
                        Suggested Follow-ups
                    </div>
                    {/* Dynamic Suggestion Chips */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {currentSuggestions.map((sugg, idx) => (
                            <button 
                                key={idx} 
                                onClick={() => handleSendMessage(sugg)} 
                                className="text-left text-xs bg-slate-800 hover:bg-slate-700 text-indigo-200 px-3 py-1.5 rounded-full border border-slate-700 transition-all active:scale-95"
                            >
                                {sugg}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>

        {/* Capture Toast */}
        {showCaptureToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-900/90 text-emerald-100 px-4 py-2 rounded-full shadow-xl border border-emerald-500/50 flex items-center gap-2 text-xs z-20 animate-in slide-in-from-top-4 fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Captured slice. All AI modes will now see this image.</span>
            </div>
        )}

        <div className="p-4 bg-slate-900 border-t border-slate-800 flex-shrink-0">
            {/* Mode Selection */}
            <div className="flex gap-2 justify-center mb-4">
                <button 
                  onClick={() => setMode('chat')} 
                  title="Chat mode – Gemini 3 Pro with low thinking level for fast Q&A."
                  className={`px-3 py-1.5 rounded-full text-[10px] font-medium border transition-colors ${mode === 'chat' ? 'bg-slate-700 border-slate-500 text-white' : 'border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                  Chat
                </button>
                <button 
                  onClick={() => setMode('deep_think')} 
                  title="Deep Think – Gemini 3 Pro with high thinking level for structured teaching."
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-medium border transition-colors ${mode === 'deep_think' ? 'bg-purple-900/50 border-purple-500 text-purple-200' : 'border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                  <BrainCircuit className="w-3 h-3" /> Deep Think
                </button>
                <button 
                  onClick={() => setMode('search')} 
                  title="Search – Gemini 3 Pro with high thinking + Google Search grounding."
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-medium border transition-colors ${mode === 'search' ? 'bg-blue-900/50 border-blue-500 text-blue-200' : 'border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                  <Globe className="w-3 h-3" /> Search
                </button>
            </div>

            {/* Attached Image Preview */}
            {attachedScreenshot && (
                <div className="relative inline-block border border-purple-500 rounded overflow-hidden shadow-lg group mb-3">
                    <img src={attachedScreenshot} alt="Snapshot" className="h-16 w-auto opacity-80 group-hover:opacity-100 transition-opacity" />
                    <button onClick={() => { setAttachedScreenshot(null); setCapturedSliceInfo(null); setDynamicSuggestionsMap(null); }} className="absolute top-0 right-0 bg-black/50 hover:bg-red-500 text-white p-0.5"><X className="w-3 h-3" /></button>
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white px-1 text-center truncate">
                        {capturedSliceInfo ? `Slice ${capturedSliceInfo.slice}` : 'Captured'}
                    </div>
                </div>
            )}
            
            {/* New Compact Learner Level Row */}
            <div className="flex items-center justify-end mb-2 gap-2 text-[11px] text-slate-400">
                <span className="hidden sm:inline text-slate-500 font-medium">Teaching Level:</span>
                <div className="inline-flex rounded-lg bg-slate-950/50 border border-slate-700/50 p-0.5 gap-0.5">
                    {LEARNER_LEVELS.map(level => (
                        <button
                            key={level.id}
                            type="button"
                            onClick={() => setLearnerLevel(level.id)}
                            title={getLearnerLevelTooltip(level.id)}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                                learnerLevel === level.id 
                                ? 'bg-sky-600 text-white shadow-sm' 
                                : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                            }`}
                        >
                            {getLearnerLevelShortLabel(level.id)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Input Area */}
            <div className="relative flex gap-3 items-center">
                <div className="relative group">
                    <button 
                        onClick={handleCapture} 
                        disabled={!onCaptureScreen} 
                        title="Capture the current MRI slice so Gemini 3 can see it."
                        aria-label="Capture current slice as context"
                        className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${
                            attachedScreenshot 
                            ? 'bg-purple-900/60 border-purple-500/50 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.2)]' 
                            : 'bg-sky-900/60 border-sky-700/50 text-sky-200 hover:bg-sky-800'
                        }`}
                    >
                        <Camera className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="relative flex-1">
                    <input 
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pr-10 pl-4 py-2.5 text-sm focus:border-purple-500 focus:outline-none text-slate-200 placeholder:text-slate-600 shadow-inner" 
                        placeholder={mode === 'deep_think' ? "Ask complex question..." : "Ask a question..."} 
                        value={input} 
                        onChange={(e) => setInput(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} 
                        disabled={isThinking}
                    />
                    <button 
                        onClick={() => handleSendMessage()} 
                        disabled={(!input.trim() && !attachedScreenshot) || isThinking} 
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-purple-500 hover:text-purple-400 disabled:opacity-50 transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Dynamic Hint */}
            <div className="mt-2 text-[11px] text-slate-400 leading-tight">
                {!hasCapturedImage ? (
                    <span>No image attached. Click the camera to capture the current slice before asking image questions.</span>
                ) : (
                    <span>
                        Using last captured slice: <span className="text-slate-200 font-mono">{capturedSliceInfo?.slice}</span>
                        {capturedSliceInfo?.total && <span className="text-slate-500"> / {capturedSliceInfo.total}</span>}
                        {<span className="text-slate-400"> ({capturedSliceInfo?.label || "MRI series"})</span>}
                        . Click the camera again to update.
                    </span>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default AiAssistantPanel;