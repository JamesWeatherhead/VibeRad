import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Sparkles, Globe, BrainCircuit, X, Camera, ImageIcon, MessageSquarePlus, Trash2, CheckCircle2, Zap, AlertCircle } from 'lucide-react';
import { streamChatResponse, AiMode } from '../services/aiService';
import { ChatMessage, CursorContext } from '../types';
import { MarkdownText } from '../utils/markdownUtils';
import { SUGGESTED_FOLLOWUPS } from '../constants';

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
}

const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({ onCaptureScreen, studyMetadata, cursor, onJumpToSlice }) => {
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
  const [capturedSliceInfo, setCapturedSliceInfo] = useState<{slice: number} | null>(null);
  const [showCaptureToast, setShowCaptureToast] = useState(false);
  
  // State for dynamic suggested follow-ups
  const [suggestedFollowups, setSuggestedFollowups] = useState<string[]>(SUGGESTED_FOLLOWUPS);

  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [messages, isThinking]);

  const handleCapture = () => {
    if (onCaptureScreen) {
        const screenshot = onCaptureScreen();
        if (screenshot) {
            setAttachedScreenshot(screenshot);
            if (cursor) {
                setCapturedSliceInfo({ slice: cursor.frameIndex + 1 });
            }
            setShowCaptureToast(true);
            setTimeout(() => setShowCaptureToast(false), 4000);
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
    setSuggestedFollowups(SUGGESTED_FOLLOWUPS);
    setShowCaptureToast(false);
  };

  const handleSendMessage = async (text: string = input) => {
    if ((!text.trim() && !attachedScreenshot) || isThinking) return;

    const userMsg: ChatMessage = { 
        id: Date.now().toString(), role: 'user', text: text, hasAttachment: !!attachedScreenshot
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);
    
    // Persistent Capture State: We use the attachedScreenshot if available, and we DO NOT clear it.
    // This allows the user to ask follow-up questions about the same image.
    const imageToSend = attachedScreenshot;

    let promptToSend = userMsg.text;
    
    // Inject Study Context only for Search Mode (Deep Think & Chat rely on image + prompt)
    if (mode === 'search' && studyMetadata) {
        promptToSend += `\n\nContext: Patient Scan (${studyMetadata.modality}, ${studyMetadata.description})`;
        if (cursor) promptToSend += ` (Slice: ${cursor.frameIndex + 1})`;
    }

    const botMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: botMsgId, role: 'model', text: '', isThinking: mode === 'deep_think' }]);

    let fullText = '';
    
    await streamChatResponse(
        promptToSend, 
        mode,
        imageToSend, 
        (chunk, sources, toolCalls, followUps, fullTextReplace) => {
            // Handle Tool Calls (Navigation)
            if (toolCalls && onJumpToSlice) {
                toolCalls.forEach(call => {
                    if (call.name === 'set_cursor_frame') {
                        const idx = Math.round(call.args.index);
                        if (!isNaN(idx)) onJumpToSlice(idx);
                    }
                });
            }
            
            // Handle text updates
            if (fullTextReplace !== undefined) {
                fullText = fullTextReplace;
            } else {
                fullText += chunk;
            }
            
            // Update suggestions if provided by the model
            if (followUps && followUps.length > 0) {
                setSuggestedFollowups(followUps);
            }

            setMessages(prev => prev.map(m => m.id === botMsgId ? { 
                ...m, 
                text: fullText, 
                sources: sources || m.sources,
                followUps: followUps || m.followUps
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
          <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-slate-400">
                  <span className="font-bold text-slate-500 uppercase">Mode:</span>
                  <span className="text-purple-300 font-medium capitalize">{mode.replace('_', ' ')}</span>
              </div>
              <div className="w-px h-3 bg-slate-700"></div>
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
                        {m.hasAttachment && <div className="mb-2 text-xs text-purple-300 bg-purple-950/50 px-2 py-1 rounded w-fit flex gap-1"><ImageIcon className="w-3 h-3"/> Image Context Active</div>}
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

            {!isThinking && (
                <div className="pt-2 flex flex-col gap-2 pb-2 animate-in fade-in duration-300">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
                         <MessageSquarePlus className="w-3 h-3" /> Suggested Follow-ups
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {suggestedFollowups.map((sugg, idx) => (
                            <button key={idx} onClick={() => handleSendMessage(sugg)} className="text-left text-xs bg-slate-800 hover:bg-slate-700 text-indigo-200 px-3 py-1.5 rounded-full border border-slate-700 transition-all">
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
                  title="Fast text chat, optionally using the last captured slice."
                  className={`px-3 py-1.5 rounded-full text-[10px] font-medium border transition-colors ${mode === 'chat' ? 'bg-slate-700 border-slate-500 text-white' : 'border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                  Chat (Low Thinking)
                </button>
                <button 
                  onClick={() => setMode('deep_think')} 
                  title="Structured teaching for the last captured slice."
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-medium border transition-colors ${mode === 'deep_think' ? 'bg-purple-900/50 border-purple-500 text-purple-200' : 'border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                  <BrainCircuit className="w-3 h-3" /> Deep Think (High)
                </button>
                <button 
                  onClick={() => setMode('search')} 
                  title="High-reasoning answers grounded by Google Search."
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-medium border transition-colors ${mode === 'search' ? 'bg-blue-900/50 border-blue-500 text-blue-200' : 'border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                  <Globe className="w-3 h-3" /> Search (High)
                </button>
            </div>

            {/* Attached Image Preview */}
            {attachedScreenshot && (
                <div className="relative inline-block border border-purple-500 rounded overflow-hidden shadow-lg group mb-3">
                    <img src={attachedScreenshot} alt="Snapshot" className="h-16 w-auto opacity-80 group-hover:opacity-100 transition-opacity" />
                    <button onClick={() => { setAttachedScreenshot(null); setCapturedSliceInfo(null); }} className="absolute top-0 right-0 bg-black/50 hover:bg-red-500 text-white p-0.5"><X className="w-3 h-3" /></button>
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white px-1 text-center truncate">
                        {capturedSliceInfo ? `Slice ${capturedSliceInfo.slice}` : 'Captured'}
                    </div>
                </div>
            )}

            {/* Input Area */}
            <div className="relative flex gap-3 items-center">
                <div className="relative group">
                    <button 
                        onClick={handleCapture} 
                        disabled={!onCaptureScreen} 
                        title="Capture current slice as context"
                        aria-label="Capture current slice as context"
                        className={`p-2.5 rounded-lg border transition-all ${attachedScreenshot ? 'bg-purple-900 border-purple-500 text-white ring-2 ring-purple-500/50' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'}`}
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

            {/* Helper Tip */}
            <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
                <Zap className="w-3 h-3 text-yellow-600" />
                <span>Gemini 3 only sees the image after you click <strong className="text-slate-400">Capture 📸</strong>.</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AiAssistantPanel;