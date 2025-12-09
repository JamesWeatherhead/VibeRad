import React from 'react';
import { Measurement } from '../types';
import { Trash2, Ruler, ArrowRight, Target } from 'lucide-react';

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
    studyId: string;
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
  return (
    <div className="w-full bg-slate-950 flex flex-col h-full relative">
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
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
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
    </div>
  );
};

export default MeasurementPanel;