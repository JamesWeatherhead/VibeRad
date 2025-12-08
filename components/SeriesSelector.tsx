import React, { useState, useEffect, useRef } from 'react';
import { Series, DicomWebConfig } from '../types';
import { Layers, Loader2 } from 'lucide-react';
import { fetchDicomImageBlob } from '../services/dicomService';
import { SERIES_DESCRIPTIONS } from '../constants';

interface SeriesSelectorProps {
  seriesList: Series[];
  activeSeriesId?: string;
  onSelectSeries: (series: Series) => void;
  dicomConfig: DicomWebConfig;
}

interface SeriesThumbnailProps {
  series: Series;
  isActive: boolean;
  onClick: (s: Series) => void;
  dicomConfig: DicomWebConfig;
}

const SeriesThumbnail: React.FC<SeriesThumbnailProps> = ({ series, isActive, onClick, dicomConfig }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  
  // Use a ref to track if component is mounted to prevent state updates after unmount
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    
    // Cleanup previous object URL to avoid memory leaks
    return () => {
      isMounted.current = false;
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    };
  }, []); // Run once on mount to setup cleanup, URL management handles the rest

  useEffect(() => {
    // Reset state when series changes
    setHasError(false);
    setIsLoading(true);
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    setThumbUrl(null);
    
    if (series.instances && series.instances.length > 0) {
      loadRobustThumbnail();
    } else {
      setIsLoading(false);
      setThumbUrl(null);
    }
  }, [series.id, series.instances, dicomConfig]);

  const loadRobustThumbnail = async () => {
    if (!series.instances || series.instances.length === 0) return;

    const maxRetries = 3;
    const usedIndices = new Set<number>();
    let attempts = 0;
    let success = false;

    // Try up to maxRetries unique random images
    while (attempts < maxRetries && usedIndices.size < series.instances.length) {
       // Pick a random index
       let idx = Math.floor(Math.random() * series.instances.length);
       
       // Ensure we haven't tried this one yet
       while (usedIndices.has(idx) && usedIndices.size < series.instances.length) {
          idx = Math.floor(Math.random() * series.instances.length);
       }
       usedIndices.add(idx);

       try {
          const url = series.instances[idx];
          // Use the robust fetch service that handles headers/proxies/fallbacks
          const blob = await fetchDicomImageBlob(dicomConfig, url);
          
          if (isMounted.current && blob) {
             const objectUrl = URL.createObjectURL(blob);
             setThumbUrl(objectUrl);
             setIsLoading(false);
             success = true;
             return;
          }
       } catch (e) {
          // console.warn(`Failed to load thumbnail for series ${series.id} (attempt ${attempts + 1})`);
       }
       attempts++;
    }

    if (!success && isMounted.current) {
        setHasError(true);
        setIsLoading(false);
    }
  };

  const tooltip = SERIES_DESCRIPTIONS[series.description] || series.description;

  return (
    <div
      onClick={() => onClick(series)}
      title={tooltip}
      className={`flex-shrink-0 w-24 h-24 bg-gray-950 border rounded-lg cursor-pointer relative group overflow-hidden transition-all ${
        isActive 
          ? 'border-indigo-500 ring-1 ring-indigo-500/50 shadow-lg shadow-indigo-900/20' 
          : 'border-gray-800 hover:border-gray-600'
      }`}
    >
        {thumbUrl && !hasError ? (
            <img 
              src={thumbUrl} 
              alt={series.description}
              className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
            />
        ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30 group-hover:opacity-50 transition-opacity bg-slate-900">
                {isLoading ? (
                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                ) : (
                    <Layers className="w-8 h-8 text-indigo-300" />
                )}
            </div>
        )}
        
        {/* Gradient for text legibility */}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/90 to-transparent pointer-events-none" />

        <div className="absolute bottom-1 left-2 right-2 z-10">
            <div className="text-[10px] font-bold text-gray-200 truncate leading-tight">
                {series.description}
            </div>
        </div>

        <div className="absolute top-1 right-1 text-[9px] bg-indigo-900/80 backdrop-blur-sm text-indigo-100 px-1.5 py-0.5 rounded border border-indigo-500/30 z-10 font-mono">
            {series.instanceCount} img
        </div>
        
        {isActive && (
           <div className="absolute top-0 right-0 w-2 h-2 bg-indigo-500 rounded-bl shadow-lg shadow-indigo-500/50 z-20" />
        )}
    </div>
  );
}

const SeriesSelector: React.FC<SeriesSelectorProps> = ({ seriesList, activeSeriesId, onSelectSeries, dicomConfig }) => {
  if (seriesList.length === 0) return null;

  return (
    <div className="bg-black border-t border-gray-800 flex flex-col">
       <div className="px-3 py-2 bg-slate-900/80 border-b border-slate-800 backdrop-blur-sm z-10">
           <span className="text-xs text-slate-300 block leading-tight">
             <strong className="text-slate-200">Series browser</strong> · Different MRI “looks” of the same brain. Hover a tile to see what that view is good for.
           </span>
       </div>
       <div className="h-28 flex overflow-x-auto no-scrollbar items-center px-2 gap-2 bg-black/50">
          {seriesList.map((series) => (
            <SeriesThumbnail 
               key={series.id}
               series={series}
               isActive={activeSeriesId === series.id}
               onClick={onSelectSeries}
               dicomConfig={dicomConfig}
            />
          ))}
       </div>
    </div>
  );
};

export default SeriesSelector;