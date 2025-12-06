
import React, { useState, useEffect } from 'react';
import StudyList from './components/StudyList';
import ViewerCanvas from './components/ViewerCanvas';
import SeriesSelector from './components/SeriesSelector';
import MeasurementPanel from './components/MeasurementPanel';
import SegmentationPanel from './components/SegmentationPanel';
import AiAssistantPanel from './components/AiAssistantPanel';
import { TOOLS, WL_PRESETS, MOCK_SEGMENTATION_DATA } from './constants';
import { Study, Series, ToolMode, ConnectionType, DicomWebConfig, Measurement, SegmentationLayer } from './types';
import { fetchDicomWebSeries } from './services/dicomService';
import { ChevronLeft, Ruler, Activity, Sparkles } from 'lucide-react';

const App: React.FC = () => {
  const [connectionType, setConnectionType] = useState<ConnectionType>(null);
  const [dicomConfig, setDicomConfig] = useState<DicomWebConfig>({ 
    url: 'https://demo.orthanc-server.com/dicom-web', 
    name: 'Orthanc Demo (Europe)',
    useCorsProxy: false
  });

  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [studySeries, setStudySeries] = useState<Series[]>([]);
  const [activeSeries, setActiveSeries] = useState<Series | null>(null);
  const [activeTool, setActiveTool] = useState<ToolMode>(ToolMode.SCROLL);
  
  // Lifted Viewer State
  const [sliceIndex, setSliceIndex] = useState(0);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [activeMeasurementId, setActiveMeasurementId] = useState<string | null>(null);

  // New Segmentation State
  const [activeRightTab, setActiveRightTab] = useState<'measure' | 'segment' | 'ai'>('measure');
  const [segmentationLayer, setSegmentationLayer] = useState<SegmentationLayer>({
    opacity: 0.5,
    isVisible: true,
    activeSegmentId: null,
    segments: MOCK_SEGMENTATION_DATA
  });

  // Load Series Logic
  useEffect(() => {
    async function loadSeries() {
      if (!selectedStudy) {
        setStudySeries([]);
        setActiveSeries(null);
        return;
      }
      try {
        let seriesData: Series[] = [];
        // Only DICOMWEB supported now
        if (connectionType === 'DICOMWEB') {
          seriesData = await fetchDicomWebSeries(dicomConfig, selectedStudy.id);
        }
        setStudySeries(seriesData);
        if (seriesData.length > 0) {
          // Select largest series by default
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

  // Reset viewer state when active series changes
  useEffect(() => {
    if (activeSeries) {
      setSliceIndex(Math.floor(activeSeries.instanceCount / 2));
      setMeasurements([]);
      setActiveMeasurementId(null);
    }
  }, [activeSeries?.id]);

  // Measurement Handlers
  const handleMeasurementAdd = (m: Measurement) => {
    setMeasurements(prev => [...prev, m]);
    setActiveMeasurementId(m.id);
    setActiveTool(ToolMode.POINTER); // Switch back to pointer after measuring
    setActiveRightTab('measure'); // Switch tab to show result
  };

  const handleMeasurementUpdate = (id: string, updates: Partial<Measurement>) => {
    setMeasurements(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const handleMeasurementDelete = (id: string) => {
    setMeasurements(prev => prev.filter(m => m.id !== id));
    if (activeMeasurementId === id) setActiveMeasurementId(null);
  };

  // MODE: DASHBOARD (Study List)
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

  // MODE: VIEWER
  return (
    <div className="flex h-screen w-screen bg-black text-gray-200 font-sans overflow-hidden flex-col">
      
      {/* Header */}
      <div className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 flex-shrink-0">
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

          <div className="flex items-center gap-3">
             <div className="hidden lg:flex items-center bg-gray-950 rounded border border-gray-800 px-2 py-1">
                <span className="text-xs text-gray-500 mr-2 uppercase font-bold">Presets</span>
                <div className="flex gap-1">
                  {WL_PRESETS.map(p => (
                    <button key={p.label} className="text-[10px] px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-300">
                      {p.label}
                    </button>
                  ))}
                </div>
             </div>
          </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
          
          {/* Left: Viewport & Series Strip */}
          <div className="flex-1 flex flex-col relative">
              <ViewerCanvas 
                series={activeSeries} 
                activeTool={activeTool}
                dicomConfig={dicomConfig}
                connectionType={connectionType}
                // Lifted Props
                sliceIndex={sliceIndex}
                onSliceChange={setSliceIndex}
                measurements={measurements}
                onMeasurementAdd={handleMeasurementAdd}
                onMeasurementUpdate={(m) => handleMeasurementUpdate(m.id, m)}
                activeMeasurementId={activeMeasurementId}
                // Segmentation
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

          {/* Right: Tabbed Sidebar */}
          <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800 w-80">
              {/* Tab Switcher */}
              <div className="flex border-b border-slate-800">
                  <button 
                     onClick={() => setActiveRightTab('measure')}
                     className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors ${
                         activeRightTab === 'measure' 
                         ? 'bg-slate-900 text-indigo-400 border-b-2 border-indigo-500' 
                         : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'
                     }`}
                  >
                      <Ruler className="w-3.5 h-3.5" />
                      Measure
                  </button>
                  <button 
                     onClick={() => {
                        setActiveRightTab('segment');
                        if (!segmentationLayer.activeSegmentId) {
                            setSegmentationLayer(prev => ({ ...prev, activeSegmentId: 1 })); // Default select 1
                        }
                     }}
                     className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors ${
                         activeRightTab === 'segment' 
                         ? 'bg-slate-900 text-emerald-400 border-b-2 border-emerald-500' 
                         : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'
                     }`}
                  >
                      <Activity className="w-3.5 h-3.5" />
                      Seg
                  </button>
                  <button 
                     onClick={() => setActiveRightTab('ai')}
                     className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors ${
                         activeRightTab === 'ai' 
                         ? 'bg-slate-900 text-purple-400 border-b-2 border-purple-500' 
                         : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'
                     }`}
                  >
                      <Sparkles className="w-3.5 h-3.5" />
                      AI
                  </button>
              </div>

              {/* Panel Content */}
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
                            // Pass Metadata for AI
                            studyMetadata={{
                              patientName: selectedStudy.patientName,
                              description: selectedStudy.description,
                              modality: selectedStudy.modality
                            }}
                          />
                     </div>
                 )}
                 {activeRightTab === 'segment' && (
                     <div className="absolute inset-0">
                         <SegmentationPanel 
                            layer={segmentationLayer}
                            onChange={setSegmentationLayer}
                            activeTool={activeTool}
                            onSelectTool={setActiveTool}
                         />
                     </div>
                 )}
                 {activeRightTab === 'ai' && (
                     <div className="absolute inset-0">
                         <AiAssistantPanel />
                     </div>
                 )}
              </div>
          </div>

      </div>
    </div>
  );
};

export default App;
