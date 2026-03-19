/**
 * PolygonDrawer - 서비스 면적 Polygon 그리기
 *
 * [기능]
 * - "면적 그리기" 모드에서 지도 위에 polygon을 그림
 * - 그리기 완료 시 pathStore에 serviceArea 저장
 * - 기존 polygon이 있으면 지도에 표시
 *
 * [Leaflet.draw 사용]
 * - L.Draw.Polygon으로 자유 polygon 그리기
 * - 완료 시 좌표 추출 → serviceArea에 저장
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import { useMapStore } from '@/stores/mapStore';
import { usePathStore } from '@/stores/pathStore';
import { useEditorStore } from '@/stores/editorStore';

export default function PolygonDrawer() {
  const leafletMap = useMapStore((s) => s.leafletMap);
  const engine = useMapStore((s) => s.engine);
  const mode = useEditorStore((s) => s.mode);
  const { serviceArea, setServiceArea, clearServiceArea } = usePathStore();

  // Leaflet 레이어 그룹과 draw handler를 ref로 관리
  const drawnLayerRef = useRef<L.FeatureGroup | null>(null);
  const drawHandlerRef = useRef<L.Draw.Polygon | null>(null);
  const polygonLayerRef = useRef<L.Polygon | null>(null);

  // === Leaflet 엔진용 ===
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap) return;

    // 그리기 결과를 담을 FeatureGroup
    if (!drawnLayerRef.current) {
      drawnLayerRef.current = new L.FeatureGroup();
      leafletMap.addLayer(drawnLayerRef.current);
    }

    // 그리기 완료 이벤트 핸들러
    const onCreated = (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Created;
      const layer = event.layer as L.Polygon;
      const latLngs = (layer.getLatLngs()[0] as L.LatLng[]);

      // 좌표를 serviceArea에 저장
      const polygon = latLngs.map((ll) => ({
        lat: ll.lat,
        lng: ll.lng,
      }));

      setServiceArea({
        id: `area_${Date.now()}`,
        name: '서비스 면적',
        polygon,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 그리기 모드 종료
      useEditorStore.getState().setMode('view');
    };

    leafletMap.on(L.Draw.Event.CREATED, onCreated);

    return () => {
      leafletMap.off(L.Draw.Event.CREATED, onCreated);
    };
  }, [leafletMap, engine, setServiceArea]);

  // === "면적 그리기" 모드 전환 시 Leaflet draw handler 활성화/비활성화 ===
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap) return;

    if (mode === 'draw_area') {
      // 기존 polygon 제거
      if (polygonLayerRef.current) {
        leafletMap.removeLayer(polygonLayerRef.current);
        polygonLayerRef.current = null;
      }
      clearServiceArea();

      // draw 핸들러 시작
      const handler = new L.Draw.Polygon(leafletMap, {
        shapeOptions: {
          color: '#3B82F6',
          fillColor: '#3B82F6',
          fillOpacity: 0.1,
          weight: 2,
        },
        allowIntersection: false,
      });
      handler.enable();
      drawHandlerRef.current = handler;
    } else {
      // 다른 모드로 전환 시 draw 핸들러 비활성화
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
      }
    }
  }, [mode, leafletMap, engine, clearServiceArea]);

  // === 저장된 serviceArea를 지도에 표시 ===
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap) return;

    // 기존 polygon 레이어 제거
    if (polygonLayerRef.current) {
      leafletMap.removeLayer(polygonLayerRef.current);
      polygonLayerRef.current = null;
    }

    // 새 polygon 그리기
    if (serviceArea) {
      const latLngs = serviceArea.polygon.map((p) => [p.lat, p.lng] as L.LatLngTuple);
      const polygon = L.polygon(latLngs, {
        color: '#3B82F6',
        fillColor: '#3B82F6',
        fillOpacity: 0.08,
        weight: 2,
        dashArray: '8 4',
      });
      polygon.addTo(leafletMap);
      polygonLayerRef.current = polygon;

      // polygon 범위로 지도 이동
      leafletMap.fitBounds(polygon.getBounds(), { padding: [50, 50] });
    }
  }, [serviceArea, leafletMap, engine]);

  // 이 컴포넌트는 UI를 렌더링하지 않음 (Leaflet 오버레이만 관리)
  return null;
}
