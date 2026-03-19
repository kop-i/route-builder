/**
 * 편집기 상태 관리 스토어
 */
import { create } from 'zustand';

/** 편집 모드 종류 */
export type EditorMode =
  | 'view'           // 보기 전용 (기본)
  | 'draw_area'      // 서비스 면적 그리기
  | 'draw_sidewalk'  // 인도 수동 그리기 (클릭→노드→웨이)
  | 'draw_crosswalk' // 건널목 수동 그리기
  | 'draw_sideroad'  // 이면도로 수동 그리기
  | 'select'         // 요소 선택/삭제
  | 'move_node';     // 노드 드래그 이동

/** 선택된 요소 정보 */
interface SelectedElement {
  type: 'node' | 'way';
  id: number;
}

interface EditorState {
  mode: EditorMode;
  selectedElement: SelectedElement | null;
  isStreetViewOpen: boolean;
  showWarnings: boolean;

  /** 현재 그리기 중인 웨이의 노드 ID 목록 (draw_* 모드에서 사용) */
  drawingNodeIds: number[];

  layerVisibility: {
    sidewalk: boolean;
    crosswalk: boolean;
    sideroad: boolean;
    nodes: boolean;
  };

  setMode: (mode: EditorMode) => void;
  setSelectedElement: (el: SelectedElement | null) => void;
  toggleStreetView: () => void;
  toggleWarnings: () => void;
  toggleLayer: (layer: keyof EditorState['layerVisibility']) => void;

  /** 그리기 모드: 노드 추가 */
  addDrawingNode: (nodeId: number) => void;
  /** 그리기 모드: 현재 웨이 완성 (더블클릭 또는 Enter) */
  finishDrawing: () => number[];
  /** 그리기 모드: 취소 */
  cancelDrawing: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  mode: 'view',
  selectedElement: null,
  isStreetViewOpen: false,
  showWarnings: false,
  drawingNodeIds: [],
  layerVisibility: {
    sidewalk: true,
    crosswalk: true,
    sideroad: true,
    nodes: true,
  },

  setMode: (mode) => set({ mode, selectedElement: null, drawingNodeIds: [] }),
  setSelectedElement: (el) => set({ selectedElement: el }),
  toggleStreetView: () => set((s) => ({ isStreetViewOpen: !s.isStreetViewOpen })),
  toggleWarnings: () => set((s) => ({ showWarnings: !s.showWarnings })),
  toggleLayer: (layer) => set((s) => ({
    layerVisibility: { ...s.layerVisibility, [layer]: !s.layerVisibility[layer] },
  })),

  addDrawingNode: (nodeId) => set((s) => ({
    drawingNodeIds: [...s.drawingNodeIds, nodeId],
  })),

  finishDrawing: () => {
    const ids = get().drawingNodeIds;
    set({ drawingNodeIds: [] });
    return ids;
  },

  cancelDrawing: () => set({ drawingNodeIds: [] }),
}));
