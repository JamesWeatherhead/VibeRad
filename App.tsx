import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import StudyList from './components/StudyList';
import ViewerCanvas from './components/ViewerCanvas';
import SeriesSelector from './components/SeriesSelector';
import MeasurementPanel from './components/MeasurementPanel';
import SegmentationPanel from './components/SegmentationPanel';
import AiAssistantPanel from './components/AiAssistantPanel';
import SafetyModal from './components/SafetyModal';
import GuidedTour from './components/GuidedTour';
import FloatingToolbar from './components/FloatingToolbar';
import { TOOLS, MOCK_SEGMENTATION_DATA } from './constants';
import { Study, Series, ToolMode, ConnectionType, DicomWebConfig, Measurement, SegmentationLayer, ViewerHandle } from './types';
import { fetchDicomWebSeries, searchDicomWebStudies } from './services/dicomService';
import { Ruler, Activity, Sparkles, GripVertical, Shield, Loader2, X, Camera, HelpCircle } from 'lucide-react';

const App: React.FC = () => {
  // connectionType defaults to DICOMWEB to skip intro
  const [connectionType, setConnectionType] = useState<ConnectionType>('DICOMWEB');
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  
  // Default to Orthanc Demo + Proxy (Most Reliable)
  const [dicomConfig, setDicomConfig] = useState<DicomWebConfig>({ 
    url: 'https://demo.orthanc-server.com/dicom-web', 
    name: 'Orthanc Demo (Europe)',
    useCorsProxy: true
  });

  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [studySeries, setStudySeries] = useState<Series[]>([]);
  const [activeSeries, setActiveSeries] = useState<Series | null>(null);
  const [activeTool, setActiveTool] = useState<ToolMode>(ToolMode.SCROLL);
  const [isAutoBooting, setIsAutoBooting] = useState(true);
  const [bootStatus, setBootStatus] = useState("Connecting to Demo Server...");
  
  const viewerRef = useRef<ViewerHandle>(null);
  
  const [sliceIndex, setSliceIndex] = useState(0);
  
  // Measurements State (Scoped by Series ID)
  const [measurementsBySeries, setMeasurementsBySeries] = useState<Record<string, Measurement[]>>({});
  const [activeMeasurementId, setActiveMeasurementId] = useState<string | null>(null);

  // Derived Measurements for Active Series
  const activeSeriesId = activeSeries?.id;
  const measurements = activeSeriesId ? (measurementsBySeries[activeSeriesId] || []) : [];

  // Default to AI tab
  const [activeRightTab, setActiveRightTab] = useState<'measure' | 'segment' | 'ai'>('ai');
  const [segmentationLayer, setSegmentationLayer] = useState<SegmentationLayer>({
    opacity: 0.5,
    isVisible: true,
    activeSegmentId: null,
    segments: MOCK_SEGMENTATION_DATA,
    brushSize: 15,
    segmentedSlices: [] // Initialize new list
  });

  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  
  // Tour State
  const [isTourOpen, setIsTourOpen] = useState(false);

  // Floating Toolbar State
  const [showLegacyToolbar, setShowLegacyToolbar] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 }); 
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [toolbarOrientation, setToolbarOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  // Center toolbar initially
  useLayoutEffect(() => {
    if (viewerContainerRef.current) {
        const { clientWidth } = viewerContainerRef.current;
        // Approx center, slightly down from top
        setToolbarPos({ x: (clientWidth / 2) - 240, y: 24 });
        setToolbarOrientation('horizontal');
    }
  }, [selectedStudy]); // Re-center when study loads

  // Toolbar Drag Logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!isDraggingToolbar || !dragStartRef.current || !viewerContainerRef.current) return;
        
        const deltaX = e.clientX - dragStartRef.current.mouseX;
        const deltaY = e.clientY - dragStartRef.current.mouseY;
        
        // Calculate intended raw position
        let newX = dragStartRef.current.startX + deltaX;
        let newY = dragStartRef.current.startY + deltaY;
        
        const { clientWidth, clientHeight } = viewerContainerRef.current;
        
        // Edge Docking Logic
        const EDGE_THRESHOLD = 56;
        const PADDING = 16;
        
        let intendedOrientation: 'horizontal' | 'vertical' = 'horizontal';

        // Check if docked to left edge
        if (newX <= EDGE_THRESHOLD) {
            intendedOrientation = 'vertical';
            newX = PADDING; // Snap to left edge padding
        } else {
            intendedOrientation = 'horizontal';
        }

        // Determine dimensions based on orientation for clamping
        // Horizontal: ~460w x 80h (including padding/shadow)
        // Vertical: ~80w x 460h
        const tbW = intendedOrientation === 'horizontal' ? 460 : 80;
        const tbH = intendedOrientation === 'horizontal' ? 80 : 460;
        
        // Constrain to container
        newX = Math.max(0, Math.min(newX, clientWidth - tbW));
        newY = Math.max(0, Math.min(newY, clientHeight - tbH));
        
        setToolbarPos({ x: newX, y: newY });
        setToolbarOrientation(intendedOrientation);
    };

    const handleMouseUp = () => {
        setIsDraggingToolbar(false);
        dragStartRef.current = null;
    };

    if (isDraggingToolbar) {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingToolbar]);

  const handleToolbarDragStart = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDraggingToolbar(true);
      dragStartRef.current = {
          mouseX: e.clientX,
          mouseY: e.clientY,
          startX: toolbarPos.x,
          startY: toolbarPos.y
      };
  };

  // Robust Auto-boot logic
  useEffect(() => {
    const autoBoot = async () => {
      // Strategy 1: Orthanc + Proxy
      try {
        setBootStatus("Connecting to Orthanc (Proxy)...");
        const config1 = { 
            url: 'https://demo.orthanc-server.com/dicom-web', 
            name: 'Orthanc Demo (Europe)',
            useCorsProxy: true
        };
        setDicomConfig(config1);
        
        const studies = await searchDicomWebStudies(config1);
        if (studies.length > 0) {
          // Prioritize BRAINIX for the demo as requested
          const demoStudy = studies.find(s => s.patientName.toUpperCase().includes('BRAINIX')) 
                         || studies.find(s => s.modality === 'CT' || s.modality === 'MR') 
                         || studies[0];
          setSelectedStudy(demoStudy);
          setIsAutoBooting(false);
          return;
        }
      } catch (e) {
        console.warn("Orthanc boot failed, retrying with AWS...", e);
      }

      // Strategy 2: AWS Public (Direct)
      try {
         setBootStatus("Retrying with AWS Server...");
         const config2 = {
            url: 'https://d3t6nz73tl5kd8.cloudfront.net/dicomweb',
            name: 'Public AWS Server',
            useCorsProxy: false
         };
         setDicomConfig(config2); // Update state for fallback
         
         const studies = await searchDicomWebStudies(config2);
         if (studies.length > 0) {
            const demoStudy = studies.find(s => s.patientName.toUpperCase().includes('BRAINIX'))
                           || studies.find(s => s.modality === 'CT' || s.modality === 'MR') 
                           || studies[0];
            setSelectedStudy(demoStudy);
            setIsAutoBooting(false);
            return;
         }
      } catch (e) {
         console.error("All auto-boot strategies failed", e);
      } finally {
         setIsAutoBooting(false);
      }
    };
    
    // Slight delay to allow UI to settle
    const timer = setTimeout(autoBoot, 100);
    return () => clearTimeout(timer);
  }, []);

  // Guided Tour Logic
  useEffect(() => {
    // Only check if we are actually viewing a study (not on study list)
    if (selectedStudy) {
      const tourCompleted = localStorage.getItem('viberad.guidedTour.completed');
      if (!tourCompleted) {
        // Small delay to ensure DOM is ready
        const timer = setTimeout(() => setIsTourOpen(true), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [selectedStudy]);

  const handleCloseTour = () => {
    setIsTourOpen(false);
    localStorage.setItem('viberad.guidedTour.completed', 'true');
  };

  const handleRestartTour = () => {
    localStorage.removeItem('viberad.guidedTour.completed');
    setIsTourOpen(true);
  };

  // Global AI Capture State (Lifted)
  const [aiContextImage, setAiContextImage] = useState<string | null>(null);
  const [aiContextSliceInfo, setAiContextSliceInfo] = useState<{slice: number; total?: number; label?: string} | null>(null);
  const [showCaptureToast, setShowCaptureToast] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizingSidebar) return;
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 250 && newWidth < Math.min(800, window.innerWidth * 0.6)) {
            setSidebarWidth(newWidth);
        }
    };
    const handleMouseUp = () => setIsResizingSidebar(false);

    if (isResizingSidebar) {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    async function loadSeries() {
      if (!selectedStudy) {
        setStudySeries([]);
        setActiveSeries(null);
        return;
      }
      try {
        let seriesData: Series[] = [];
        if (connectionType === 'DICOMWEB') {
          seriesData = await fetchDicomWebSeries(dicomConfig, selectedStudy.id);
        }
        setStudySeries(seriesData);
        if (seriesData.length > 0) {
          // Auto-select T1/SE/extrp if available (as requested for Brainix demo)
          const preferredSeries = seriesData.find(s => s.description === 'T1/SE/extrp');
          
          // Fallback to largest series
          const largestSeries = seriesData.reduce((prev, current) => 
            (prev.instanceCount > current.instanceCount) ? prev : current
          );
          
          setActiveSeries(preferredSeries || largestSeries);
          setActiveRightTab('ai');
        } else {
          setActiveSeries(null);
        }
      } catch (err) {
        console.error("Error loading series", err);
      }
    }
    loadSeries();
  }, [selectedStudy, connectionType, dicomConfig]);

  useEffect(() => {
    if (activeSeries) {
      setSliceIndex(Math.floor(activeSeries.instanceCount / 2));
      // Measurements are now persisted by series, so we don't clear them here.
      setActiveMeasurementId(null);
      // Reset capture context on series change to avoid stale context
      setAiContextImage(null);
      setAiContextSliceInfo(null);
      
      // Clear segmented slices list on series change since canvas is cleared
      setSegmentationLayer(prev => ({ ...prev, segmentedSlices: [] }));
    }
  }, [activeSeries?.id]);

  const handleMeasurementAdd = (m: Measurement) => {
    if (!activeSeriesId) return;
    setMeasurementsBySeries(prev => ({
        ...prev,
        [activeSeriesId]: [...(prev[activeSeriesId] || []), m]
    }));
    setActiveMeasurementId(m.id);
    setActiveTool(ToolMode.POINTER); 
    setActiveRightTab('measure'); 
  };

  const handleMeasurementUpdate = (id: string, updates: Partial<Measurement>) => {
    if (!activeSeriesId) return;
    setMeasurementsBySeries(prev => ({
        ...prev,
        [activeSeriesId]: (prev[activeSeriesId] || []).map(m => m.id === id ? { ...m, ...updates } : m)
    }));
  };

  const handleMeasurementDelete = (id: string) => {
    if (!activeSeriesId) return;
    setMeasurementsBySeries(prev => ({
        ...prev,
        [activeSeriesId]: (prev[activeSeriesId] || []).filter(m => m.id !== id)
    }));
    if (activeMeasurementId === id) setActiveMeasurementId(null);
  };
  
  const handleCaptureScreen = () => {
      return viewerRef.current?.captureScreenshot() || null;
  };

  const performGlobalCapture = () => {
    const screenshot = handleCaptureScreen();
    if (screenshot) {
        setAiContextImage(screenshot);
        setAiContextSliceInfo({
            slice: sliceIndex + 1,
            total: activeSeries?.instanceCount,
            label: activeSeries?.description || selectedStudy?.description
        });
        setShowCaptureToast(true);
        setTimeout(() => setShowCaptureToast(false), 3000);
    }
  };

  const clearGlobalCapture = () => {
    setAiContextImage(null);
    setAiContextSliceInfo(null);
  };

  const handleClearSegment = (id: number) => {
     if (viewerRef.current) {
        viewerRef.current.removeSegment(id);
     }
  };

  const handleSegmentedSliceUpdate = (sliceIdx: number, labelCount: number) => {
    setSegmentationLayer(prev => {
        // Remove existing entry for this slice
        const filtered = prev.segmentedSlices.filter(s => s.sliceIndex !== sliceIdx);
        // If it has labels, add new entry
        if (labelCount > 0) {
            return {
                ...prev,
                segmentedSlices: [...filtered, { sliceIndex: sliceIdx, labelCount }]
            };
        }
        // If count is 0, just remove
        return {
            ...prev,
            segmentedSlices: filtered
        };
    });
  };

  return (
    <div className="flex h-screen w-screen bg-black text-gray-200 font-sans overflow-hidden flex-col">
      {/* Top Main Header */}
      <header className="w-full bg-slate-950 border-b border-slate-800 flex-shrink-0 relative z-30">
        <div className="mx-auto flex items-center justify-between px-4 h-14">
          {/* Left: Branding */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 shadow-lg shadow-indigo-500/20">
              <span className="text-xs font-black tracking-tighter text-white">VR</span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold text-slate-100 tracking-tight">VibeRad</span>
              <span className="text-[9px] text-slate-400 font-medium tracking-wide mt-0.5">
                RADIOLOGY TEACHING
              </span>
            </div>
          </div>

          {/* Center: Disclaimer Pill */}
          <div className="hidden md:flex items-center justify-center text-[10px] font-medium text-slate-500 gap-2 bg-slate-900/50 px-3 py-1.5 rounded-full border border-slate-800">
            <Shield className="w-3 h-3 text-amber-500/80" />
            <span>Educational Demo Only</span>
            <span className="text-slate-700">•</span>
            <span>Not for Clinical Use</span>
          </div>

          {/* Right: Safety Action */}
          <button
            onClick={() => setShowSafetyModal(true)}
            className="text-[11px] font-medium text-slate-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5"
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="underline underline-offset-2 decoration-slate-700 hover:decoration-indigo-500/50">Safety &amp; Privacy</span>
          </button>
        </div>
      </header>

      {showSafetyModal && <SafetyModal onClose={() => setShowSafetyModal(false)} />}
      
      {/* Guided Tour Overlay */}
      {isTourOpen && <GuidedTour isOpen={isTourOpen} onClose={handleCloseTour} />}

      {/* Loading Screen for Auto Boot */}
      {isAutoBooting && (
        <div className="fixed inset-0 z-40 bg-slate-950 flex items-center justify-center">
           <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
              <div className="text-slate-400 text-sm font-mono flex flex-col items-center">
                  <span>{bootStatus}</span>
                  <span className="text-xs text-slate-600 mt-2">Connecting to public DICOMweb node...</span>
              </div>
           </div>
        </div>
      )}

      {!selectedStudy ? (
        <div className="h-full w-full bg-slate-950 overflow-hidden">
           <StudyList 
            onSelectStudy={setSelectedStudy} 
            connectionType={connectionType}
            setConnectionType={setConnectionType}
            dicomConfig={dicomConfig}
            setDicomConfig={setDicomConfig}
            onShowSafety={() => setShowSafetyModal(true)}
          />
        </div>
      ) : (
        <>
          {showLegacyToolbar && (
            <div className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-center px-4 flex-shrink-0 z-20">
                {/* Center Tools */}
                <div className="flex items-center justify-center gap-3">
                  {/* Capture Button - Tour Anchor */}
                  <button
                      id="tour-capture-button-legacy" 
                      aria-label="Capture slice for AI assistant"
                      onClick={performGlobalCapture}
                      className="p-2 rounded-md flex flex-col items-center justify-center w-24 transition-all text-gray-400 hover:bg-gray-800 hover:text-gray-200 group"
                      title="Capture current slice"
                  >
                      <Camera className="w-5 h-5 mb-1 group-hover:text-white" />
                      <span className="text-[9px] uppercase font-bold tracking-wider whitespace-nowrap">Capture</span>
                  </button>
                  
                  {/* Divider */}
                  <div className="w-px h-8 bg-gray-800/50 mx-1" />

                  {TOOLS.map((tool) => {
                    const Icon = tool.icon;
                    const isActive = activeTool === tool.id;
                    return (
                      <button
                        key={tool.id}
                        onClick={() => setActiveTool(tool.id)}
                        className={`p-2 rounded-md flex flex-col items-center justify-center w-24 transition-all ${
                          isActive 
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 transform scale-105 z-10' 
                            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                        }`}
                        title={tool.label}
                      >
                        <Icon className="w-5 h-5 mb-1" />
                        <span className="text-[9px] uppercase font-bold tracking-wider whitespace-nowrap">{tool.label}</span>
                      </button>
                    );
                  })}
                </div>
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
              <div 
                ref={viewerContainerRef}
                className="flex-1 flex flex-col relative min-w-0"
              >
                  <FloatingToolbar 
                    activeTool={activeTool}
                    onSelectTool={setActiveTool}
                    onCapture={performGlobalCapture}
                    position={toolbarPos}
                    onDragStart={handleToolbarDragStart}
                    orientation={toolbarOrientation}
                  />

                  <ViewerCanvas 
                    ref={viewerRef}
                    series={activeSeries} 
                    activeTool={activeTool}
                    dicomConfig={dicomConfig}
                    connectionType={connectionType}
                    sliceIndex={sliceIndex}
                    onSliceChange={setSliceIndex}
                    measurements={measurements}
                    onMeasurementAdd={handleMeasurementAdd}
                    onMeasurementUpdate={(m) => handleMeasurementUpdate(m.id, m)}
                    activeMeasurementId={activeMeasurementId}
                    segmentationLayer={segmentationLayer}
                    onSegmentedSliceUpdate={handleSegmentedSliceUpdate}
                  />
                  <div className="flex-shrink-0 z-10">
                    <SeriesSelector 
                      seriesList={studySeries}
                      activeSeriesId={activeSeries?.id}
                      onSelectSeries={setActiveSeries}
                      dicomConfig={dicomConfig}
                    />
                  </div>
              </div>

              <div 
                className={`w-1 bg-slate-800 hover:bg-indigo-500 cursor-col-resize z-30 transition-colors flex flex-col items-center justify-center opacity-0 hover:opacity-100 ${isResizingSidebar ? 'opacity-100 bg-indigo-500' : ''}`}
                onMouseDown={() => setIsResizingSidebar(true)}
              >
                 <GripVertical className="w-3 h-3 text-white" />
              </div>

              <div 
                 className="flex flex-col h-full bg-slate-950 border-l border-slate-800 flex-shrink-0 relative"
                 style={{ width: sidebarWidth }}
              >
                  <div className="flex border-b border-slate-800">
                      <button onClick={() => setActiveRightTab('measure')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors ${activeRightTab === 'measure' ? 'bg-slate-900 text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'}`}><Ruler className="w-3.5 h-3.5" /> Measure</button>
                      <button onClick={() => { setActiveRightTab('segment'); if (!segmentationLayer.activeSegmentId) setSegmentationLayer(prev => ({ ...prev, activeSegmentId: 1 })); }} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors ${activeRightTab === 'segment' ? 'bg-slate-900 text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'}`}><Activity className="w-3.5 h-3.5" /> Seg</button>
                      <button 
                          id="tour-ai-tab" // tour anchor
                          data-tour-id="ai-tab"
                          aria-label="AI Assistant tab"
                          onClick={() => setActiveRightTab('ai')} 
                          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors ${activeRightTab === 'ai' ? 'bg-slate-900 text-purple-400 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'}`}
                      >
                          <Sparkles className="w-3.5 h-3.5" /> AI
                      </button>
                  </div>
                  
                  {/* Quick Tour Link - Subtle and always accessible */}
                  <div className="bg-slate-950/50 border-b border-slate-800 py-1 flex justify-center">
                       <button 
                         onClick={handleRestartTour} 
                         className="text-[11px] text-slate-500 hover:text-purple-300 underline cursor-pointer flex items-center gap-1.5 transition-colors"
                       >
                         <HelpCircle className="w-3 h-3" /> Take a quick tour
                       </button>
                  </div>

                  <div className="flex-1 overflow-hidden relative">
                     {/* Keep all panels mounted to preserve state (especially AI chat) */}
                     <div className={`absolute inset-0 w-full h-full bg-slate-950 ${activeRightTab === 'measure' ? 'block z-10' : 'hidden'}`}>
                         <MeasurementPanel 
                            measurements={measurements}
                            activeMeasurementId={activeMeasurementId}
                            onSelect={setActiveMeasurementId}
                            onUpdate={handleMeasurementUpdate}
                            onDelete={handleMeasurementDelete}
                            onJumpToSlice={setSliceIndex}
                            studyMetadata={{ studyId: selectedStudy.id, patientName: selectedStudy.patientName, description: selectedStudy.description, modality: selectedStudy.modality }}
                          />
                     </div>
                     <div className={`absolute inset-0 w-full h-full bg-slate-950 ${activeRightTab === 'segment' ? 'block z-10' : 'hidden'}`}>
                         <SegmentationPanel 
                            layer={segmentationLayer} 
                            onChange={setSegmentationLayer} 
                            activeTool={activeTool} 
                            onSelectTool={setActiveTool}
                            onClearSegment={handleClearSegment}
                            onJumpToSlice={setSliceIndex}
                         />
                     </div>
                     <div className={`absolute inset-0 w-full h-full bg-slate-950 ${activeRightTab === 'ai' ? 'block z-10' : 'hidden'}`}>
                         <AiAssistantPanel 
                            capturedImage={aiContextImage}
                            capturedSliceMetadata={aiContextSliceInfo}
                            onCaptureTrigger={performGlobalCapture}
                            onClearCapture={clearGlobalCapture}
                            showCaptureToast={showCaptureToast}
                            studyMetadata={{ studyId: selectedStudy.id, patientName: selectedStudy.patientName, description: selectedStudy.description, modality: selectedStudy.modality }}
                            cursor={{ seriesInstanceUID: activeSeries?.id || '', frameIndex: sliceIndex, activeMeasurementId: activeMeasurementId }}
                            onJumpToSlice={setSliceIndex}
                            activeSeriesInfo={activeSeries ? { description: activeSeries.description, instanceCount: activeSeries.instanceCount } : undefined}
                         />
                     </div>
                  </div>
              </div>
          </div>
        </>
      )}
    </div>
  );
};

export default App;