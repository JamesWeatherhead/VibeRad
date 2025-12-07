import React from 'react';
import { Shield } from 'lucide-react';

interface SafetyModalProps {
  onClose: () => void;
}

const SafetyModal: React.FC<SafetyModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
       <div className="bg-slate-900 border border-slate-700 max-w-md w-full rounded-xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-5 border-b border-slate-800 pb-4">
             <div className="p-2 bg-amber-500/10 rounded-lg">
                <Shield className="w-5 h-5 text-amber-500" />
             </div>
             <h3 className="text-lg font-bold text-white">Safety Information</h3>
          </div>
          <div className="space-y-4 text-sm text-slate-300 mb-6">
             <div className="flex gap-3">
                <span className="font-mono text-slate-500 font-bold">01</span>
                <p><strong>Not a Medical Device:</strong> This application is a prototype for educational and demonstration purposes only.</p>
             </div>
             <div className="flex gap-3">
                <span className="font-mono text-slate-500 font-bold">02</span>
                <p><strong>No PHI:</strong> Do not upload or view real patient health information. Use only anonymized public data.</p>
             </div>
             <div className="flex gap-3">
                <span className="font-mono text-slate-500 font-bold">03</span>
                <p><strong>AI Limitations:</strong> Generative AI can hallucinate. Never rely on the AI assistant for diagnosis, triage, or treatment.</p>
             </div>
             <div className="flex gap-3">
                <span className="font-mono text-slate-500 font-bold">04</span>
                <p><strong>Data Source:</strong> DICOM demo images are streamed from the public Orthanc demo server (demo.orthanc-server.com). No real patient PHI is used.</p>
             </div>
          </div>
          <button 
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium border border-slate-700 transition-colors"
          >
            I Understand
          </button>
       </div>
    </div>
  );
};

export default SafetyModal;