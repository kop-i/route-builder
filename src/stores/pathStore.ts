/**
 * 경로 데이터 상태 관리 스토어
 * - OSM 노드/웨이 데이터를 관리
 * - 자동 생성, 수동 편집, XML 내보내기의 핵심 데이터
 */
import { create } from 'zustand';
import type { OsmNode, OsmWay, OsmRelation, ServiceArea, LatLng } from '@/types/osm';

interface PathState {
  // === 경로 데이터 ===
  nodes: OsmNode[];
  ways: OsmWay[];
  relations: OsmRelation[];

  // === 서비스 면적 ===
  serviceArea: ServiceArea | null;
  isDrawingArea: boolean;       // polygon 그리기 모드 여부

  // === 로딩 상태 ===
  isGenerating: boolean;        // 자동 경로 생성 중
  generationProgress: string;   // 생성 진행 메시지

  // === ID 카운터 (로컬 생성 시 음수 ID 부여) ===
  nextNodeId: number;
  nextWayId: number;

  // === 액션: 서비스 면적 ===
  setServiceArea: (area: ServiceArea) => void;
  clearServiceArea: () => void;
  setIsDrawingArea: (drawing: boolean) => void;

  // === 액션: 경로 데이터 벌크 설정 ===
  setPathData: (data: { nodes: OsmNode[]; ways: OsmWay[]; relations?: OsmRelation[] }) => void;
  clearPathData: () => void;

  // === 액션: 노드 편집 ===
  addNode: (lat: number, lon: number, tags?: { k: string; v: string }[]) => number;
  updateNodePosition: (id: number, lat: number, lon: number) => void;
  removeNode: (id: number) => void;

  // === 액션: 웨이 편집 ===
  addWay: (nodeRefs: number[], tags?: { k: string; v: string }[]) => number;
  removeWay: (id: number) => void;

  // === 액션: 생성 상태 ===
  setIsGenerating: (generating: boolean) => void;
  setGenerationProgress: (msg: string) => void;
}

export const usePathStore = create<PathState>((set, get) => ({
  // 초기 상태
  nodes: [],
  ways: [],
  relations: [],
  serviceArea: null,
  isDrawingArea: false,
  isGenerating: false,
  generationProgress: '',
  nextNodeId: -1,
  nextWayId: -1,

  // === 서비스 면적 ===
  setServiceArea: (area) => set({ serviceArea: area, isDrawingArea: false }),
  clearServiceArea: () => set({ serviceArea: null }),
  setIsDrawingArea: (drawing) => set({ isDrawingArea: drawing }),

  // === 경로 데이터 벌크 설정 ===
  setPathData: ({ nodes, ways, relations }) => set({
    nodes,
    ways,
    relations: relations ?? [],
    // 다음 ID는 기존 데이터의 최소 ID보다 1 작게 설정
    nextNodeId: nodes.length > 0
      ? Math.min(...nodes.map(n => n.id)) - 1
      : -1,
    nextWayId: ways.length > 0
      ? Math.min(...ways.map(w => w.id)) - 1
      : -1,
  }),

  clearPathData: () => set({
    nodes: [],
    ways: [],
    relations: [],
    nextNodeId: -1,
    nextWayId: -1,
  }),

  // === 노드 편집 ===
  addNode: (lat, lon, tags = []) => {
    const state = get();
    const newId = state.nextNodeId;
    const newNode: OsmNode = {
      id: newId,
      lat,
      lon,
      tags: [
        { k: 'plat_node_id', v: String(Math.abs(newId)) },
        ...tags,
      ],
    };
    set({
      nodes: [...state.nodes, newNode],
      nextNodeId: newId - 1,
    });
    return newId;
  },

  updateNodePosition: (id, lat, lon) => set((state) => ({
    nodes: state.nodes.map(n =>
      n.id === id ? { ...n, lat, lon } : n
    ),
  })),

  removeNode: (id) => set((state) => ({
    // 노드 삭제 시 해당 노드를 참조하는 웨이에서도 제거
    nodes: state.nodes.filter(n => n.id !== id),
    ways: state.ways
      .map(w => ({
        ...w,
        nodeRefs: w.nodeRefs.filter(ref => ref !== id),
      }))
      // 노드가 2개 미만인 웨이는 삭제 (유효하지 않음)
      .filter(w => w.nodeRefs.length >= 2),
  })),

  // === 웨이 편집 ===
  addWay: (nodeRefs, tags = []) => {
    const state = get();
    const newId = state.nextWayId;
    const newWay: OsmWay = {
      id: newId,
      nodeRefs,
      tags: [
        { k: 'plat_way_id', v: String(Math.abs(newId)) },
        ...tags,
      ],
    };
    set({
      ways: [...state.ways, newWay],
      nextWayId: newId - 1,
    });
    return newId;
  },

  removeWay: (id) => set((state) => ({
    ways: state.ways.filter(w => w.id !== id),
  })),

  // === 생성 상태 ===
  setIsGenerating: (generating) => set({ isGenerating: generating }),
  setGenerationProgress: (msg) => set({ generationProgress: msg }),
}));
