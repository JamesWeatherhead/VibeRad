
import React, { useState, useEffect } from 'react';
import { Study, ConnectionType, DicomWebConfig, DiagnosticStep } from '../types';
import { searchDicomWebStudies, runConnectionDiagnostics } from '../services/dicomService';
import { 
  Search, HardDrive, CheckCircle2, XCircle, 
  Loader2, Play, Calendar, FileText, Layers, User, Shield, FolderOpen
} from 'lucide-react';

interface StudyListProps {
  onSelectStudy: (study: Study) => void;
  connectionType: ConnectionType;
  setConnectionType: (type: ConnectionType) => void;
  dicomConfig: DicomWebConfig;
  setDicomConfig: (config: DicomWebConfig) => void;
  onShowSafety?: () => void;
}

const StudyList: React.FC<StudyListProps> = ({ 
  onSelectStudy, 
  connectionType,
  dicomConfig,
  setDicomConfig,
  onShowSafety
}) => {
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Connection Modal State
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [diagnosticSteps, setDiagnosticSteps] = useState<DiagnosticStep[]>([]);
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);

  // Filter State
  const [filters, setFilters] = useState({
    patientName: '',
    modality: '',
    description: ''
  });

  useEffect(() => {
    // Check if we can find the files immediately
    loadStudies();
  }, []);

  const loadStudies = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch "Local" studies from our new service
      const data = await searchDicomWebStudies(dicomConfig);
      setStudies(data);
      
      // AUTO-SELECT for demo/app feel
      if (data.length > 0) {
        onSelectStudy(data[0]);
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to load local studies");
    } finally {
      setLoading(false);
    }
  };

  // Client-side filtering
  const filteredStudies = studies.filter(study => {
    return (
      study.patientName.toLowerCase().includes(filters.patientName.toLowerCase()) &&
      study.modality.toLowerCase().includes(filters.modality.toLowerCase()) &&
      study.description.toLowerCase().includes(filters.description.toLowerCase())
    );
  });

  const runDiagnostics = async () => {
    setDiagnosticRunning(true);
    setDiagnosticSteps([{ id: '1-local-check', name: 'Checking Asset Availability', status: 'PENDING' }]);
    
    const updateStep = (id: string, status: DiagnosticStep['status'], message?: string) => {
      setDiagnosticSteps(prev => prev.map(s => s.id === id ? { ...s, status, message } : s));
    };

    const success = await runConnectionDiagnostics(dicomConfig, updateStep);
    setDiagnosticRunning(false);

    if (success) {
      setTimeout(() => {
        setShowConnectionModal(false);
        loadStudies();
      }, 500);
    }
  };

  // --- RENDER HELPERS ---
  const renderConnectionModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-[600px] max-w-full overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-700 bg-slate-950 flex items-center gap-3">
          <HardDrive className="w-6 h-6 text-indigo-500" />
          <div>
            <h2 className="text-xl font-bold text-white">Data Source</h2>
            <p className="text-slate-400 text-sm">VibeRad loads static files from the configured asset path.</p>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 space-y-4">
             <div className="text-sm text-slate-300 space-y-2">
                <p>Ensure your data is available (Local or GitHub):</p>
                <div className="bg-black/50 p-3 rounded font-mono text-xs text-slate-400 border border-slate-800 break-all">
                    1. Check <strong>data/localData.ts</strong><br/>
                    2. Configure <strong>REMOTE_ASSET_BASE_URL</strong> if using GitHub<br/>
                    3. Or place files in <strong>/public/images/sub-1/</strong> locally
                </div>
             </div>

             {diagnosticSteps.length > 0 && (
                <div className="bg-black/40 rounded border border-slate-800 p-3 space-y-2 mt-4">
                  {diagnosticSteps.map(step => (
                    <div key={step.id} className="flex items-start gap-2 text-sm">
                      <div className="mt-0.5">
                        {step.status === 'RUNNING' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                        {step.status === 'PASS' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {step.status === 'FAIL' && <XCircle className="w-4 h-4 text-red-500" />}
                        {step.status === 'PENDING' && <div className="w-4 h-4 rounded-full border border-slate-600" />}
                      </div>
                      <div className="flex-1">
                        <span className={`font-medium ${step.status === 'FAIL' ? 'text-red-400' : step.status === 'PASS' ? 'text-green-400' : 'text-slate-400'}`}>
                          {step.name}
                        </span>
                        {step.message && <div className="text-xs text-slate-500">{step.message}</div>}
                      </div>
                    </div>
                  ))}
                </div>
             )}
          </div>
        </div>

        <div className="p-6 bg-slate-950 border-t border-slate-700 flex justify-end gap-3">
           <button 
             onClick={runDiagnostics} 
             disabled={diagnosticRunning}
             className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium flex items-center gap-2 disabled:opacity-50"
           >
             {diagnosticRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
             Check Connection & Load
           </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      {showConnectionModal && renderConnectionModal()}

      {/* Header / Toolbar */}
      <div className="h-16 border-b border-slate-800 bg-slate-900 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
           <h1 className="text-xl font-bold text-slate-100 tracking-tight">Study List</h1>
           <div className="h-6 w-px bg-slate-700 mx-2"></div>
           <button 
             onClick={() => setShowConnectionModal(true)}
             className="text-xs px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors flex items-center gap-2"
           >
             <FolderOpen className="w-3 h-3 text-emerald-500" />
             Demo Data Source
           </button>
        </div>
        
        <div className="flex items-center gap-2">
           <button 
             onClick={onShowSafety}
             className="hidden lg:flex items-center gap-2 px-4 py-1.5 bg-indigo-950/30 border border-indigo-900/50 rounded-full hover:bg-indigo-900/50 transition-colors"
           >
             <Shield className="w-3 h-3 text-indigo-400" />
             <span className="text-xs text-indigo-300 font-medium">Educational Demo Only • Not for Clinical Use</span>
           </button>
           <button onClick={loadStudies} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white" title="Refresh">
             <Loader2 className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
           </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900/50 border-b border-slate-800 p-4 grid grid-cols-12 gap-4">
         <div className="col-span-4">
            <div className="relative">
               <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
               <input 
                 className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                 placeholder="Filter Patient Name..."
                 value={filters.patientName}
                 onChange={e => setFilters({...filters, patientName: e.target.value})}
               />
            </div>
         </div>
         <div className="col-span-5">
             <input 
               className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
               placeholder="Filter Description..."
               value={filters.description}
               onChange={e => setFilters({...filters, description: e.target.value})}
            />
         </div>
         <div className="col-span-3">
            <input 
               className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
               placeholder="Filter Modality..."
               value={filters.modality}
               onChange={e => setFilters({...filters, modality: e.target.value})}
            />
         </div>
      </div>

      {/* Data Grid */}
      <div className="flex-1 overflow-auto bg-slate-950">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-900 sticky top-0 z-10 text-xs uppercase font-bold text-slate-500 tracking-wider">
             <tr>
               <th className="px-6 py-3 border-b border-slate-800">Patient Name</th>
               <th className="px-6 py-3 border-b border-slate-800">Study Date</th>
               <th className="px-6 py-3 border-b border-slate-800 w-1/3">Description</th>
               <th className="px-6 py-3 border-b border-slate-800">Modality</th>
               <th className="px-6 py-3 border-b border-slate-800 text-center">Images</th>
             </tr>
          </thead>
          <tbody className="text-sm divide-y divide-slate-800/50">
             {loading && (
               <tr>
                 <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    Loading Local Studies...
                 </td>
               </tr>
             )}
             {!loading && filteredStudies.length === 0 && (
                <tr>
                   <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      No local studies found. <br/>
                      <span className="text-xs mt-2 block">Ensure files are configured in data/localData.ts</span>
                   </td>
                </tr>
             )}
             {filteredStudies.map((study) => {
               return (
                <tr 
                  key={study.id} 
                  onClick={() => onSelectStudy(study)}
                  className="hover:bg-indigo-900/10 cursor-pointer transition-colors group"
                >
                   <td className="px-6 py-4 font-medium text-slate-200 group-hover:text-indigo-300">
                     <div className="flex items-center gap-2">
                       <User className="w-4 h-4 text-slate-500" />
                       {study.patientName}
                     </div>
                   </td>
                   <td className="px-6 py-4 text-slate-400">
                     <div className="flex items-center gap-2">
                        <Calendar className="w-3 h-3 text-slate-600" />
                        {study.studyDate}
                     </div>
                   </td>
                   <td className="px-6 py-4 text-slate-300">
                     <div className="flex items-center gap-2">
                       <FileText className="w-3 h-3 text-slate-600" />
                       {study.description}
                     </div>
                   </td>
                   <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        {study.modality}
                      </span>
                   </td>
                   <td className="px-6 py-4 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-1">
                        <Layers className="w-3 h-3" />
                        {study.instanceCount}
                      </div>
                   </td>
                </tr>
               )
             })}
          </tbody>
        </table>
      </div>
      <div className="h-8 bg-slate-900 border-t border-slate-800 flex items-center px-4 text-xs text-slate-500">
         Data Mode Active
      </div>
    </div>
  );
};

export default StudyList;