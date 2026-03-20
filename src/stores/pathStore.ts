/**
 * 경로 데이터 상태 관리 스토어
 * - OSM 노드/웨이 데이터를 관리
 * - Undo/Redo 히스토리 지원 (Ctrl+Z / Ctrl+Shift+Z)
 */
import { create } from 'zustand';
import type { OsmNode, OsmWay, OsmRelation, ServiceArea } from '@/types/osm';

/** Undo/Redo를 위한 스냅샷 */
interface PathSnapshot {
  nodes: OsmNode[];
  ways: OsmWay[];
}

const MAX_HISTORY = 50; // 최대 Undo 횟수

interface PathState {
  nodes: OsmNode[];
  ways: OsmWay[];
  relations: OsmRelation[];
  serviceArea: ServiceArea | null;
  isDrawingArea: boolean;
  isGenerating: boolean;
  generationProgress: string;
  nextNodeId: number;
  nextWayId: number;

  // Undo/Redo 히스토리
  history: PathSnapshot[];
  historyIndex: number;

  // 액션
  setServiceArea: (area: ServiceArea) => void;
  clearServiceArea: () => void;
  setIsDrawingArea: (drawing: boolean) => void;
  setPathData: (data: { nodes: OsmNode[]; ways: OsmWay[]; relations?: OsmRelation[] }) => void;
  clearPathData: () => void;
  addNode: (lat: number, lon: number, tags?: { k: string; v: string }[]) => number;
  updateNodePosition: (id: number, lat: number, lon: number) => void;
  removeNode: (id: number) => void;
  addWay: (nodeRefs: number[], tags?: { k: string; v: string }[]) => number;
  removeWay: (id: number) => void;
  setIsGenerating: (generating: boolean) => void;
  setGenerationProgress: (msg: string) => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

/** 현재 상태를 스냅샷으로 저장 */
function saveSnapshot(state: PathState): PathSnapshot {
  return {
    nodes: [...state.nodes],
    ways: [...state.ways],
  };
}

/** 히스토리에 스냅샷 추가 */
function pushHistory(state: PathState): Partial<PathState> {
  const snapshot = saveSnapshot(state);
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  newHistory.push(snapshot);
  if (newHistory.length > MAX_HISTORY) newHistory.shift();
  return {
    history: newHistory,
    historyIndex: newHistory.length - 1,
  };
}

export const usePathStore = create<PathState>((set, get) => ({
  nodes: [],
  ways: [],
  relations: [],
  serviceArea: null,
  isDrawingArea: false,
  isGenerating: false,
  generationProgress: '',
  nextNodeId: -1,
  nextWayId: -1,
  history: [],
  historyIndex: -1,

  setServiceArea: (area) => set({ serviceArea: area, isDrawingArea: false }),
  clearServiceArea: () => set({ serviceArea: null }),
  setIsDrawingArea: (drawing) => set({ isDrawingArea: drawing }),

  setPathData: ({ nodes, ways, relations }) => {
    const state = get();
    const historyUpdate = pushHistory(state);
    set({
      nodes, ways,
      relations: relations ?? [],
      nextNodeId: nodes.length > 0 ? Math.min(...nodes.map(n => n.id)) - 1 : -1,
      nextWayId: ways.length > 0 ? Math.min(...ways.map(w => w.id)) - 1 : -1,
      ...historyUpdate,
    });
  },

  clearPathData: () => set({
    nodes: [], ways: [], relations: [],
    nextNodeId: -1, nextWayId: -1,
    history: [], historyIndex: -1,
  }),

  addNode: (lat, lon, tags = []) => {
    const state = get();
    const historyUpdate = pushHistory(state);
    const newId = state.nextNodeId;
    set({
      nodes: [...state.nodes, {
        id: newId, lat, lon,
        tags: [{ k: 'plat_node_id', v: String(Math.abs(newId)) }, ...tags],
      }],
      nextNodeId: newId - 1,
      ...historyUpdate,
    });
    return newId;
  },

  updateNodePosition: (id, lat, lon) => {
    const state = get();
    const historyUpdate = pushHistory(state);
    set({
      nodes: state.nodes.map(n => n.id === id ? { ...n, lat, lon } : n),
      ...historyUpdate,
    });
  },

  removeNode: (id) => {
    const state = get();
    const historyUpdate = pushHistory(state);
    set({
      nodes: state.nodes.filter(n => n.id !== id),
      ways: state.ways
        .map(w => ({ ...w, nodeRefs: w.nodeRefs.filter(ref => ref !== id) }))
        .filter(w => w.nodeRefs.length >= 2),
      ...historyUpdate,
    });
  },

  addWay: (nodeRefs, tags = []) => {
    const state = get();
    const historyUpdate = pushHistory(state);
    const newId = state.nextWayId;
    set({
      ways: [...state.ways, {
        id: newId, nodeRefs,
        tags: [{ k: 'plat_way_id', v: String(Math.abs(newId)) }, ...tags],
      }],
      nextWayId: newId - 1,
      ...historyUpdate,
    });
    return newId;
  },

  removeWay: (id) => {
    const state = get();
    const historyUpdate = pushHistory(state);
    set({
      ways: state.ways.filter(w => w.id !== id),
      ...historyUpdate,
    });
  },

  setIsGenerating: (generating) => set({ isGenerating: generating }),
  setGenerationProgress: (msg) => set({ generationProgress: msg }),

  // === Undo ===
  undo: () => {
    const state = get();
    if (state.historyIndex < 0) return;

    // 현재 상태가 히스토리 끝이면, 현재 상태를 먼저 저장
    if (state.historyIndex === state.history.length - 1) {
      const currentSnapshot = saveSnapshot(state);
      const newHistory = [...state.history, currentSnapshot];
      set({
        nodes: state.history[state.historyIndex].nodes,
        ways: state.history[state.historyIndex].ways,
        history: newHistory,
        historyIndex: state.historyIndex - 1,
      });
    } else {
      const snapshot = state.history[state.historyIndex];
      set({
        nodes: snapshot.nodes,
        ways: snapshot.ways,
        historyIndex: state.historyIndex - 1,
      });
    }
  },

  // === Redo ===
  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 2) return;

    const snapshot = state.history[state.historyIndex + 2];
    set({
      nodes: snapshot.nodes,
      ways: snapshot.ways,
      historyIndex: state.historyIndex + 1,
    });
  },

  canUndo: () => get().historyIndex >= 0,
  canRedo: () => get().historyIndex < get().history.length - 2,
}));
