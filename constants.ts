import { ToolMode, Segment } from "./types";
import { 
  MousePointer2, 
  Sun, 
  Move, 
  Search, 
  Ruler, 
  Layers,
  Brush
} from "lucide-react";

export const TOOLS = [
  { id: ToolMode.POINTER, label: 'Select', icon: MousePointer2 },
  { id: ToolMode.SCROLL, label: 'Scroll', icon: Layers },
  { id: ToolMode.WINDOW_LEVEL, label: 'Contrast', icon: Sun },
  { id: ToolMode.PAN, label: 'Pan', icon: Move },
  { id: ToolMode.ZOOM, label: 'Zoom', icon: Search },
  { id: ToolMode.MEASURE, label: 'Measure', icon: Ruler },
  { id: ToolMode.BRUSH, label: 'Paint', icon: Brush },
];

export const DEFAULT_VIEWPORT_STATE = {
  scale: 1,
  pan: { x: 0, y: 0 },
  windowWidth: 400, // CT Soft Tissue default approximation
  windowCenter: 40,
  // sliceIndex removed from constant as it is dynamic
};

// Simulated DICOM Modality presets
export const WL_PRESETS = [
  { label: 'Default', ww: 400, wc: 40 },
  { label: 'Lung', ww: 1500, wc: -600 },
  { label: 'Bone', ww: 2000, wc: 300 },
  { label: 'Brain', ww: 80, wc: 40 },
];

// Mock Segmentation Data (FreeSurfer Style LUT)
export const MOCK_SEGMENTATION_DATA: Segment[] = [
  { id: 1, label: 'Cerebral White Matter', color: [245, 245, 245], isVisible: true },
  { id: 2, label: 'Cerebral Grey Matter', color: [205, 62, 78], isVisible: true },
  { id: 3, label: 'Lateral Ventricle', color: [120, 18, 134], isVisible: true },
  { id: 4, label: 'Inferior Horn Ventricle', color: [196, 58, 250], isVisible: true },
  { id: 5, label: 'Cerebellar White Matter', color: [220, 248, 164], isVisible: true },
  { id: 6, label: 'Cerebellar Cortex', color: [230, 148, 34], isVisible: true },
  { id: 7, label: 'Thalamus', color: [0, 118, 14], isVisible: true },
  { id: 8, label: 'Caudate Nucleus', color: [122, 186, 220], isVisible: true },
  { id: 9, label: 'Putamen', color: [236, 13, 176], isVisible: true },
  { id: 10, label: 'Pallidum', color: [12, 48, 255], isVisible: true },
  { id: 11, label: 'Hippocampus', color: [220, 216, 20], isVisible: true },
  { id: 12, label: 'Amygdala', color: [103, 255, 255], isVisible: true },
  { id: 13, label: 'Brain Stem', color: [119, 159, 176], isVisible: true },
];