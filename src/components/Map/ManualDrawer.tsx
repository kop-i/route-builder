/**
 * ManualDrawer - 수동 경로 그리기
 *
 * [기능]
 * - draw_sidewalk / draw_crosswalk / draw_sideroad 모드에서 활성화
 * - 지도 클릭 → 노드 생성 → 실시간 미리보기 라인 표시
 * - 더블클릭 또는 Enter → 웨이 완성 및 저장
 * - ESC → 그리기 취소
 *
 * [워크플로우]
 * 1. Toolbar에서 "인도 그리기" 선택
 * 2. 지도 위를 클릭하면 노드가 찍힘 (파란 점)
 * 3. 클릭할 때마다 이전 노드와 연결하는 라인이 미리보기로 표시
 * 4. 더블클릭하면 웨이가 완성되어 pathStore에 저장
 * 5. 다시 클릭하면 새 웨이 시작
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMapStore } from '@/stores/mapStore';
import { usePathStore } from '@/stores/pathStore';
import { useEditorStore } from '@/stores/editorStore';

// 모드별 도로 유형 매핑
const modeToRoadType: Record<string, string> = {
  draw_sidewalk: 'sidewalk',
  draw_crosswalk: 'crosswalk',
  draw_sideroad: 'sideroad',
};

// 모드별 선 색상
const modeToColor: Record<string, string> = {
  draw_sidewalk: '#3B82F6',
  draw_crosswalk: '#EF4444',
  draw_sideroad: '#F59E0B',
};

export default function ManualDrawer() {
  const leafletMap = useMapStore((s) => s.leafletMap);
  const engine = useMapStore((s) => s.engine);
  const { mode, drawingNodeIds, addDrawingNode, finishDrawing, cancelDrawing } = useEditorStore();
  const { addNode, addWay, nodes } = usePathStore();

  // 미리보기 라인 + 노드 마커
  const previewLineRef = useRef<L.Polyline | null>(null);
  const previewMarkersRef = useRef<L.CircleMarker[]>([]);

  const isDrawing = mode === 'draw_sidewalk' || mode === 'draw_crosswalk' || mode === 'draw_sideroad';

  // === 클릭 → 노드 생성 ===
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap || !isDrawing) return;

    // 지도 드래그 비활성화하지 않음 (클릭과 드래그 구분)
    const onClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;

      // 노드 생성
      const nodeId = addNode(lat, lng);
      addDrawingNode(nodeId);

      // 미리보기 마커 추가
      const marker = L.circleMarker([lat, lng], {
        radius: 5,
        color: modeToColor[mode] || '#3B82F6',
        fillColor: modeToColor[mode] || '#3B82F6',
        fillOpacity: 1,
        weight: 2,
      }).addTo(leafletMap);
      previewMarkersRef.current.push(marker);
    };

    // 더블클릭 → 웨이 완성
    const onDblClick = () => {
      completeWay();
    };

    leafletMap.on('click', onClick);
    leafletMap.on('dblclick', onDblClick);

    // ESC → 취소
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearPreview();
        // 그리기 중인 노드 삭제 (pathStore에서)
        for (const id of drawingNodeIds) {
          usePathStore.getState().removeNode(id);
        }
        cancelDrawing();
      }
      if (e.key === 'Enter') {
        completeWay();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      leafletMap.off('click', onClick);
      leafletMap.off('dblclick', onDblClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [leafletMap, engine, isDrawing, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // === 미리보기 라인 업데이트 ===
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap) return;

    // 기존 미리보기 라인 제거
    if (previewLineRef.current) {
      leafletMap.removeLayer(previewLineRef.current);
      previewLineRef.current = null;
    }

    if (!isDrawing || drawingNodeIds.length < 2) return;

    // 노드 좌표 조회
    const currentNodes = usePathStore.getState().nodes;
    const latLngs: L.LatLngTuple[] = drawingNodeIds
      .map(id => currentNodes.find(n => n.id === id))
      .filter((n): n is NonNullable<typeof n> => n !== undefined)
      .map(n => [n.lat, n.lon] as L.LatLngTuple);

    if (latLngs.length < 2) return;

    // 미리보기 라인 그리기
    previewLineRef.current = L.polyline(latLngs, {
      color: modeToColor[mode] || '#3B82F6',
      weight: 3,
      opacity: 0.7,
      dashArray: '8 4',
    }).addTo(leafletMap);
  }, [drawingNodeIds, leafletMap, engine, isDrawing, mode]);

  // === 모드 변경 시 미리보기 정리 ===
  useEffect(() => {
    if (!isDrawing) {
      clearPreview();
    }
  }, [isDrawing]); // eslint-disable-line react-hooks/exhaustive-deps

  function completeWay() {
    const nodeIds = finishDrawing();

    if (nodeIds.length >= 2) {
      const roadType = modeToRoadType[mode] || 'sidewalk';
      addWay(nodeIds, [{ k: 'road_type', v: roadType }]);
      console.log(`✅ ${roadType} 웨이 완성: 노드 ${nodeIds.length}개`);
    }

    clearPreview();
  }

  function clearPreview() {
    if (leafletMap) {
      if (previewLineRef.current) {
        leafletMap.removeLayer(previewLineRef.current);
        previewLineRef.current = null;
      }
      for (const m of previewMarkersRef.current) {
        leafletMap.removeLayer(m);
      }
    }
    previewMarkersRef.current = [];
  }

  return null;
}
