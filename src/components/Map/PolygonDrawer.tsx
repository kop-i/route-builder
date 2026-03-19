/**
 * PolygonDrawer - 서비스 면적 Polygon 그리기 (네이버 + Leaflet)
 */
import { useEffect, useRef } from 'react';
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

  // Leaflet refs
  const drawnLayerRef = useRef<L.FeatureGroup | null>(null);
  const drawHandlerRef = useRef<L.Draw.Polygon | null>(null);
  const leafletPolygonRef = useRef<L.Polygon | null>(null);

  // 네이버 refs
  const naverPolygonRef = useRef<naver.maps.Polygon | null>(null);
  const naverClickPoints = useRef<naver.maps.LatLng[]>([]);
  const naverTempMarkersRef = useRef<naver.maps.Marker[]>([]);
  const naverTempPolylineRef = useRef<naver.maps.Polyline | null>(null);

  // ============================================
  // 네이버 지도: 클릭으로 polygon 그리기
  // ============================================
  useEffect(() => {
    if (engine !== 'naver' || !naverMap) return;

    if (mode === 'draw_area') {
      // 기존 polygon 제거
      if (naverPolygonRef.current) {
        naverPolygonRef.current.setMap(null);
        naverPolygonRef.current = null;
      }
      clearServiceArea();
      naverClickPoints.current = [];

      // 더블클릭 줌 비활성화 (그리기 모드에서)
      naverMap.setOptions({ disableDoubleClickZoom: true });

      // 클릭 디바운스: 더블클릭과 구분하기 위해 300ms 대기
      let clickTimer: ReturnType<typeof setTimeout> | null = null;

      const clickListener = naver.maps.Event.addListener(naverMap, 'click', (e: { coord: naver.maps.LatLng }) => {
        // 디바운스: 300ms 내 더블클릭이 오면 이 클릭은 무시
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          naverClickPoints.current.push(e.coord);

          // 마커 표시
          const marker = new naver.maps.Marker({
            position: e.coord,
            map: naverMap,
            icon: {
              content: '<div style="width:8px;height:8px;border-radius:50%;background:#3B82F6;border:2px solid white;"></div>',
              anchor: new naver.maps.Point(4, 4),
            },
          });
          naverTempMarkersRef.current.push(marker);

          // 미리보기 라인 업데이트
          if (naverTempPolylineRef.current) naverTempPolylineRef.current.setMap(null);
          if (naverClickPoints.current.length >= 2) {
            naverTempPolylineRef.current = new naver.maps.Polyline({
              map: naverMap,
              path: naverClickPoints.current,
              strokeColor: '#3B82F6',
              strokeWeight: 2,
              strokeStyle: 'shortdash',
            });
          }
        }, 300);
      });

      // 더블클릭으로 polygon 완성
      const dblClickListener = naver.maps.Event.addListener(naverMap, 'dblclick', () => {
        // 디바운스된 클릭 취소
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }

        const points = naverClickPoints.current;
        if (points.length < 3) return;

        // 임시 마커/라인 제거
        naverTempMarkersRef.current.forEach(m => m.setMap(null));
        naverTempMarkersRef.current = [];
        if (naverTempPolylineRef.current) naverTempPolylineRef.current.setMap(null);

        // polygon 저장
        const polygon = points.map(p => ({ lat: p.lat(), lng: p.lng() }));
        setServiceArea({
          id: `area_${Date.now()}`,
          name: '서비스 면적',
          polygon,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        useEditorStore.getState().setMode('view');
      });

      // ESC로 취소
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          naverTempMarkersRef.current.forEach(m => m.setMap(null));
          naverTempMarkersRef.current = [];
          if (naverTempPolylineRef.current) naverTempPolylineRef.current.setMap(null);
          naverClickPoints.current = [];
          useEditorStore.getState().setMode('view');
        }
      };
      document.addEventListener('keydown', onKeyDown);

      return () => {
        naver.maps.Event.removeListener(clickListener);
        naver.maps.Event.removeListener(dblClickListener);
        document.removeEventListener('keydown', onKeyDown);
        if (clickTimer) clearTimeout(clickTimer);
        // 더블클릭 줌 복원
        naverMap.setOptions({ disableDoubleClickZoom: false });
      };
    }
  }, [naverMap, engine, mode]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Leaflet 지도: Leaflet.draw 사용
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
        id: `area_${Date.now()}`,
        name: '서비스 면적',
        polygon,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      useEditorStore.getState().setMode('view');
    };

    leafletMap.on(L.Draw.Event.CREATED, onCreated);
    return () => { leafletMap.off(L.Draw.Event.CREATED, onCreated); };
  }, [leafletMap, engine, setServiceArea]);

  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap) return;

    if (mode === 'draw_area') {
      if (leafletPolygonRef.current) {
        leafletMap.removeLayer(leafletPolygonRef.current);
        leafletPolygonRef.current = null;
      }
      clearServiceArea();

      const handler = new L.Draw.Polygon(leafletMap, {
        shapeOptions: { color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.1, weight: 2 },
        allowIntersection: false,
      });
      handler.enable();
      drawHandlerRef.current = handler;
    } else {
      if (drawHandlerRef.current) {
        drawHandlerRef.current.disable();
        drawHandlerRef.current = null;
      }
    }
  }, [mode, leafletMap, engine, clearServiceArea]);

  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap) return;

    if (leafletPolygonRef.current) {
      leafletMap.removeLayer(leafletPolygonRef.current);
      leafletPolygonRef.current = null;
    }

    if (serviceArea) {
      const latLngs = serviceArea.polygon.map(p => [p.lat, p.lng] as L.LatLngTuple);
      const polygon = L.polygon(latLngs, {
        color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.08, weight: 2, dashArray: '8 4',
      });
      polygon.addTo(leafletMap);
      leafletPolygonRef.current = polygon;
      leafletMap.fitBounds(polygon.getBounds(), { padding: [50, 50] });
    }
  }, [serviceArea, leafletMap, engine]);

  return null;
}
