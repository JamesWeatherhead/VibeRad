import React, { useState, useLayoutEffect, useEffect, useRef } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';

interface Step {
  selector: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    selector: '[data-tour-id="series-rail"]',
    title: 'Step 1 · Pick a series',
    body: 'Use the series rail at the bottom to switch between sequences like T1, T2, and FLAIR. Hover to see what each series is best for, then click to load it.'
  },
  {
    selector: '[data-tour-id="capture"]',
    title: 'Step 2 · Capture this slice',
    body: 'Click the Capture Slice camera in the top toolbar to send the current view to the AI Assistant. This freezes what you\'re looking at so the model can see it.'
  },
  {
    selector: '[data-tour-id="ai-tab"]',
    title: 'Step 3 · Ask the AI Assistant',
    body: 'Open the AI tab to ask teaching questions like “What anatomy is in this slice?” or “How does this sequence differ from FLAIR?”. Responses are for education only — never real diagnoses, reports, or treatment decisions.'
  }
];

interface GuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
}

const GuidedTour: React.FC<GuidedTourProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipDimensions, setTooltipDimensions] = useState({ width: 0, height: 0 });
  
  const tooltipRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  // Reset tour state when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  // Update target position and focus management
  useLayoutEffect(() => {
    if (!isOpen) return;

    const updateTarget = () => {
      const step = STEPS[currentStep];
      const el = document.querySelector(step.selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        // Ensure element is actually visible
        if (rect.width > 0 && rect.height > 0) {
           setTargetRect(rect);
        } else {
           setTargetRect(null);
        }
      } else {
        setTargetRect(null);
      }
    };

    updateTarget();
    window.addEventListener('resize', updateTarget);
    window.addEventListener('scroll', updateTarget, true);

    // Auto-focus the next button for accessibility
    const timer = setTimeout(() => {
        nextButtonRef.current?.focus();
    }, 100);

    return () => {
      window.removeEventListener('resize', updateTarget);
      window.removeEventListener('scroll', updateTarget, true);
      clearTimeout(timer);
    };
  }, [isOpen, currentStep]);

  // Measure tooltip for positioning calculations
  useLayoutEffect(() => {
    if (tooltipRef.current) {
        const { width, height } = tooltipRef.current.getBoundingClientRect();
        setTooltipDimensions({ width, height });
    }
  }, [isOpen, currentStep, targetRect]); // Re-measure if content changes (title/body length)

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;

  // Calculate Tooltip Position
  let tooltipStyle: React.CSSProperties = {};

  if (targetRect) {
    // 1. Horizontal Centering
    const targetCenterX = targetRect.left + (targetRect.width / 2);
    let left = targetCenterX - (tooltipDimensions.width / 2);
    
    // Clamp to window edges with 16px padding
    const maxLeft = window.innerWidth - tooltipDimensions.width - 16;
    left = Math.max(16, Math.min(left, maxLeft));

    // 2. Vertical Positioning (Prefer Bottom, Flip to Top if needed)
    const gap = 16;
    const padding = 8; // Extra padding around highlight
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;
    
    let top: number;
    
    // Check if bottom fits
    if (spaceBelow >= tooltipDimensions.height + gap + padding || spaceBelow > spaceAbove) {
        top = targetRect.bottom + gap + padding;
    } else {
        top = targetRect.top - tooltipDimensions.height - gap - padding;
    }

    tooltipStyle = {
        position: 'fixed',
        top,
        left,
        zIndex: 120
    };
  } else {
    // Fallback: Center Screen
    tooltipStyle = {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 120
    };
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
        
        {/* 1. Interaction Blocker: Transparent, covers screen, stops clicks on app */}
        <div className="absolute inset-0 bg-transparent" onClick={(e) => e.stopPropagation()} />

        {/* 2. Visual Overlay (Highlight Box) */}
        {/* The huge shadow creates the dark backdrop. pointer-events-none lets us see through to... well, nothing interactive here. */}
        {targetRect ? (
             <div 
                className="absolute z-[110] rounded-xl ring-2 ring-purple-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] pointer-events-none transition-all duration-300 ease-in-out"
                style={{
                    top: targetRect.top - 4,
                    left: targetRect.left - 4,
                    width: targetRect.width + 8,
                    height: targetRect.height + 8,
                }}
             />
        ) : (
            // Fallback dark overlay if no target
            <div className="absolute inset-0 bg-black/70 z-[110] pointer-events-none" />
        )}

        {/* 3. Tooltip Card */}
        <div 
            ref={tooltipRef}
            className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-[360px] max-w-[90vw] shadow-2xl flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-300 absolute"
            style={tooltipStyle}
        >
            <div className="flex justify-between items-start">
                <h3 className="text-base font-bold text-slate-100 leading-tight">
                    {step.title}
                </h3>
                <button 
                    onClick={onClose} 
                    className="text-slate-500 hover:text-white transition-colors"
                    aria-label="Close tour"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
            
            <p className="text-sm text-slate-300 leading-relaxed">
                {step.body}
            </p>

            <div className="flex items-center justify-between pt-2 mt-1">
                <div className="text-xs text-slate-500 font-mono">
                    {currentStep + 1} / {STEPS.length}
                </div>
                
                <div className="flex items-center gap-3">
                    <button 
                        onClick={onClose}
                        className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        Skip tour
                    </button>
                    <button
                        ref={nextButtonRef}
                        onClick={handleNext}
                        className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-purple-900/20"
                    >
                        {isLast ? 'Done' : 'Next'}
                        {isLast ? <Check className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default GuidedTour;