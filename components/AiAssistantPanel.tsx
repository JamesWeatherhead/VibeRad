
import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Sparkles, Globe, BrainCircuit, X, Camera, ImageIcon, MessageSquarePlus } from 'lucide-react';
import { streamChatResponse } from '../services/aiService';
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
  const [mode, setMode] = useState<'standard' | 'thinking' | 'search'>('standard');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [attachedScreenshot, setAttachedScreenshot] = useState<string | null>(null);

  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [messages]);

  const handleCapture = () => {
    if (onCaptureScreen) {
        const screenshot = onCaptureScreen();
        if (screenshot) setAttachedScreenshot(screenshot);
    }
  };

  const handleSendMessage = async (text: string = input) => {
    if ((!text.trim() && !attachedScreenshot) || isThinking) return;

    const userMsg: ChatMessage = { 
        id: Date.now().toString(), role: 'user', text: text, hasAttachment: !!attachedScreenshot
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);
    
    const imageToSend = attachedScreenshot;
    setAttachedScreenshot(null);

    let modePrefix = "You are in STANDARD mode. Give a concise, clinically oriented explanation using the Markdown rules above.\n\n";
    if (mode === 'thinking') {
         modePrefix = "You are in DEEP THINK mode. Consider the question carefully, but still present only a concise explanation and structured Markdown sections. Do not show long step-by-step reasoning.\n\n";
    } else if (mode === 'search') {
         modePrefix = "You are in WEB SEARCH mode. Use external search tools when helpful and respond with short, citation-style bullet lists under headings like \"## Guideline Snippets\" and \"## Evidence Summary\", following the Markdown rules above.\n\n";
    }

    let promptToSend = userMsg.text;
    if (mode === 'search' && studyMetadata) {
        promptToSend = `${modePrefix}Context: Patient Scan (${studyMetadata.modality}, ${studyMetadata.description})`;
        if (cursor) promptToSend += ` (Slice: ${cursor.frameIndex + 1})`;
        promptToSend += `. Question: ${userMsg.text}`;
    } else {
        promptToSend = `${modePrefix}${userMsg.text}`;
    }

    const botMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: botMsgId, role: 'model', text: '', isThinking: mode === 'thinking' }]);

    let fullText = '';
    await streamChatResponse(promptToSend, mode === 'thinking', mode === 'search', imageToSend, (chunk, sources, toolCalls) => {
        // Handle Tool Calls (Navigation)
        if (toolCalls && onJumpToSlice) {
            toolCalls.forEach(call => {
                if (call.name === 'set_cursor_frame') {
                    const idx = Math.round(call.args.index);
                    if (!isNaN(idx)) onJumpToSlice(idx);
                }
            });
        }
        
        fullText += chunk;
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: fullText, sources: sources || m.sources } : m));
    });

    setIsThinking(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-slate-100 font-bold">
          <Sparkles className="w-4 h-4 text-purple-400" /> <span>AI Assistant</span>
        </div>
      </div>
      <div className="bg-purple-900/10 border-b border-purple-900/20 p-2 flex-shrink-0">
          <p className="text-[10px] text-purple-200 opacity-70 text-center">Ask Gemini about this slice. Educational only.</p>
      </div>

      <div className="flex-1 overflow-hidden relative flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-5 no-scrollbar" ref={chatContainerRef}>
            {messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[95%] rounded-xl p-3 shadow-sm ${m.role === 'user' ? 'bg-gradient-to-br from-purple-900/40 to-indigo-900/40 text-purple-100 border border-purple-700/50' : 'bg-slate-800/80 text-slate-200 border border-slate-700'}`}>
                        {m.hasAttachment && <div className="mb-2 text-xs text-purple-300 bg-purple-950/50 px-2 py-1 rounded w-fit flex gap-1"><ImageIcon className="w-3 h-3"/> Image Attached</div>}
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
        </div>

        {!isThinking && (
            <div className="px-4 pb-4 flex flex-col gap-2 flex-shrink-0 border-t border-transparent">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
                     <span className="flex items-center gap-1"><MessageSquarePlus className="w-3 h-3" /> Suggested Follow-ups</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {SUGGESTED_FOLLOWUPS.map((sugg, idx) => (
                        <button key={idx} onClick={() => handleSendMessage(sugg)} className="text-left text-xs bg-slate-800 hover:bg-slate-700 text-indigo-200 px-3 py-1.5 rounded-full border border-slate-700 transition-all">
                            {sugg}
                        </button>
                    ))}
                </div>
            </div>
        )}

        <div className="p-4 bg-slate-900 border-t border-slate-800 flex-shrink-0">
            {/* Mode Selection */}
            <div className="flex gap-2 justify-center mb-4">
                <button onClick={() => setMode('standard')} className={`px-3 py-1.5 rounded-full text-[10px] font-medium border transition-colors ${mode === 'standard' ? 'bg-slate-700 border-slate-500 text-white' : 'border-slate-800 text-slate-500 hover:text-slate-300'}`}>Standard</button>
                <button onClick={() => setMode('thinking')} className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-medium border transition-colors ${mode === 'thinking' ? 'bg-purple-900/50 border-purple-500 text-purple-200' : 'border-slate-800 text-slate-500 hover:text-slate-300'}`}><BrainCircuit className="w-3 h-3" /> Deep Think</button>
                <button onClick={() => setMode('search')} className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-medium border transition-colors ${mode === 'search' ? 'bg-blue-900/50 border-blue-500 text-blue-200' : 'border-slate-800 text-slate-500 hover:text-slate-300'}`}><Globe className="w-3 h-3" /> Web Search</button>
            </div>

            {/* Attached Image Preview */}
            {attachedScreenshot && (
                <div className="relative inline-block border border-purple-500 rounded overflow-hidden shadow-lg group mb-3">
                    <img src={attachedScreenshot} alt="Snapshot" className="h-16 w-auto opacity-80 group-hover:opacity-100 transition-opacity" />
                    <button onClick={() => setAttachedScreenshot(null)} className="absolute top-0 right-0 bg-black/50 hover:bg-red-500 text-white p-0.5"><X className="w-3 h-3" /></button>
                </div>
            )}

            {/* Input Area */}
            <div className="relative flex gap-3 items-center">
                <button 
                    onClick={handleCapture} 
                    disabled={!onCaptureScreen} 
                    title="Attach the current slice so Gemini can see this image"
                    aria-label="Attach the current slice so Gemini can see this image"
                    className={`p-2.5 rounded-lg border transition-all ${attachedScreenshot ? 'bg-purple-900 border-purple-500 text-white ring-2 ring-purple-500/50' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'}`}
                >
                    <Camera className="w-5 h-5" />
                </button>
                
                <div className="relative flex-1">
                    <input 
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pr-10 pl-4 py-2.5 text-sm focus:border-purple-500 focus:outline-none text-slate-200 placeholder:text-slate-600 shadow-inner" 
                        placeholder={mode === 'thinking' ? "Ask complex question..." : "Ask a question..."} 
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
            {!attachedScreenshot && (
                <div className="mt-3 text-[10px] text-slate-500 text-center">
                    Tip: Use the camera to send the current slice to the AI.
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default AiAssistantPanel;
