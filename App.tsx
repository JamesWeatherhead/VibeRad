import React, { useState, useEffect, useRef } from 'react';
import StudyList from './components/StudyList';
import ViewerCanvas from './components/ViewerCanvas';
import SeriesSelector from './components/SeriesSelector';
import MeasurementPanel from './components/MeasurementPanel';
import SegmentationPanel from './components/SegmentationPanel';
import AiAssistantPanel from './components/AiAssistantPanel';
import SafetyModal from './components/SafetyModal';
import { TOOLS, MOCK_SEGMENTATION_DATA } from './constants';
import { Study, Series, ToolMode, ConnectionType, DicomWebConfig, Measurement, SegmentationLayer, ViewerHandle } from './types';
import { fetchDicomWebSeries, searchDicomWebStudies } from './services/dicomService';
import { ChevronLeft, Ruler, Activity, Sparkles, GripVertical, Shield, AlertTriangle, Loader2 } from 'lucide-react';

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
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [activeMeasurementId, setActiveMeasurementId] = useState<string | null>(null);

  // Default to AI tab
  const [activeRightTab, setActiveRightTab] = useState<'measure' | 'segment' | 'ai'>('ai');
  const [segmentationLayer, setSegmentationLayer] = useState<SegmentationLayer>({
    opacity: 0.5,
    isVisible: true,
    activeSegmentId: null,
    segments: MOCK_SEGMENTATION_DATA,
    brushSize: 15
  });

  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

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
      setMeasurements([]);
      setActiveMeasurementId(null);
    }
  }, [activeSeries?.id]);

  const handleMeasurementAdd = (m: Measurement) => {
    setMeasurements(prev => [...prev, m]);
    setActiveMeasurementId(m.id);
    setActiveTool(ToolMode.POINTER); 
    setActiveRightTab('measure'); 
  };

  const handleMeasurementUpdate = (id: string, updates: Partial<Measurement>) => {
    setMeasurements(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const handleMeasurementDelete = (id: string) => {
    setMeasurements(prev => prev.filter(m => m.id !== id));
    if (activeMeasurementId === id) setActiveMeasurementId(null);
  };
  
  const handleCaptureScreen = () => {
      return viewerRef.current?.captureScreenshot() || null;
  };

  return (
    <div className="flex h-screen w-screen bg-black text-gray-200 font-sans overflow-hidden flex-col">
      {/* Top Safety Bar */}
      <div className="h-6 bg-indigo-950 flex items-center justify-center gap-2 px-4 text-[10px] font-medium text-indigo-200 border-b border-indigo-900/50 flex-shrink-0 z-50">
         <Shield className="w-3 h-3 text-indigo-400" />
         <span>VibeRad · Gemini Copilot · Educational Demo Only · Not for Clinical Use</span>
         <button onClick={() => setShowSafetyModal(true)} className="ml-2 underline hover:text-white">Safety & Privacy</button>
      </div>

      {showSafetyModal && <SafetyModal onClose={() => setShowSafetyModal(false)} />}

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
          <div className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 flex-shrink-0 z-20">
              <div className="flex items-center gap-4">
                 <button 
                   onClick={() => setSelectedStudy(null)}
                   className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors text-sm font-medium"
                 >
                   <ChevronLeft className="w-4 h-4" />
                   Study List
                 </button>
                 <div className="h-6 w-px bg-gray-700"></div>
                 <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-100 leading-none">{selectedStudy.patientName}</span>
                    <span className="text-xs text-gray-400 font-mono mt-0.5 opacity-80">{selectedStudy.patientId} • {selectedStudy.studyDate}</span>
                 </div>
              </div>

              {/* Center Tools */}
              <div className="flex items-center justify-center gap-3">
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

              {/* Right Side: Spacer to balance layout */}
              <div className="w-auto flex justify-end min-w-[100px]">
                 <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">
                    <Activity className="w-3 h-3 text-green-500" />
                    <span>Live Session</span>
                 </div>
              </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col relative min-w-0">
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
                      <button onClick={() => setActiveRightTab('ai')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors ${activeRightTab === 'ai' ? 'bg-slate-900 text-purple-400 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'}`}><Sparkles className="w-3.5 h-3.5" /> AI</button>
                  </div>

                  <div className="flex-1 overflow-hidden relative">
                     {activeRightTab === 'measure' && (
                         <div className="absolute inset-0">
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
                     )}
                     {activeRightTab === 'segment' && (
                         <div className="absolute inset-0">
                             <SegmentationPanel layer={segmentationLayer} onChange={setSegmentationLayer} activeTool={activeTool} onSelectTool={setActiveTool} />
                         </div>
                     )}
                     {activeRightTab === 'ai' && (
                         <div className="absolute inset-0">
                             <AiAssistantPanel 
                                onCaptureScreen={handleCaptureScreen}
                                studyMetadata={{ studyId: selectedStudy.id, patientName: selectedStudy.patientName, description: selectedStudy.description, modality: selectedStudy.modality }}
                                cursor={{ seriesInstanceUID: activeSeries?.id || '', frameIndex: sliceIndex, activeMeasurementId: activeMeasurementId }}
                                onJumpToSlice={setSliceIndex}
                             />
                         </div>
                     )}
                  </div>
              </div>
          </div>
        </>
      )}
    </div>
  );
};

export default App;
