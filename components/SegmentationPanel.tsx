
import React from 'react';
import { SegmentationLayer, Segment, ToolMode } from '../types';
import { Eye, EyeOff, Layers, Settings2, Activity, Brush, MousePointer2, Circle } from 'lucide-react';

interface SegmentationPanelProps {
  layer: SegmentationLayer;
  onChange: (layer: SegmentationLayer) => void;
  activeTool: ToolMode;
  onSelectTool: (tool: ToolMode) => void;
}

const SegmentationPanel: React.FC<SegmentationPanelProps> = ({ layer, onChange, activeTool, onSelectTool }) => {

  const toggleGlobalVisibility = () => {
    onChange({ ...layer, isVisible: !layer.isVisible });
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...layer, opacity: parseFloat(e.target.value) });
  };

  const toggleSegment = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const updatedSegments = layer.segments.map(s => 
      s.id === id ? { ...s, isVisible: !s.isVisible } : s
    );
    onChange({ ...layer, segments: updatedSegments });
  };

  const setActiveSegment = (id: number) => {
    onChange({ ...layer, activeSegmentId: id });
    // Automatically switch to Brush tool when selecting a segment to paint
    if (activeTool !== ToolMode.BRUSH) {
        onSelectTool(ToolMode.BRUSH);
    }
  };

  return (
    <div className="w-80 bg-slate-950 border-l border-slate-800 flex flex-col h-full">
      {/* Header */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-100 font-bold">
          <Activity className="w-4 h-4 text-emerald-500" />
          <span>Segmentation</span>
        </div>
        <div className="flex items-center gap-2">
            <button 
                onClick={toggleGlobalVisibility}
                className={`p-1.5 rounded transition-colors ${layer.isVisible ? 'text-emerald-400 bg-emerald-950' : 'text-slate-500 hover:text-slate-300'}`}
                title={layer.isVisible ? "Hide Segmentation Layer" : "Show Segmentation Layer"}
            >
                {layer.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
        </div>
      </div>

      {/* Layer Controls */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/50 space-y-3">
         <div className="flex items-center justify-between">
             <button 
                onClick={() => onSelectTool(activeTool === ToolMode.BRUSH ? ToolMode.POINTER : ToolMode.BRUSH)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-bold uppercase transition-colors border ${
                    activeTool === ToolMode.BRUSH 
                    ? 'bg-emerald-600 border-emerald-500 text-white' 
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
             >
                <Brush className="w-3.5 h-3.5" />
                {activeTool === ToolMode.BRUSH ? 'Painting Active' : 'Start Painting'}
             </button>
         </div>

         <div>
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                    <Settings2 className="w-3 h-3" />
                    Global Opacity
                </span>
                <span className="text-xs font-mono text-slate-400">{(layer.opacity * 100).toFixed(0)}%</span>
            </div>
            <input 
                type="range" 
                min="0" max="1" step="0.05" 
                value={layer.opacity}
                onChange={handleOpacityChange}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 mb-4"
            />

            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                    <Circle className="w-3 h-3" />
                    Brush Size
                </span>
                <span className="text-xs font-mono text-slate-400">{layer.brushSize}px</span>
            </div>
            <input 
                type="range" 
                min="5" max="50" step="1" 
                value={layer.brushSize}
                onChange={(e) => onChange({ ...layer, brushSize: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
         </div>
      </div>

      {/* Segments List */}
      <div className="flex-1 overflow-y-auto">
         <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase bg-slate-950 sticky top-0 border-b border-slate-800 flex justify-between items-center">
            <span>Segments Palette</span>
            <span className="text-[10px] text-slate-600 font-normal">{layer.segments.length} items</span>
         </div>
         
         <div className="divide-y divide-slate-800/50">
            {layer.segments.map((seg) => {
                const isActive = layer.activeSegmentId === seg.id;
                return (
                    <div 
                        key={seg.id} 
                        onClick={() => setActiveSegment(seg.id)}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-l-4 ${
                            isActive 
                            ? 'bg-emerald-900/20 border-emerald-500' 
                            : 'border-transparent hover:bg-slate-900'
                        }`}
                    >
                        <div 
                            onClick={(e) => toggleSegment(e, seg.id)}
                            className="cursor-pointer p-1 -ml-1 rounded hover:bg-slate-800"
                            title={seg.isVisible ? "Hide Segment" : "Show Segment"}
                        >
                            {seg.isVisible 
                                ? <Eye className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} /> 
                                : <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                            }
                        </div>
                        
                        <div className="w-3 h-3 rounded-full shadow-sm ring-1 ring-white/10" style={{ backgroundColor: `rgb(${seg.color.join(',')})` }} />
                        
                        <div className={`flex-1 min-w-0 text-sm font-medium truncate ${isActive ? 'text-white' : 'text-slate-400'}`}>
                            {seg.label}
                        </div>

                        {isActive && <Brush className="w-3 h-3 text-emerald-500 animate-pulse" />}
                    </div>
                );
            })}
         </div>
      </div>
      
      {/* Footer Info */}
      <div className="p-3 bg-slate-900 border-t border-slate-800 text-[10px] text-slate-500 text-center">
         Select a label to paint on slices
      </div>
    </div>
  );
};

export default SegmentationPanel;
