import React, { useState } from 'react';
import { Sparkles, Globe, Shield, Activity, FileText, ArrowRight } from 'lucide-react';

interface IntroScreenProps {
  onStartDemo: () => void;
}

const IntroScreen: React.FC<IntroScreenProps> = ({ onStartDemo }) => {
  const [showSafety, setShowSafety] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-3xl w-full bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-2xl p-12 shadow-2xl relative z-10">
        
        <div className="mb-8 inline-flex items-center justify-center p-3 bg-slate-950 border border-slate-800 rounded-xl shadow-lg">
           <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg">
             <Activity className="w-8 h-8 text-white" />
           </div>
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">
          VibeRad <span className="text-slate-500 font-normal">·</span> <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Gemini Copilot</span>
        </h1>
        
        <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
           Ask the scan. Teach with real DICOM. <br/>
           <span className="text-slate-500 text-base">Educational demo only, not for clinical use.</span>
        </p>

        <div className="grid md:grid-cols-3 gap-6 mb-12 text-left">
           <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800">
              <Globe className="w-6 h-6 text-green-400 mb-3" />
              <h3 className="font-bold text-slate-200 mb-1">Real DICOMweb</h3>
              <p className="text-xs text-slate-400">Connect to public Orthanc servers and stream real medical imaging series.</p>
           </div>
           <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800">
              <Sparkles className="w-6 h-6 text-purple-400 mb-3" />
              <h3 className="font-bold text-slate-200 mb-1">Gemini 3 Pro</h3>
              <p className="text-xs text-slate-400">Multimodal AI that can "see" the slice and answer complex anatomy questions.</p>
           </div>
           <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800">
              <FileText className="w-6 h-6 text-indigo-400 mb-3" />
              <h3 className="font-bold text-slate-200 mb-1">Auto Reports</h3>
              <p className="text-xs text-slate-400">Dictate findings and generate structured educational reports in seconds.</p>
           </div>
        </div>

        <div className="flex flex-col items-center gap-4">
           <button 
             onClick={onStartDemo}
             className="group relative px-8 py-4 bg-white text-slate-950 rounded-full font-bold text-lg hover:bg-indigo-50 transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(99,102,241,0.5)]"
           >
             <span className="flex items-center gap-2">
               Start Demo with Orthanc <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
             </span>
           </button>
           
           <button 
             onClick={() => setShowSafety(true)}
             className="text-sm text-slate-500 hover:text-slate-300 flex items-center gap-1.5 transition-colors"
           >
             <Shield className="w-3.5 h-3.5" /> Safety & Data Privacy
           </button>
        </div>
      </div>

      {/* Safety Modal */}
      {showSafety && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
           <div className="bg-slate-900 border border-slate-700 max-w-md rounded-xl p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-4">Safety Information</h3>
              <div className="space-y-3 text-sm text-slate-300 mb-6">
                 <p>1. <strong>Not a Medical Device:</strong> This application is a prototype for educational and demonstration purposes only.</p>
                 <p>2. <strong>No PHI:</strong> Do not upload or view real patient health information. Use only anonymized public data.</p>
                 <p>3. <strong>AI Limitations:</strong> Generative AI can hallucinate. Never rely on the AI assistant for diagnosis, triage, or treatment.</p>
              </div>
              <button 
                onClick={() => setShowSafety(false)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium"
              >
                I Understand
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default IntroScreen;