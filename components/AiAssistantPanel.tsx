
import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Sparkles, Globe, Upload, Image as ImageIcon, BrainCircuit, X } from 'lucide-react';
import { streamChatResponse, analyzeUploadedImage } from '../services/aiService';
import { ChatMessage } from '../types';

interface AiAssistantPanelProps {
  // Can accept context props later
}

const AiAssistantPanel: React.FC<AiAssistantPanelProps> = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'vision'>('chat');
  
  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'model', text: 'Hello. I am your Radiology Assistant. You can ask me medical questions, request Search data, or enable Deep Thinking for complex cases.' }
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [mode, setMode] = useState<'standard' | 'thinking' | 'search'>('standard');
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Vision State
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState('Analyze this medical image for anomalies.');
  const [analysisResult, setAnalysisResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, analysisResult]);

  const handleSendMessage = async () => {
    if (!input.trim() || isThinking) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    const useThinking = mode === 'thinking';
    const useSearch = mode === 'search';

    // Placeholder for stream
    const botMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: botMsgId, role: 'model', text: '', isThinking: useThinking }]);

    let fullText = '';
    
    await streamChatResponse(userMsg.text, useThinking, useSearch, (chunk, sources) => {
        fullText += chunk;
        setMessages(prev => prev.map(m => {
            if (m.id === botMsgId) {
                return { ...m, text: fullText, sources: sources || m.sources };
            }
            return m;
        }));
    });

    setIsThinking(false);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        setSelectedImage(file);
        setImagePreview(URL.createObjectURL(file));
        setAnalysisResult('');
    }
  };

  const handleAnalyzeImage = async () => {
      if (!selectedImage || isAnalyzing) return;
      
      setIsAnalyzing(true);
      setAnalysisResult(''); // clear previous
      
      let fullText = '';
      await analyzeUploadedImage(selectedImage, imagePrompt, (chunk) => {
          fullText += chunk;
          setAnalysisResult(fullText);
      });
      
      setIsAnalyzing(false);
  };

  return (
    <div className="w-80 bg-slate-950 border-l border-slate-800 flex flex-col h-full">
      {/* Header */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-100 font-bold">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>AI Assistant</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900/50">
        <button 
           onClick={() => setActiveTab('chat')}
           className={`flex-1 py-2 text-xs font-bold uppercase flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'text-purple-400 bg-slate-800 border-b-2 border-purple-500' : 'text-slate-500'}`}
        >
            <Bot className="w-3 h-3" /> Chat
        </button>
        <button 
           onClick={() => setActiveTab('vision')}
           className={`flex-1 py-2 text-xs font-bold uppercase flex items-center justify-center gap-2 ${activeTab === 'vision' ? 'text-purple-400 bg-slate-800 border-b-2 border-purple-500' : 'text-slate-500'}`}
        >
            <ImageIcon className="w-3 h-3" /> Analyze Image
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        
        {/* --- CHAT TAB --- */}
        {activeTab === 'chat' && (
            <div className="absolute inset-0 flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" ref={chatContainerRef}>
                    {messages.map((m) => (
                        <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[90%] rounded-lg p-3 text-sm ${
                                m.role === 'user' 
                                ? 'bg-purple-900/40 text-purple-100 border border-purple-700/50' 
                                : 'bg-slate-800 text-slate-200 border border-slate-700'
                            }`}>
                                {m.isThinking && !m.text && (
                                    <div className="flex items-center gap-2 text-xs text-slate-400 italic mb-1">
                                        <BrainCircuit className="w-3 h-3 animate-pulse" /> Thinking...
                                    </div>
                                )}
                                <div className="whitespace-pre-wrap">{m.text}</div>
                                
                                {m.sources && m.sources.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-700">
                                        <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Sources</div>
                                        {m.sources.map((src, i) => (
                                            <a key={i} href={src.uri} target="_blank" rel="noreferrer" className="block text-xs text-blue-400 truncate hover:underline">
                                                {src.title || src.uri}
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isThinking && messages[messages.length-1].role === 'user' && (
                        <div className="flex items-start">
                             <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                                <Bot className="w-4 h-4 text-slate-500 animate-bounce" />
                             </div>
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="p-3 bg-slate-900 border-t border-slate-800 space-y-3">
                    <div className="flex gap-2 justify-center">
                        <button 
                           onClick={() => setMode('standard')}
                           className={`px-2 py-1 rounded text-[10px] border ${mode === 'standard' ? 'bg-slate-700 border-slate-500 text-white' : 'border-slate-800 text-slate-500'}`}
                        >Standard</button>
                        <button 
                           onClick={() => setMode('thinking')}
                           className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border ${mode === 'thinking' ? 'bg-purple-900/50 border-purple-500 text-purple-200' : 'border-slate-800 text-slate-500'}`}
                        >
                            <BrainCircuit className="w-3 h-3" /> Deep Think
                        </button>
                        <button 
                           onClick={() => setMode('search')}
                           className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border ${mode === 'search' ? 'bg-blue-900/50 border-blue-500 text-blue-200' : 'border-slate-800 text-slate-500'}`}
                        >
                            <Globe className="w-3 h-3" /> Web Search
                        </button>
                    </div>
                    <div className="relative">
                        <input
                            className="w-full bg-slate-950 border border-slate-700 rounded pr-10 pl-3 py-2 text-sm focus:border-purple-500 focus:outline-none text-slate-200"
                            placeholder={mode === 'thinking' ? "Ask complex question..." : "Ask a question..."}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            disabled={isThinking}
                        />
                        <button 
                            onClick={handleSendMessage}
                            disabled={!input.trim() || isThinking}
                            className="absolute right-2 top-2 p-0.5 text-purple-500 hover:text-purple-400 disabled:opacity-50"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- VISION TAB --- */}
        {activeTab === 'vision' && (
            <div className="absolute inset-0 flex flex-col p-4 overflow-y-auto">
                {!selectedImage ? (
                    <div className="border-2 border-dashed border-slate-700 rounded-lg p-6 flex flex-col items-center justify-center text-slate-500 hover:border-purple-500 hover:bg-slate-900 transition-colors cursor-pointer relative h-48">
                        <Upload className="w-8 h-8 mb-2" />
                        <span className="text-xs">Click to Upload Image</span>
                        <input 
                            type="file" 
                            accept="image/*"
                            onChange={handleImageSelect}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-black">
                            <img src={imagePreview!} alt="Preview" className="w-full object-contain max-h-48" />
                            <button 
                                onClick={() => { setSelectedImage(null); setImagePreview(null); }}
                                className="absolute top-2 right-2 p-1 bg-black/50 rounded-full hover:bg-red-500 text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        
                        <div>
                             <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Prompt</label>
                             <textarea 
                                value={imagePrompt}
                                onChange={(e) => setImagePrompt(e.target.value)}
                                className="w-full h-20 bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-purple-500 outline-none resize-none"
                             />
                        </div>

                        <button 
                            onClick={handleAnalyzeImage}
                            disabled={isAnalyzing}
                            className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isAnalyzing ? <Sparkles className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                            {isAnalyzing ? 'Analyzing...' : 'Analyze with Gemini'}
                        </button>

                        {analysisResult && (
                            <div className="mt-4 p-3 bg-slate-900 border border-slate-800 rounded text-sm text-slate-300 prose prose-invert prose-sm max-w-none">
                                <div className="whitespace-pre-wrap">{analysisResult}</div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )}

      </div>
    </div>
  );
};

export default AiAssistantPanel;
