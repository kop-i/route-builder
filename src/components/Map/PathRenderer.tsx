/**
 * PathRenderer - 경로 데이터를 지도 위에 시각화
 *
 * [기능]
 * - 노드를 원(circle marker)으로 표시
 * - 웨이를 폴리라인으로 표시 (도로 유형별 색상)
 * - 레이어 가시성 토글 지원
 * - 선택 모드에서 웨이 클릭 → 삭제
 * - 노드 이동 모드에서 노드 드래그
 *
 * [색상 코드]
 * - 인도(sidewalk): 파란색 #3B82F6
 * - 건널목(crosswalk): 빨간색 #EF4444
 * - 이면도로(sideroad): 주황색 #F59E0B
 * - 기타: 회색 #6B7280
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMapStore } from '@/stores/mapStore';
import { usePathStore } from '@/stores/pathStore';
import { useEditorStore } from '@/stores/editorStore';
import type { RoadType } from '@/types/osm';

// 도로 유형별 색상
const ROAD_COLORS: Record<string, string> = {
  sidewalk: '#3B82F6',    // 파란색
  crosswalk: '#EF4444',   // 빨간색
  sideroad: '#F59E0B',    // 주황색
  drive_on_middle: '#8B5CF6', // 보라색
  default: '#6B7280',     // 회색
};

/** 웨이의 road_type 태그에서 RoadType 추출 */
function getWayRoadType(tags: { k: string; v: string }[]): string {
  const roadTypeTag = tags.find((t) => t.k === 'road_type');
  return roadTypeTag?.v || 'sidewalk'; // 태그 없으면 기본값 = sidewalk
}

export default function PathRenderer() {
  const leafletMap = useMapStore((s) => s.leafletMap);
  const engine = useMapStore((s) => s.engine);
  const { nodes, ways, updateNodePosition, removeWay } = usePathStore();
  const { mode, layerVisibility, selectedElement, setSelectedElement } = useEditorStore();

  // 렌더링된 레이어들을 추적 (정리용)
  const wayLayersRef = useRef<Map<number, L.Polyline>>(new Map());
  const nodeLayersRef = useRef<Map<number, L.CircleMarker>>(new Map());

  // === 웨이 렌더링 ===
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap) return;

    // 노드 ID → 좌표 맵 (빠른 조회용)
    const nodeMap = new Map(nodes.map((n) => [n.id, { lat: n.lat, lon: n.lon }]));

    // 기존 웨이 레이어 제거
    wayLayersRef.current.forEach((layer) => leafletMap.removeLayer(layer));
    wayLayersRef.current.clear();

    // 웨이 렌더링
    for (const way of ways) {
      const roadType = getWayRoadType(way.tags);

      // 레이어 가시성 체크
      if (roadType === 'sidewalk' && !layerVisibility.sidewalk) continue;
      if (roadType === 'crosswalk' && !layerVisibility.crosswalk) continue;
      if (roadType === 'sideroad' && !layerVisibility.sideroad) continue;

      // 노드 좌표 배열 생성
      const latLngs: L.LatLngTuple[] = [];
      for (const nodeRef of way.nodeRefs) {
        const node = nodeMap.get(nodeRef);
        if (node) latLngs.push([node.lat, node.lon]);
      }

      if (latLngs.length < 2) continue;

      const color = ROAD_COLORS[roadType] || ROAD_COLORS.default;
      const isSelected = selectedElement?.type === 'way' && selectedElement.id === way.id;

      const polyline = L.polyline(latLngs, {
        color: isSelected ? '#FF0000' : color,
        weight: isSelected ? 5 : 3,
        opacity: 0.8,
      });

      // 선택/삭제 모드에서 클릭 이벤트
      if (mode === 'select') {
        polyline.on('click', () => {
          setSelectedElement({ type: 'way', id: way.id });
        });
      }

      polyline.addTo(leafletMap);
      wayLayersRef.current.set(way.id, polyline);
    }

    return () => {
      wayLayersRef.current.forEach((layer) => leafletMap.removeLayer(layer));
      wayLayersRef.current.clear();
    };
  }, [ways, nodes, leafletMap, engine, layerVisibility, mode, selectedElement]);

  // === 노드 렌더링 ===
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap || !layerVisibility.nodes) {
      // 노드 숨기기
      nodeLayersRef.current.forEach((layer) => leafletMap?.removeLayer(layer));
      nodeLayersRef.current.clear();
      return;
    }

    // 기존 노드 레이어 제거
    nodeLayersRef.current.forEach((layer) => leafletMap.removeLayer(layer));
    nodeLayersRef.current.clear();

    // 노드가 너무 많으면 성능 이슈 → 줌 레벨에 따라 표시 제한
    const currentZoom = leafletMap.getZoom();
    if (currentZoom < 16 || nodes.length > 5000) return; // 줌 16 미만이면 노드 숨김

    for (const node of nodes) {
      const isSelected = selectedElement?.type === 'node' && selectedElement.id === node.id;
      const isDraggable = mode === 'move_node';

      const marker = L.circleMarker([node.lat, node.lon], {
        radius: isSelected ? 6 : 3,
        color: isSelected ? '#FF0000' : '#374151',
        fillColor: isSelected ? '#FF0000' : '#6B7280',
        fillOpacity: 0.8,
        weight: 1,
      });

      // 노드 이동 모드에서 드래그 지원
      if (isDraggable) {
        // CircleMarker는 드래그 불가 → 일반 Marker로 대체
        // 여기서는 클릭 후 지도 클릭으로 위치 변경하는 방식 사용
        marker.on('click', () => {
          setSelectedElement({ type: 'node', id: node.id });
        });
      }

      marker.addTo(leafletMap);
      nodeLayersRef.current.set(node.id, marker);
    }

    return () => {
      nodeLayersRef.current.forEach((layer) => leafletMap.removeLayer(layer));
      nodeLayersRef.current.clear();
    };
  }, [nodes, leafletMap, engine, layerVisibility.nodes, mode, selectedElement]);

  // === 노드 이동 모드: 지도 클릭 시 선택된 노드 이동 ===
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap || mode !== 'move_node') return;

    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (selectedElement?.type === 'node') {
        updateNodePosition(selectedElement.id, e.latlng.lat, e.latlng.lng);
        setSelectedElement(null); // 이동 후 선택 해제
      }
    };

    leafletMap.on('click', onMapClick);
    return () => { leafletMap.off('click', onMapClick); };
  }, [leafletMap, engine, mode, selectedElement, updateNodePosition, setSelectedElement]);

  return null;
}
