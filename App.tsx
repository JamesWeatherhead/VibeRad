import React, { useState, useEffect, useRef } from 'react';
import StudyList from './components/StudyList';
import IntroScreen from './components/IntroScreen';
import ViewerCanvas from './components/ViewerCanvas';
import SeriesSelector from './components/SeriesSelector';
import MeasurementPanel from './components/MeasurementPanel';
import SegmentationPanel from './components/SegmentationPanel';
import AiAssistantPanel from './components/AiAssistantPanel';
import { TOOLS, MOCK_SEGMENTATION_DATA } from './constants';
import { Study, Series, ToolMode, ConnectionType, DicomWebConfig, Measurement, SegmentationLayer, ViewerHandle } from './types';
import { fetchDicomWebSeries } from './services/dicomService';
import { ChevronLeft, Ruler, Activity, Sparkles, GripVertical } from 'lucide-react';

const App: React.FC = () => {
  const [hasStarted, setHasStarted] = useState(false);
  const [connectionType, setConnectionType] = useState<ConnectionType>(null);
  
  const [dicomConfig, setDicomConfig] = useState<DicomWebConfig>({ 
    url: 'https://demo.orthanc-server.com/dicom-web', 
    name: 'Orthanc Demo (Europe)',
    useCorsProxy: true
  });

  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [studySeries, setStudySeries] = useState<Series[]>([]);
  const [activeSeries, setActiveSeries] = useState<Series | null>(null);
  const [activeTool, setActiveTool] = useState<ToolMode>(ToolMode.SCROLL);
  
  const viewerRef = useRef<ViewerHandle>(null);
  
  const [sliceIndex, setSliceIndex] = useState(0);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [activeMeasurementId, setActiveMeasurementId] = useState<string | null>(null);

  const [activeRightTab, setActiveRightTab] = useState<'measure' | 'segment' | 'ai'>('measure');
  const [segmentationLayer, setSegmentationLayer] = useState<SegmentationLayer>({
    opacity: 0.5,
    isVisible: true,
    activeSegmentId: null,
    segments: MOCK_SEGMENTATION_DATA,
    brushSize: 15
  });

  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  const handleStartDemo = () => {
      setConnectionType('DICOMWEB');
      setHasStarted(true);
  };

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
          const bestSeries = seriesData.reduce((prev, current) => 
            (prev.instanceCount > current.instanceCount) ? prev : current
          );
          setActiveSeries(bestSeries);
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

  if (!hasStarted) {
      return <IntroScreen onStartDemo={handleStartDemo} />;
  }

  if (!selectedStudy) {
     return (
        <div className="h-screen w-screen bg-slate-950 overflow-hidden">
           <StudyList 
            onSelectStudy={setSelectedStudy} 
            connectionType={connectionType}
            setConnectionType={setConnectionType}
            dicomConfig={dicomConfig}
            setDicomConfig={setDicomConfig}
          />
        </div>
     );
  }

  return (
    <div className="flex h-screen w-screen bg-black text-gray-200 font-sans overflow-hidden flex-col">
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
                <span className="text-[10px] text-gray-400 font-mono">{selectedStudy.patientId} • {selectedStudy.studyDate}</span>
             </div>
          </div>

          <div className="flex items-center space-x-1">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id)}
                  className={`p-2 rounded-md flex flex-col items-center justify-center w-16 transition-all ${
                    isActive 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 transform scale-105' 
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                  title={tool.label}
                >
                  <Icon className="w-5 h-5 mb-0.5" />
                  <span className="text-[9px] uppercase font-medium tracking-wider">{tool.label}</span>
                </button>
              );
            })}
          </div>
          <div className="w-20"></div>
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
    </div>
  );
};

export default App;