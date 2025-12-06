import React from 'react';
import { Series } from '../types';
import { Layers } from 'lucide-react';

interface SeriesSelectorProps {
  seriesList: Series[];
  activeSeriesId?: string;
  onSelectSeries: (series: Series) => void;
}

const SeriesSelector: React.FC<SeriesSelectorProps> = ({ seriesList, activeSeriesId, onSelectSeries }) => {
  if (seriesList.length === 0) return null;

  return (
    <div className="h-32 bg-black border-t border-gray-800 flex overflow-x-auto no-scrollbar items-center p-2 gap-2">
      {seriesList.map((series) => (
        <div
          key={series.id}
          onClick={() => onSelectSeries(series)}
          className={`flex-shrink-0 w-24 h-24 bg-gray-900 border rounded cursor-pointer relative group ${
            activeSeriesId === series.id ? 'border-blue-500' : 'border-gray-700 hover:border-gray-500'
          }`}
        >
          {/* Thumbnail placeholder */}
          <div className="absolute inset-0 flex items-center justify-center opacity-30 group-hover:opacity-50">
            <Layers className="w-8 h-8 text-gray-400" />
          </div>
          
          <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-1 text-[10px] text-gray-300 truncate">
            {series.description}
          </div>
          <div className="absolute top-1 right-1 text-[9px] bg-blue-900 text-blue-200 px-1 rounded">
            {series.instanceCount} img
          </div>
        </div>
      ))}
    </div>
  );
};

export default SeriesSelector;