
import React from 'react';
import { ToolMode } from '../types';
import { TOOLS } from '../constants';
import { Camera, GripVertical, GripHorizontal } from 'lucide-react';

interface FloatingToolbarProps {
  activeTool: ToolMode;
  onSelectTool: (t: ToolMode) => void;
  onCapture: () => void;
  position: { x: number; y: number };
  onDragStart: (e: React.MouseEvent) => void;
  orientation: 'horizontal' | 'vertical';
  isDragging?: boolean;
}

const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  activeTool,
  onSelectTool,
  onCapture,
  position,
  onDragStart,
  orientation,
  isDragging
}) => {
  const isVertical = orientation === 'vertical';

  return (
    <div
      data-tour-id="viewer-toolbar"
      className={`absolute z-40 flex items-center bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl backdrop-blur-md select-none ${
        // Only apply transition when NOT dragging to avoid lag/rubber-banding
        !isDragging ? 'transition-all duration-200' : ''
      } ${
        isVertical ? 'flex-col w-16 py-1' : 'flex-row h-16 px-1'
      }`}
      style={{
        left: position.x,
        top: position.y,
        touchAction: 'none'
      }}
    >
      {/* Drag Handle */}
      <div
        className={`flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 transition-colors hover:bg-slate-800/50 ${
          isVertical 
            ? 'w-full h-8 mb-1 border-b border-slate-700/50 rounded-t-xl' 
            : 'h-full w-8 mr-1 border-r border-slate-700/50 rounded-l-xl'
        }`}
        onMouseDown={onDragStart}
        title="Drag toolbar"
      >
        {isVertical ? <GripHorizontal className="w-4 h-4" /> : <GripVertical className="w-4 h-4" />}
      </div>

      {/* Tools Container */}
      <div className={`flex items-center gap-1.5 p-1 ${isVertical ? 'flex-col' : 'flex-row'}`}>
        {/* Capture Button */}
        <button
          onClick={onCapture}
          data-tour-id="capture-button"
          aria-label="Capture slice for AI assistant"
          className={`rounded-xl text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white transition-all active:scale-95 group border border-transparent hover:border-slate-600 flex items-center justify-center ${
            isVertical ? 'w-10 h-10' : 'p-2.5'
          }`}
          title="Capture Screen"
        >
          <Camera className="w-5 h-5 group-hover:text-purple-400" />
        </button>

        <div className={`bg-slate-700/50 ${isVertical ? 'w-6 h-px my-0.5' : 'w-px h-6 mx-0.5'}`} />

        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => onSelectTool(tool.id)}
              className={`rounded-xl transition-all active:scale-95 border flex items-center justify-center ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50 scale-105 border-indigo-500'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border-transparent hover:border-slate-600'
              } ${isVertical ? 'w-10 h-10' : 'p-2.5'}`}
              title={tool.label}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default FloatingToolbar;
