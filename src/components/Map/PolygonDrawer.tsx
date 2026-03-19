/**
 * PolygonDrawer - 서비스 면적 Polygon 그리기 (네이버 + Leaflet)
 *
 * [사용성 개선]
 * - 3점 이상 찍으면 "✅ 면적 완성" 버튼 표시
 * - 더블클릭 OR 버튼 클릭 OR Enter 키로 완성 가능
 * - 클릭 디바운스로 더블클릭 줌 방지
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import { useMapStore } from '@/stores/mapStore';
import { usePathStore } from '@/stores/pathStore';
import { useEditorStore } from '@/stores/editorStore';

export default function PolygonDrawer() {
  const naverMap = useMapStore((s) => s.naverMap);
  const leafletMap = useMapStore((s) => s.leafletMap);
  const engine = useMapStore((s) => s.engine);
  const mode = useEditorStore((s) => s.mode);
  const { serviceArea, setServiceArea, clearServiceArea } = usePathStore();

  // 네이버 refs
  const naverPolygonRef = useRef<naver.maps.Polygon | null>(null);
  const naverClickPoints = useRef<naver.maps.LatLng[]>([]);
  const naverTempMarkersRef = useRef<naver.maps.Marker[]>([]);
  const naverTempPolylineRef = useRef<naver.maps.Polyline | null>(null);

  // Leaflet refs
  const drawnLayerRef = useRef<L.FeatureGroup | null>(null);
  const drawHandlerRef = useRef<L.Draw.Polygon | null>(null);
  const leafletPolygonRef = useRef<L.Polygon | null>(null);

  // 찍은 점 개수 (UI 표시용)
  const [pointCount, setPointCount] = useState(0);

  // === 네이버: polygon 완성 함수 ===
  const finishNaverPolygon = useCallback(() => {
    if (!naverMap) return;
    const points = naverClickPoints.current;
    if (points.length < 3) return;

    // 임시 오버레이 제거
    naverTempMarkersRef.current.forEach(m => m.setMap(null));
    naverTempMarkersRef.current = [];
    if (naverTempPolylineRef.current) naverTempPolylineRef.current.setMap(null);
    naverTempPolylineRef.current = null;

    // polygon 저장
    const polygon = points.map(p => ({ lat: p.lat(), lng: p.lng() }));
    setServiceArea({
      id: `area_${Date.now()}`,
      name: '서비스 면적',
      polygon,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    naverClickPoints.current = [];
    setPointCount(0);
    useEditorStore.getState().setMode('view');
  }, [naverMap, setServiceArea]);

  // ============================================
  // 네이버 지도: 클릭으로 polygon 그리기
  // ============================================
  useEffect(() => {
    if (engine !== 'naver' || !naverMap) return;

    if (mode === 'draw_area') {
      if (naverPolygonRef.current) {
        naverPolygonRef.current.setMap(null);
        naverPolygonRef.current = null;
      }
      clearServiceArea();
      naverClickPoints.current = [];
      setPointCount(0);

      naverMap.setOptions({ disableDoubleClickZoom: true });
      let clickTimer: ReturnType<typeof setTimeout> | null = null;

      const clickListener = naver.maps.Event.addListener(naverMap, 'click', (e: { coord: naver.maps.LatLng }) => {
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          naverClickPoints.current.push(e.coord);
          setPointCount(naverClickPoints.current.length);

          const marker = new naver.maps.Marker({
            position: e.coord,
            map: naverMap,
            icon: {
              content: `<div style="width:10px;height:10px;border-radius:50%;background:#3B82F6;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>`,
              anchor: new naver.maps.Point(5, 5),
            },
          });
          naverTempMarkersRef.current.push(marker);

          // 미리보기 라인 (닫힌 형태로 표시)
          if (naverTempPolylineRef.current) naverTempPolylineRef.current.setMap(null);
          if (naverClickPoints.current.length >= 2) {
            const path = [...naverClickPoints.current, naverClickPoints.current[0]]; // 닫힌 형태
            naverTempPolylineRef.current = new naver.maps.Polyline({
              map: naverMap,
              path,
              strokeColor: '#3B82F6',
              strokeWeight: 2,
              strokeStyle: 'shortdash',
            });
          }
        }, 250);
      });

      const dblClickListener = naver.maps.Event.addListener(naverMap, 'dblclick', () => {
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        finishNaverPolygon();
      });

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          naverTempMarkersRef.current.forEach(m => m.setMap(null));
          naverTempMarkersRef.current = [];
          if (naverTempPolylineRef.current) naverTempPolylineRef.current.setMap(null);
          naverClickPoints.current = [];
          setPointCount(0);
          useEditorStore.getState().setMode('view');
        }
        if (e.key === 'Enter') finishNaverPolygon();
      };
      document.addEventListener('keydown', onKeyDown);

      return () => {
        naver.maps.Event.removeListener(clickListener);
        naver.maps.Event.removeListener(dblClickListener);
        document.removeEventListener('keydown', onKeyDown);
        if (clickTimer) clearTimeout(clickTimer);
        naverMap.setOptions({ disableDoubleClickZoom: false });
      };
    }
  }, [naverMap, engine, mode, finishNaverPolygon, clearServiceArea]);

  // 네이버: 저장된 serviceArea 표시
  useEffect(() => {
    if (engine !== 'naver' || !naverMap) return;

    if (naverPolygonRef.current) {
      naverPolygonRef.current.setMap(null);
      naverPolygonRef.current = null;
    }

    if (serviceArea) {
      const paths = serviceArea.polygon.map(p => new naver.maps.LatLng(p.lat, p.lng));
      naverPolygonRef.current = new naver.maps.Polygon({
        map: naverMap,
        paths: [paths],
        strokeColor: '#3B82F6',
        strokeWeight: 2,
        strokeStyle: 'shortdash',
        fillColor: '#3B82F6',
        fillOpacity: 0.08,
      });
    }
  }, [serviceArea, naverMap, engine]);

  // ============================================
  // Leaflet 지도 (기존 로직 유지)
  // ============================================
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap) return;
    if (!drawnLayerRef.current) {
      drawnLayerRef.current = new L.FeatureGroup();
      leafletMap.addLayer(drawnLayerRef.current);
    }
    const onCreated = (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Created;
      const layer = event.layer as L.Polygon;
      const latLngs = (layer.getLatLngs()[0] as L.LatLng[]);
      const polygon = latLngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
      setServiceArea({
        id: `area_${Date.now()}`, name: '서비스 면적', polygon,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      useEditorStore.getState().setMode('view');
    };
    leafletMap.on(L.Draw.Event.CREATED, onCreated);
    return () => { leafletMap.off(L.Draw.Event.CREATED, onCreated); };
  }, [leafletMap, engine, setServiceArea]);

  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap) return;
    if (mode === 'draw_area') {
      if (leafletPolygonRef.current) { leafletMap.removeLayer(leafletPolygonRef.current); leafletPolygonRef.current = null; }
      clearServiceArea();
      const handler = new L.Draw.Polygon(leafletMap, {
        shapeOptions: { color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.1, weight: 2 },
        allowIntersection: false,
      });
      handler.enable();
      drawHandlerRef.current = handler;
    } else {
      if (drawHandlerRef.current) { drawHandlerRef.current.disable(); drawHandlerRef.current = null; }
    }
  }, [mode, leafletMap, engine, clearServiceArea]);

  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap) return;
    if (leafletPolygonRef.current) { leafletMap.removeLayer(leafletPolygonRef.current); leafletPolygonRef.current = null; }
    if (serviceArea) {
      const latLngs = serviceArea.polygon.map(p => [p.lat, p.lng] as L.LatLngTuple);
      const polygon = L.polygon(latLngs, { color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.08, weight: 2, dashArray: '8 4' });
      polygon.addTo(leafletMap);
      leafletPolygonRef.current = polygon;
      leafletMap.fitBounds(polygon.getBounds(), { padding: [50, 50] });
    }
  }, [serviceArea, leafletMap, engine]);

  // ============================================
  // UI: 면적 완성 버튼 + 점 개수 표시
  // ============================================
  if (mode !== 'draw_area' || engine !== 'naver') return null;

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2">
      {/* 점 개수 표시 */}
      <div className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full">
        {pointCount === 0 && '지도를 클릭하여 꼭짓점을 찍으세요'}
        {pointCount === 1 && '1점 찍음 — 계속 클릭하세요'}
        {pointCount === 2 && '2점 찍음 — 최소 1점 더 필요'}
        {pointCount >= 3 && `${pointCount}점 찍음 — 완성 가능!`}
      </div>

      {/* 완성 버튼 (3점 이상일 때) */}
      {pointCount >= 3 && (
        <button
          onClick={finishNaverPolygon}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-xl shadow-xl text-sm font-bold hover:bg-blue-700 transition-all animate-pulse"
        >
          ✅ 면적 완성 ({pointCount}점)
        </button>
      )}
    </div>
  );
}
