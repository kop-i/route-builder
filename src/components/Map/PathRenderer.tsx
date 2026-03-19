/**
 * PathRenderer - 경로 데이터를 지도 위에 시각화 (네이버 + Leaflet)
 *
 * 색상 코드:
 * - 인도(sidewalk): 파란색 #3B82F6
 * - 건널목(crosswalk): 빨간색 #EF4444
 * - 이면도로(sideroad): 주황색 #F59E0B
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMapStore } from '@/stores/mapStore';
import { usePathStore } from '@/stores/pathStore';
import { useEditorStore } from '@/stores/editorStore';

const ROAD_COLORS: Record<string, string> = {
  sidewalk: '#3B82F6',
  crosswalk: '#EF4444',
  sideroad: '#F59E0B',
  drive_on_middle: '#8B5CF6',
  default: '#6B7280',
};

function getWayRoadType(tags: { k: string; v: string }[]): string {
  return tags.find(t => t.k === 'road_type')?.v || 'sidewalk';
}

export default function PathRenderer() {
  const naverMap = useMapStore((s) => s.naverMap);
  const leafletMap = useMapStore((s) => s.leafletMap);
  const engine = useMapStore((s) => s.engine);
  const { nodes, ways, removeWay, updateNodePosition } = usePathStore();
  const { mode, layerVisibility, selectedElement, setSelectedElement } = useEditorStore();

  // 네이버 오버레이 refs
  const naverWayLinesRef = useRef<Map<number, naver.maps.Polyline>>(new Map());
  const naverNodeMarkersRef = useRef<Map<number, naver.maps.Marker>>(new Map());

  // Leaflet 오버레이 refs
  const leafletWayLayersRef = useRef<Map<number, L.Polyline>>(new Map());
  const leafletNodeLayersRef = useRef<Map<number, L.CircleMarker>>(new Map());

  // 노드 맵 (공통)
  const nodeMap = new Map(nodes.map(n => [n.id, { lat: n.lat, lon: n.lon }]));

  // ============================================
  // 웨이 렌더링
  // ============================================
  useEffect(() => {
    // 정리
    if (engine === 'naver' && naverMap) {
      naverWayLinesRef.current.forEach(p => p.setMap(null));
      naverWayLinesRef.current.clear();
    }
    if (engine === 'leaflet' && leafletMap) {
      leafletWayLayersRef.current.forEach(p => leafletMap.removeLayer(p));
      leafletWayLayersRef.current.clear();
    }

    const nodeMap = new Map(nodes.map(n => [n.id, { lat: n.lat, lon: n.lon }]));

    for (const way of ways) {
      const roadType = getWayRoadType(way.tags);

      if (roadType === 'sidewalk' && !layerVisibility.sidewalk) continue;
      if (roadType === 'crosswalk' && !layerVisibility.crosswalk) continue;
      if (roadType === 'sideroad' && !layerVisibility.sideroad) continue;

      const coords = way.nodeRefs
        .map(ref => nodeMap.get(ref))
        .filter((c): c is { lat: number; lon: number } => c !== undefined);

      if (coords.length < 2) continue;

      const color = ROAD_COLORS[roadType] || ROAD_COLORS.default;
      const isSelected = selectedElement?.type === 'way' && selectedElement.id === way.id;

      if (engine === 'naver' && naverMap) {
        const path = coords.map(c => new naver.maps.LatLng(c.lat, c.lon));
        const polyline = new naver.maps.Polyline({
          map: naverMap,
          path,
          strokeColor: isSelected ? '#FF0000' : color,
          strokeWeight: isSelected ? 5 : 3,
          strokeOpacity: 0.8,
          clickable: mode === 'select',
        });

        if (mode === 'select') {
          naver.maps.Event.addListener(polyline, 'click', () => {
            setSelectedElement({ type: 'way', id: way.id });
          });
        }

        naverWayLinesRef.current.set(way.id, polyline);
      }

      if (engine === 'leaflet' && leafletMap) {
        const latLngs = coords.map(c => [c.lat, c.lon] as L.LatLngTuple);
        const polyline = L.polyline(latLngs, {
          color: isSelected ? '#FF0000' : color,
          weight: isSelected ? 5 : 3,
          opacity: 0.8,
        });

        if (mode === 'select') {
          polyline.on('click', () => setSelectedElement({ type: 'way', id: way.id }));
        }

        polyline.addTo(leafletMap);
        leafletWayLayersRef.current.set(way.id, polyline);
      }
    }

    return () => {
      naverWayLinesRef.current.forEach(p => p.setMap(null));
      naverWayLinesRef.current.clear();
      leafletWayLayersRef.current.forEach(p => leafletMap?.removeLayer(p));
      leafletWayLayersRef.current.clear();
    };
  }, [ways, nodes, naverMap, leafletMap, engine, layerVisibility, mode, selectedElement]);

  // ============================================
  // 노드 렌더링
  // ============================================
  useEffect(() => {
    // 정리
    naverNodeMarkersRef.current.forEach(m => m.setMap(null));
    naverNodeMarkersRef.current.clear();
    leafletNodeLayersRef.current.forEach(m => leafletMap?.removeLayer(m));
    leafletNodeLayersRef.current.clear();

    if (!layerVisibility.nodes || nodes.length > 5000) return;

    for (const node of nodes) {
      const isSelected = selectedElement?.type === 'node' && selectedElement.id === node.id;

      if (engine === 'naver' && naverMap) {
        const size = isSelected ? 12 : 6;
        const bgColor = isSelected ? '#FF0000' : '#6B7280';
        const marker = new naver.maps.Marker({
          position: new naver.maps.LatLng(node.lat, node.lon),
          map: naverMap,
          icon: {
            content: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bgColor};border:1px solid #374151;"></div>`,
            anchor: new naver.maps.Point(size / 2, size / 2),
          },
          clickable: mode === 'move_node' || mode === 'select',
        });

        if (mode === 'move_node') {
          naver.maps.Event.addListener(marker, 'click', () => {
            setSelectedElement({ type: 'node', id: node.id });
          });
        }

        naverNodeMarkersRef.current.set(node.id, marker);
      }

      if (engine === 'leaflet' && leafletMap) {
        const marker = L.circleMarker([node.lat, node.lon], {
          radius: isSelected ? 6 : 3,
          color: isSelected ? '#FF0000' : '#374151',
          fillColor: isSelected ? '#FF0000' : '#6B7280',
          fillOpacity: 0.8,
          weight: 1,
        });

        if (mode === 'move_node') {
          marker.on('click', () => setSelectedElement({ type: 'node', id: node.id }));
        }

        marker.addTo(leafletMap);
        leafletNodeLayersRef.current.set(node.id, marker);
      }
    }

    return () => {
      naverNodeMarkersRef.current.forEach(m => m.setMap(null));
      naverNodeMarkersRef.current.clear();
      leafletNodeLayersRef.current.forEach(m => leafletMap?.removeLayer(m));
      leafletNodeLayersRef.current.clear();
    };
  }, [nodes, naverMap, leafletMap, engine, layerVisibility.nodes, mode, selectedElement]);

  // ============================================
  // 노드 이동 모드: 지도 클릭 시 선택된 노드 이동
  // ============================================
  useEffect(() => {
    if (mode !== 'move_node' || !selectedElement || selectedElement.type !== 'node') return;

    if (engine === 'naver' && naverMap) {
      const listener = naver.maps.Event.addListener(naverMap, 'click', (e: { coord: naver.maps.LatLng }) => {
        updateNodePosition(selectedElement.id, e.coord.lat(), e.coord.lng());
        setSelectedElement(null);
      });
      return () => { naver.maps.Event.removeListener(listener); };
    }

    if (engine === 'leaflet' && leafletMap) {
      const onClick = (e: L.LeafletMouseEvent) => {
        updateNodePosition(selectedElement.id, e.latlng.lat, e.latlng.lng);
        setSelectedElement(null);
      };
      leafletMap.on('click', onClick);
      return () => { leafletMap.off('click', onClick); };
    }
  }, [naverMap, leafletMap, engine, mode, selectedElement, updateNodePosition, setSelectedElement]);

  return null;
}
