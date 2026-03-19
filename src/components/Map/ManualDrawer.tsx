/**
 * ManualDrawer - 수동 경로 그리기 (네이버 + Leaflet 양쪽 지원)
 *
 * [기능]
 * - draw_sidewalk / draw_crosswalk / draw_sideroad 모드에서 활성화
 * - 지도 클릭 → 노드 생성 → 실시간 미리보기 라인 표시
 * - 더블클릭 또는 Enter → 웨이 완성 및 저장
 * - ESC → 그리기 취소
 */
import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import { useMapStore } from '@/stores/mapStore';
import { usePathStore } from '@/stores/pathStore';
import { useEditorStore } from '@/stores/editorStore';

const modeToRoadType: Record<string, string> = {
  draw_sidewalk: 'sidewalk',
  draw_crosswalk: 'crosswalk',
  draw_sideroad: 'sideroad',
};

const modeToColor: Record<string, string> = {
  draw_sidewalk: '#3B82F6',
  draw_crosswalk: '#EF4444',
  draw_sideroad: '#F59E0B',
};

export default function ManualDrawer() {
  const naverMap = useMapStore((s) => s.naverMap);
  const leafletMap = useMapStore((s) => s.leafletMap);
  const engine = useMapStore((s) => s.engine);
  const { mode, drawingNodeIds, addDrawingNode, finishDrawing, cancelDrawing } = useEditorStore();
  const { addNode, addWay, removeNode } = usePathStore();

  // 네이버 오버레이 refs
  const naverPolylinesRef = useRef<naver.maps.Polyline[]>([]);
  const naverMarkersRef = useRef<naver.maps.Marker[]>([]);

  // Leaflet 오버레이 refs
  const leafletLineRef = useRef<L.Polyline | null>(null);
  const leafletMarkersRef = useRef<L.CircleMarker[]>([]);

  const isDrawing = mode === 'draw_sidewalk' || mode === 'draw_crosswalk' || mode === 'draw_sideroad';

  // === 웨이 완성 ===
  const completeWay = useCallback(() => {
    const nodeIds = finishDrawing();
    if (nodeIds.length >= 2) {
      const roadType = modeToRoadType[mode] || 'sidewalk';
      addWay(nodeIds, [{ k: 'road_type', v: roadType }]);
      console.log(`✅ ${roadType} 웨이 완성: 노드 ${nodeIds.length}개`);
    }
    clearAllOverlays();
  }, [mode, finishDrawing, addWay]); // eslint-disable-line react-hooks/exhaustive-deps

  // === 모든 미리보기 오버레이 제거 ===
  const clearAllOverlays = useCallback(() => {
    // 네이버
    naverPolylinesRef.current.forEach(p => p.setMap(null));
    naverPolylinesRef.current = [];
    naverMarkersRef.current.forEach(m => m.setMap(null));
    naverMarkersRef.current = [];
    // Leaflet
    if (leafletLineRef.current && leafletMap) {
      leafletMap.removeLayer(leafletLineRef.current);
      leafletLineRef.current = null;
    }
    leafletMarkersRef.current.forEach(m => leafletMap?.removeLayer(m));
    leafletMarkersRef.current = [];
  }, [leafletMap]);

  // === 네이버 지도 클릭 핸들러 ===
  useEffect(() => {
    if (engine !== 'naver' || !naverMap || !isDrawing) return;

    const clickListener = naver.maps.Event.addListener(naverMap, 'click', (e: { coord: naver.maps.LatLng }) => {
      const lat = e.coord.lat();
      const lng = e.coord.lng();
      const nodeId = addNode(lat, lng);
      addDrawingNode(nodeId);

      // 마커 추가
      const marker = new naver.maps.Marker({
        position: e.coord,
        map: naverMap,
        icon: {
          content: `<div style="width:10px;height:10px;border-radius:50%;background:${modeToColor[mode]||'#3B82F6'};border:2px solid white;"></div>`,
          anchor: new naver.maps.Point(5, 5),
        },
      });
      naverMarkersRef.current.push(marker);
    });

    const dblClickListener = naver.maps.Event.addListener(naverMap, 'dblclick', () => {
      completeWay();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        for (const id of useEditorStore.getState().drawingNodeIds) {
          removeNode(id);
        }
        cancelDrawing();
        clearAllOverlays();
      }
      if (e.key === 'Enter') completeWay();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      naver.maps.Event.removeListener(clickListener);
      naver.maps.Event.removeListener(dblClickListener);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [naverMap, engine, isDrawing, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // === Leaflet 지도 클릭 핸들러 ===
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap || !isDrawing) return;

    const onClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const nodeId = addNode(lat, lng);
      addDrawingNode(nodeId);

      const marker = L.circleMarker([lat, lng], {
        radius: 5,
        color: modeToColor[mode] || '#3B82F6',
        fillColor: modeToColor[mode] || '#3B82F6',
        fillOpacity: 1,
        weight: 2,
      }).addTo(leafletMap);
      leafletMarkersRef.current.push(marker);
    };

    const onDblClick = () => completeWay();

    leafletMap.on('click', onClick);
    leafletMap.on('dblclick', onDblClick);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        for (const id of useEditorStore.getState().drawingNodeIds) {
          removeNode(id);
        }
        cancelDrawing();
        clearAllOverlays();
      }
      if (e.key === 'Enter') completeWay();
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
    if (!isDrawing || drawingNodeIds.length < 2) return;

    const currentNodes = usePathStore.getState().nodes;
    const coords = drawingNodeIds
      .map(id => currentNodes.find(n => n.id === id))
      .filter((n): n is NonNullable<typeof n> => n !== undefined);

    if (coords.length < 2) return;
    const color = modeToColor[mode] || '#3B82F6';

    if (engine === 'naver' && naverMap) {
      // 기존 라인 제거
      naverPolylinesRef.current.forEach(p => p.setMap(null));
      naverPolylinesRef.current = [];

      const path = coords.map(c => new naver.maps.LatLng(c.lat, c.lon));
      const polyline = new naver.maps.Polyline({
        map: naverMap,
        path,
        strokeColor: color,
        strokeWeight: 3,
        strokeOpacity: 0.7,
        strokeStyle: 'shortdash',
      });
      naverPolylinesRef.current.push(polyline);
    }

    if (engine === 'leaflet' && leafletMap) {
      if (leafletLineRef.current) leafletMap.removeLayer(leafletLineRef.current);
      const latLngs = coords.map(c => [c.lat, c.lon] as L.LatLngTuple);
      leafletLineRef.current = L.polyline(latLngs, {
        color, weight: 3, opacity: 0.7, dashArray: '8 4',
      }).addTo(leafletMap);
    }
  }, [drawingNodeIds, naverMap, leafletMap, engine, isDrawing, mode]);

  // === 모드 변경 시 정리 ===
  useEffect(() => {
    if (!isDrawing) clearAllOverlays();
  }, [isDrawing, clearAllOverlays]);

  return null;
}
