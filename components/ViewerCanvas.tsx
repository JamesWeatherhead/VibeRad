
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Series, ToolMode, ViewportState, Point, Measurement, DicomWebConfig, SegmentationLayer, ViewerHandle } from '../types';
import { DEFAULT_VIEWPORT_STATE } from '../constants';
import { fetchDicomImageBlob } from '../services/dicomService';
import { Loader2, AlertTriangle } from 'lucide-react';

interface ViewerCanvasProps {
  series: Series | null;
  activeTool: ToolMode;
  dicomConfig: DicomWebConfig;
  connectionType: string | null;
  
  // Lifted State Props
  sliceIndex: number;
  onSliceChange: (index: number) => void;
  
  measurements: Measurement[];
  onMeasurementAdd: (m: Measurement) => void;
  onMeasurementUpdate: (m: Measurement) => void;
  activeMeasurementId: string | null;

  segmentationLayer: SegmentationLayer;
}

const ViewerCanvas = forwardRef<ViewerHandle, ViewerCanvasProps>(({ 
  series, 
  activeTool, 
  dicomConfig, 
  connectionType,
  sliceIndex,
  onSliceChange,
  measurements,
  onMeasurementAdd,
  onMeasurementUpdate,
  activeMeasurementId,
  segmentationLayer
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Segmentation Mask Cache (SliceIndex -> Offscreen Canvas)
  const maskCacheRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  
  // Local Viewport State (Pan/Zoom/WWWC only)
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT_STATE);
  const [renderTick, setRenderTick] = useState(0); // Used to force re-render during painting
  
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentImageBitmap, setCurrentImageBitmap] = useState<HTMLImageElement | null>(null);
  
  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [lastDrawPoint, setLastDrawPoint] = useState<Point | null>(null);
  const [draftMeasurement, setDraftMeasurement] = useState<Measurement | null>(null);

  // Expose Screenshot Capability
  useImperativeHandle(ref, () => ({
    captureScreenshot: () => {
      if (canvasRef.current) {
        // Return high-quality JPEG
        return canvasRef.current.toDataURL('image/jpeg', 0.9);
      }
      return null;
    }
  }));

  // 1. Reset Viewport on Series Change
  useEffect(() => {
    if (series) {
      setViewport(DEFAULT_VIEWPORT_STATE);
      // sliceIndex is reset by parent, but we clear error
      setLoadError(null);
      // Clear masks for new series
      maskCacheRef.current.clear();
      setRenderTick(0);
    }
  }, [series?.id]);

  // 2. Fetch Image Data
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    const loadFrame = async () => {
      if (!series || series.instances.length === 0) return;

      setIsImageLoading(true);
      setLoadError(null);

      // Use prop sliceIndex
      if (sliceIndex < 0 || sliceIndex >= series.instances.length) {
         setLoadError(`Index ${sliceIndex} out of bounds`);
         setIsImageLoading(false);
         return;
      }

      const url = series.instances[sliceIndex];
      if (!url) {
         setLoadError("Invalid slice URL");
         setIsImageLoading(false);
         return;
      }
      
      try {
        let blob: Blob;
        if (connectionType === 'DEMO') {
          const resp = await fetch(url);
          blob = await resp.blob();
        } else {
          blob = await fetchDicomImageBlob(dicomConfig, url);
        }
        
        if (!active) return;

        objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.src = objectUrl;
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        if (active) {
          setCurrentImageBitmap(img);
          setIsImageLoading(false);
        }
      } catch (err: any) {
        if (active) {
          console.error("Frame Load Error", err);
          setLoadError("Failed to render frame: " + (err.message || "Unknown error"));
          setIsImageLoading(false);
        }
      }
    };

    loadFrame();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [series, sliceIndex, connectionType, dicomConfig]);

  // 3. Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!currentImageBitmap) return;

    ctx.save();
    
    // Transform
    ctx.translate(canvas.width / 2 + viewport.pan.x, canvas.height / 2 + viewport.pan.y);
    ctx.scale(viewport.scale, viewport.scale);
    
    // Draw Image Centered
    const w = currentImageBitmap.width || 512; 
    const h = currentImageBitmap.height || 512;
    ctx.translate(-w/2, -h/2);
    ctx.drawImage(currentImageBitmap, 0, 0, w, h);

    // --- SEGMENTATION LAYER RENDERING ---
    // If layer is visible, check if we have a mask for this slice and draw it
    if (segmentationLayer.isVisible) {
       renderLabelMap(ctx, w, h, sliceIndex, segmentationLayer);
    }

    // --- MEASUREMENT LAYER RENDERING ---
    const sliceMeasurements = measurements.filter(m => m.sliceIndex === sliceIndex);
    
    const drawLine = (m: Measurement, isSelected: boolean) => {
      ctx.beginPath();
      // Green for selected, Yellow/Orange for normal
      ctx.strokeStyle = isSelected ? '#4ade80' : '#fbbf24'; 
      ctx.lineWidth = 2 / viewport.scale;
      ctx.moveTo(m.start.x, m.start.y);
      ctx.lineTo(m.end.x, m.end.y);
      ctx.stroke();

      // Endpoints
      const r = 4 / viewport.scale;
      ctx.fillStyle = isSelected ? '#4ade80' : '#fbbf24';
      ctx.beginPath(); ctx.arc(m.start.x, m.start.y, r, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(m.end.x, m.end.y, r, 0, 6.28); ctx.fill();

      // Text Label
      if (m.value > 0) {
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.font = `bold ${14 / viewport.scale}px monospace`;
        const mx = (m.start.x + m.end.x)/2;
        const my = (m.start.y + m.end.y)/2;
        
        // Approx 0.5mm pixel spacing for demo
        const val = (m.value * 0.5).toFixed(1);
        const label = m.label ? `${m.label}: ` : '';
        ctx.fillText(`${label}${val} mm`, mx + 10, my);
        ctx.shadowBlur = 0;
      }
    };

    sliceMeasurements.forEach(m => drawLine(m, m.id === activeMeasurementId));
    if (draftMeasurement) drawLine(draftMeasurement, true);

    ctx.restore();

  }, [viewport, currentImageBitmap, measurements, activeMeasurementId, draftMeasurement, sliceIndex, segmentationLayer, renderTick]);

  // Real LabelMap Rendering (From Cache)
  const renderLabelMap = (
      ctx: CanvasRenderingContext2D, 
      width: number, 
      height: number, 
      sliceIdx: number, 
      layer: SegmentationLayer
  ) => {
      const maskCanvas = maskCacheRef.current.get(sliceIdx);
      if (maskCanvas) {
         ctx.save();
         ctx.globalAlpha = layer.opacity;
         ctx.drawImage(maskCanvas, 0, 0, width, height);
         ctx.restore();
      }
  };

  // Helper to get or create the mask canvas for the current slice
  const getActiveMaskCanvas = (width: number, height: number): HTMLCanvasElement => {
     if (!maskCacheRef.current.has(sliceIndex)) {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        maskCacheRef.current.set(sliceIndex, c);
     }
     return maskCacheRef.current.get(sliceIndex)!;
  };

  // --- Interaction Handlers ---
  const getCanvasPoint = (e: React.MouseEvent): Point => {
     const canvas = canvasRef.current;
     if (!canvas) return { x: 0, y: 0 };
     const rect = canvas.getBoundingClientRect();
     const x = e.clientX - rect.left;
     const y = e.clientY - rect.top;
     
     // Inverse Transform
     const centeredX = x - canvas.width/2 - viewport.pan.x;
     const centeredY = y - canvas.height/2 - viewport.pan.y;
     return { 
       x: (centeredX / viewport.scale) + (currentImageBitmap?.width || 512)/2, 
       y: (centeredY / viewport.scale) + (currentImageBitmap?.height || 512)/2 
     };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    
    const p = getCanvasPoint(e);

    if (activeTool === ToolMode.MEASURE) {
      setDraftMeasurement({
        id: 'draft',
        start: p, end: p, value: 0,
        sliceIndex: sliceIndex,
        createdAt: Date.now()
      });
    }
    
    // Support BRUSH or ERASER
    const isPaintTool = activeTool === ToolMode.BRUSH || activeTool === ToolMode.ERASER;
    if (isPaintTool && segmentationLayer.isVisible && currentImageBitmap) {
       // Only block BRUSH if no segment selected, ERASER works always
       if (activeTool === ToolMode.BRUSH && !segmentationLayer.activeSegmentId) return;

       setLastDrawPoint(p);
       // Initial dot
       paintOnMask(p, p);
    }
  };

  const paintOnMask = (p1: Point, p2: Point) => {
     if (!currentImageBitmap) return;
     const w = currentImageBitmap.width || 512;
     const h = currentImageBitmap.height || 512;
     
     const maskCanvas = getActiveMaskCanvas(w, h);
     const ctx = maskCanvas.getContext('2d');
     if (!ctx) return;

     ctx.save();
     
     // Set styles based on tool
     if (activeTool === ToolMode.ERASER) {
         ctx.globalCompositeOperation = 'destination-out';
         // Color doesn't matter for destination-out, only alpha (must be opaque to erase fully)
         ctx.strokeStyle = 'rgba(0,0,0,1)';
         ctx.fillStyle = 'rgba(0,0,0,1)';
     } else {
         ctx.globalCompositeOperation = 'source-over';
         // Find color
         const seg = segmentationLayer.segments.find(s => s.id === segmentationLayer.activeSegmentId);
         const color = seg ? `rgb(${seg.color.join(',')})` : 'red';
         ctx.strokeStyle = color;
         ctx.fillStyle = color;
     }

     ctx.lineCap = 'round';
     ctx.lineJoin = 'round';
     // Use dynamic brush size
     ctx.lineWidth = segmentationLayer.brushSize; 
     
     ctx.beginPath();
     ctx.moveTo(p1.x, p1.y);
     ctx.lineTo(p2.x, p2.y);
     ctx.stroke();
     
     ctx.restore();
     
     // Trigger re-render of the main canvas to show changes
     setRenderTick(t => t + 1);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    // BRUSH/ERASER logic handles its own coordinates and rendering triggers
    if ((activeTool === ToolMode.BRUSH || activeTool === ToolMode.ERASER) && lastDrawPoint) {
       const p = getCanvasPoint(e);
       paintOnMask(lastDrawPoint, p);
       setLastDrawPoint(p);
       return;
    }

    if (!dragStart || !series) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    if (activeTool === ToolMode.PAN) {
      setViewport(p => ({ ...p, pan: { x: p.pan.x + dx, y: p.pan.y + dy }}));
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (activeTool === ToolMode.ZOOM) {
      setViewport(p => ({ ...p, scale: Math.max(0.1, p.scale + (dy * -0.01)) }));
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (activeTool === ToolMode.WINDOW_LEVEL) {
      setViewport(p => ({ 
        ...p, 
        windowWidth: p.windowWidth + dx * 2, 
        windowCenter: p.windowCenter - dy * 2 
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (activeTool === ToolMode.SCROLL) {
       // Drag Scroll
      if (Math.abs(dy) > 10) {
        const dir = dy > 0 ? 1 : -1;
        const max = series.instances.length || series.instanceCount;
        const next = Math.max(0, Math.min(max - 1, sliceIndex + dir));
        if (next !== sliceIndex) {
            onSliceChange(next);
            setDragStart({ x: e.clientX, y: e.clientY });
        }
      }
    } else if (activeTool === ToolMode.MEASURE && draftMeasurement) {
      const p = getCanvasPoint(e);
      const dist = Math.sqrt(Math.pow(p.x - draftMeasurement.start.x, 2) + Math.pow(p.y - draftMeasurement.start.y, 2));
      setDraftMeasurement({ ...draftMeasurement, end: p, value: dist });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
    setLastDrawPoint(null);

    if (activeTool === ToolMode.MEASURE && draftMeasurement) {
      // Commit measurement if significant
      if (draftMeasurement.value > 5) {
         onMeasurementAdd({
             ...draftMeasurement,
             id: Date.now().toString(),
             label: `M${measurements.length + 1}`
         });
      }
      setDraftMeasurement(null);
    }
  };
  
  const handleWheel = (e: React.WheelEvent) => {
     // Allow wheel scroll unless we decide to map it to zoom later
     if (activeTool === ToolMode.SCROLL || activeTool !== ToolMode.ZOOM) {
        const dir = e.deltaY > 0 ? 1 : -1;
        const max = series?.instances.length || series?.instanceCount || 0;
        const next = Math.max(0, Math.min(max - 1, sliceIndex + dir));
        onSliceChange(next);
     }
  };

  const getFilterStyle = () => {
    const c = (DEFAULT_VIEWPORT_STATE.windowWidth / viewport.windowWidth) * 100;
    const b = 100 + ((DEFAULT_VIEWPORT_STATE.windowCenter - viewport.windowCenter) / 5);
    return `contrast(${Math.max(0, c)}%) brightness(${Math.max(0, b)}%)`;
  };

  if (!series) {
    return <div className="flex-1 bg-black flex items-center justify-center text-gray-500">Select a series</div>;
  }

  // Calculate visual scrollbar height
  const scrollPct = series.instanceCount > 0 ? (sliceIndex / series.instanceCount) * 100 : 0;
  
  const isPaintOrErase = activeTool === ToolMode.BRUSH || activeTool === ToolMode.ERASER;
  const cursorStyle = activeTool === ToolMode.PAN ? 'move' : isPaintOrErase ? 'crosshair' : 'default';

  return (
    <div className="flex-1 bg-black relative overflow-hidden select-none" ref={containerRef} onWheel={handleWheel}>
      <canvas
        ref={canvasRef}
        width={containerRef.current?.clientWidth || 800}
        height={containerRef.current?.clientHeight || 600}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ 
          cursor: cursorStyle,
          filter: getFilterStyle()
        }}
        className="block w-full h-full"
      />
      
      {/* Scrollbar Indicator */}
      <div className="absolute right-2 top-4 bottom-4 w-1.5 bg-gray-800 rounded-full overflow-hidden opacity-50 hover:opacity-100 transition-opacity pointer-events-none">
         <div 
           className="bg-blue-500 w-full rounded-full"
           style={{ height: '5%', top: `${scrollPct}%`, position: 'absolute' }}
         />
      </div>

      {isImageLoading && (
        <div className="absolute top-4 right-8 text-blue-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-50">
           <div className="bg-red-900/80 p-4 rounded text-red-200 flex flex-col items-center max-w-md text-center">
             <AlertTriangle className="w-8 h-8 mb-2" />
             <p className="font-bold mb-1">Load Failed</p>
             <p className="text-sm opacity-90">{loadError}</p>
           </div>
        </div>
      )}

      {/* Info Overlays */}
      <div className="absolute top-4 left-4 text-xs font-mono text-lime-400 pointer-events-none drop-shadow-md">
        <div className="text-sm font-bold text-white mb-1">ID: {series.id.slice(-6)}</div>
        <div>Modality: {series.modality}</div>
        <div>Scale: {viewport.scale.toFixed(2)}x</div>
        {segmentationLayer.isVisible && <div className="text-emerald-400 mt-1">SEG: On ({(segmentationLayer.opacity*100).toFixed(0)}%)</div>}
      </div>
      <div className="absolute bottom-4 right-8 text-xs font-mono text-blue-400 pointer-events-none drop-shadow-md">
        Image: {sliceIndex + 1} / {series.instanceCount}
      </div>
    </div>
  );
});

export default ViewerCanvas;
