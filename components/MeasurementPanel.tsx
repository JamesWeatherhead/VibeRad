
import React, { useState } from 'react';
import { Measurement } from '../types';
import { Trash2, Edit2, Download, FileText, Ruler, ArrowRight, Target, Sparkles, X, Copy, Check } from 'lucide-react';
import { generateRadiologyReport } from '../services/aiService';

interface MeasurementPanelProps {
  measurements: Measurement[];
  activeMeasurementId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Measurement>) => void;
  onDelete: (id: string) => void;
  onJumpToSlice: (index: number) => void;
  pixelSpacing?: number; // mm per pixel
  
  // Context for AI
  studyMetadata?: {
    patientName: string;
    description: string;
    modality: string;
  };
}

const MeasurementPanel: React.FC<MeasurementPanelProps> = ({
  measurements,
  activeMeasurementId,
  onSelect,
  onUpdate,
  onDelete,
  onJumpToSlice,
  pixelSpacing = 0.5, // Default approx if not provided
  studyMetadata
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportResult, setReportResult] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const exportData = () => {
    const data = measurements.map(m => ({
      label: m.label || 'Measurement',
      value_mm: (m.value * pixelSpacing).toFixed(2),
      slice: m.sliceIndex + 1
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'measurements.json';
    a.click();
  };

  const handleCreateReport = async () => {
    if (!studyMetadata) return;
    setIsGenerating(true);
    try {
      const report = await generateRadiologyReport(
        measurements,
        studyMetadata.patientName,
        studyMetadata.description,
        studyMetadata.modality
      );
      setReportResult(report);
      setShowReportModal(true);
    } catch (e) {
      console.error(e);
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

  return (
    <div className="w-80 bg-slate-950 border-l border-slate-800 flex flex-col h-full relative">
      {/* Header */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-100 font-bold">
          <Ruler className="w-4 h-4 text-indigo-500" />
          <span>Tracking</span>
        </div>
        <div className="px-2 py-0.5 bg-slate-800 rounded-full text-xs text-slate-400 font-mono">
          {measurements.length}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {measurements.length === 0 ? (
          <div className="text-center mt-10 opacity-40">
            <Target className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-sm text-slate-400">No measurements yet.</p>
            <p className="text-xs text-slate-600 mt-1">Use the Ruler tool to measure.</p>
          </div>
        ) : (
          measurements.map((m, idx) => {
            const isActive = m.id === activeMeasurementId;
            const lengthMm = (m.value * pixelSpacing).toFixed(1);

            return (
              <div
                key={m.id}
                onClick={() => {
                  onSelect(m.id);
                  onJumpToSlice(m.sliceIndex);
                }}
                className={`rounded-lg p-3 border transition-all cursor-pointer group relative ${
                  isActive
                    ? 'bg-indigo-900/20 border-indigo-500 shadow-sm shadow-indigo-900/20'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-indigo-500' : 'bg-yellow-500'}`} />
                    <input
                      type="text"
                      value={m.label || `Measurement ${idx + 1}`}
                      onChange={(e) => onUpdate(m.id, { label: e.target.value })}
                      className="bg-transparent text-sm font-medium text-slate-200 focus:outline-none focus:border-b border-indigo-500 w-32"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Edit2 className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(m.id);
                    }}
                    className="text-slate-600 hover:text-red-400 p-1 rounded hover:bg-slate-800 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Data Row */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-950 p-1.5 rounded border border-slate-800/50">
                    <span className="text-slate-500 block text-[10px] uppercase">Length</span>
                    <span className="text-slate-200 font-mono font-bold">{lengthMm} mm</span>
                  </div>
                  <div className="bg-slate-950 p-1.5 rounded border border-slate-800/50">
                    <span className="text-slate-500 block text-[10px] uppercase">Slice</span>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-200 font-mono">{m.sliceIndex + 1}</span>
                      {isActive && <ArrowRight className="w-3 h-3 text-indigo-500" />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Actions */}
      <div className="p-4 bg-slate-900 border-t border-slate-800 grid grid-cols-2 gap-2">
        <button 
          onClick={exportData}
          disabled={measurements.length === 0}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium border border-slate-700 disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          Export JSON
        </button>
        <button 
          onClick={handleCreateReport}
          disabled={measurements.length === 0 || isGenerating}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium disabled:opacity-50 transition-colors"
        >
          {isGenerating ? (
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          ) : (
            <FileText className="w-3.5 h-3.5" />
          )}
          {isGenerating ? 'Thinking...' : 'AI Report'}
        </button>
      </div>

      {/* AI REPORT MODAL */}
      {showReportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-[600px] max-w-full flex flex-col max-h-[80vh]">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-700 bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-slate-100">AI Radiology Report</h3>
              </div>
              <button 
                onClick={() => setShowReportModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-900">
               <div className="prose prose-invert prose-sm max-w-none">
                 {/* Simple formatting for display */}
                 {reportResult?.split('\n').map((line, i) => (
                    <p key={i} className={`mb-2 ${line.startsWith('#') ? 'font-bold text-indigo-300 text-base mt-4' : 'text-slate-300'}`}>
                      {line.replace(/^#+\s/, '')}
                    </p>
                 ))}
               </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-700 flex justify-end gap-2">
              <button
                onClick={copyToClipboard}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm font-medium flex items-center gap-2"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy Text'}
              </button>
              <button
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeasurementPanel;
