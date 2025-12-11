
import React, { useState, useLayoutEffect, useEffect, useRef } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';

export type TourId = 'quick-start' | 'ai-tour' | 'seg-tour' | 'measure-tour';

interface Step {
  selector: string;
  title: string;
  body: string;
}

const TOURS: Record<TourId, Step[]> = {
  'quick-start': [
    {
      selector: '[data-tour-id="safety-banner"]',
      title: 'Step 1 · Safety First',
      body: 'VibeRad is an educational MRI viewer with anonymized demo data. Never use it for real patient care or treatment decisions.'
    },
    {
      selector: '[data-tour-id="series-rail"]',
      title: 'Step 2 · Pick a series',
      body: 'Different MRI “looks” of the same brain. Hover a tile to see what that view is good for, then click to load it.'
    },
    {
      selector: '[data-tour-id="viewer-toolbar"]',
      title: 'Step 3 · Viewer Tools',
      body: 'Use these tools to scroll through slices, zoom, pan, and adjust brightness/contrast. Try scrolling to see the anatomy change.'
    },
    {
      selector: '[data-tour-id="capture-button"]',
      title: 'Step 4 · Capture & Ask',
      body: 'Capture the current slice with the camera, then open the AI tab to ask teaching questions about what you’re seeing. Answers are for education only.'
    },
    {
      selector: '[data-tour-id="tours-menu-button"]',
      title: 'Step 5 · Explore More',
      body: 'Access specific tutorials for the AI Assistant, Segmentation tools, and Measurements anytime from this menu.'
    }
  ],
  'ai-tour': [
    {
      selector: '[data-tour-id="ai-panel"]',
      title: 'AI Role & Safety',
      body: 'This AI is a radiology teaching assistant. It can explain anatomy and help you describe what you see, but it will never give real diagnoses, reports, or treatment decisions.'
    },
    {
      selector: '[data-tour-id="teaching-levels"]',
      title: 'Teaching Levels',
      body: 'Choose HS, Undergrad, Med, or Resident. I’ll answer as if I’m teaching at that level—from plain language and analogies at the High School level, up to board-style reasoning at the Residency level.'
    },
    {
      selector: '[data-tour-id="ai-suggestions"]',
      title: 'Tailored Suggestions',
      body: 'Suggested follow-ups adapt to your chosen level. You’ll see simple, foundational questions at the High School level, progressing to advanced clinical reasoning prompts at the Residency level.'
    },
    {
      selector: '[data-tour-id="capture-button"]',
      title: 'Context is Key',
      body: 'Before asking about a specific image, capture the slice with the camera. This lets the tutor “see” what you see. Without it, answers will be generic.'
    },
    {
      selector: '[data-tour-id="ai-trash"]',
      title: 'Reset',
      body: 'Use the trash icon to clear the conversation and start a fresh teaching session.'
    }
  ],
  'seg-tour': [
    {
      selector: '[data-tour-id="seg-header"]',
      title: 'Segmentation Layer',
      body: 'This panel controls the segmentation overlay. Use it to highlight anatomy for teaching purposes.'
    },
    {
      selector: '[data-tour-id="seg-controls"]',
      title: 'Tools & Opacity',
      body: 'Adjust the global opacity of your segmentations or switch between Pointer, Brush, and Eraser tools.'
    },
    {
      selector: '[data-tour-id="seg-palette"]',
      title: 'Segments Palette',
      body: 'Create new labels (colors) here. Click a label to make it active, then paint on the slice to define that structure.'
    }
  ],
  'measure-tour': [
    {
      selector: '[data-tour-id="measure-header"]',
      title: 'Measurements',
      body: 'Track your distance measurements here. Click a measurement to jump to its slice.'
    },
    {
      selector: '[data-tour-id="measure-list"]',
      title: 'Practice Only',
      body: 'These tools are for educational practice. Measurements are not calibrated for clinical diagnosis or surgical planning.'
    }
  ]
};

interface GuidedTourProps {
  tourId: TourId | null;
  onClose: () => void;
}

const GuidedTour: React.FC<GuidedTourProps> = ({ tourId, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipDimensions, setTooltipDimensions] = useState({ width: 0, height: 0 });
  
  const tooltipRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  // Reset tour state when tourId changes
  useEffect(() => {
    if (tourId) {
      setCurrentStep(0);
    }
  }, [tourId]);

  const steps = tourId ? TOURS[tourId] : [];
  const isOpen = !!tourId && steps.length > 0;

  // Update target position and focus management
  useLayoutEffect(() => {
    if (!isOpen) return;

    const updateTarget = () => {
      const step = steps[currentStep];
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
  }, [isOpen, currentStep, steps]);

  // Measure tooltip for positioning calculations
  useLayoutEffect(() => {
    if (tooltipRef.current) {
        const { width, height } = tooltipRef.current.getBoundingClientRect();
        setTooltipDimensions({ width, height });
    }
  }, [isOpen, currentStep, targetRect]); 

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
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  // Calculate Tooltip Position
  let tooltipStyle: React.CSSProperties = {};

  if (targetRect) {
    // 1. Horizontal Centering & Clamping
    const targetCenterX = targetRect.left + (targetRect.width / 2);
    let left = targetCenterX - (tooltipDimensions.width / 2);
    
    // Clamp to window edges with 16px padding
    const maxLeft = window.innerWidth - tooltipDimensions.width - 16;
    left = Math.max(16, Math.min(left, maxLeft));

    // 2. Vertical Positioning (Smart Flip + Clamping)
    const gap = 12;
    const padding = 8; // Extra padding around highlight
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;
    const tooltipH = tooltipDimensions.height;
    
    let top: number;
    
    // Check fits
    const fitsBelow = spaceBelow >= tooltipH + gap + padding;
    const fitsAbove = spaceAbove >= tooltipH + gap + padding;

    // Preference: Bottom > Top > Larger Space
    if (fitsBelow) {
        top = targetRect.bottom + gap + padding;
    } else if (fitsAbove) {
        top = targetRect.top - tooltipH - gap - padding;
    } else {
        // If neither fits perfectly, assume overlaps or pick largest space
        if (spaceBelow > spaceAbove) {
            top = targetRect.bottom + gap + padding;
        } else {
            top = targetRect.top - tooltipH - gap - padding;
        }
    }

    // 3. Strict Vertical Clamping
    // Ensure the tooltip never renders off-screen, even if it has to overlap the target
    const maxTop = window.innerHeight - tooltipH - 16;
    top = Math.max(16, Math.min(top, maxTop));

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
        
        {/* 1. Interaction Blocker */}
        <div className="absolute inset-0 bg-transparent" onClick={(e) => e.stopPropagation()} />

        {/* 2. Visual Overlay (Highlight Box) */}
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
                    {currentStep + 1} / {steps.length}
                </div>
                
                <div className="flex items-center gap-3">
                    <button 
                        onClick={onClose}
                        className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        End tour
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
