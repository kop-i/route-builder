/**
 * LeafletMap 컴포넌트
 * - vworld 타일을 사용하는 Leaflet 기반 지도
 *
 * [핵심] React 18 StrictMode + Vite HMR 대응:
 * Leaflet은 같은 DOM 요소에 두 번 init하면 에러가 발생한다.
 * DOM 요소에 _leaflet_id가 있으면 이미 초기화된 것이므로 스킵한다.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapStore } from '@/stores/mapStore';

const VWORLD_API_KEY = import.meta.env.VITE_VWORLD_API_KEY;

// vworld 타일 URL 템플릿
const TILE_LAYERS = {
  base: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Base/{z}/{y}/{x}.png`,
  satellite: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Satellite/{z}/{y}/{x}.jpeg`,
  hybrid: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Hybrid/{z}/{y}/{x}.png`,
  osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
};

export default function LeafletMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const setMapReady = useMapStore((s) => s.setMapReady);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 이미 초기화된 컨테이너면 재사용 (StrictMode/HMR 대응)
    if ((container as unknown as Record<string, unknown>)._leaflet_id) {
      if (mapRef.current) {
        setMapReady(true);
      }
      return;
    }

    // Leaflet 지도 생성
    const map = L.map(container, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: true,
    });

    // vworld 기본 지도 레이어
    const baseLayer = L.tileLayer(TILE_LAYERS.base, {
      attribution: '© vworld',
      maxZoom: 19,
      minZoom: 5,
    });

    // vworld 위성 지도 레이어
    const satelliteLayer = L.tileLayer(TILE_LAYERS.satellite, {
      attribution: '© vworld',
      maxZoom: 19,
      minZoom: 5,
    });

    // 하이브리드 (위성 위에 라벨 오버레이)
    const hybridOverlay = L.tileLayer(TILE_LAYERS.hybrid, {
      attribution: '© vworld',
      maxZoom: 19,
      minZoom: 5,
    });

    // OSM fallback
    const osmLayer = L.tileLayer(TILE_LAYERS.osm, {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    });

    // 기본 레이어 추가
    baseLayer.addTo(map);

    // 레이어 컨트롤 (우측 상단에서 전환 가능)
    L.control.layers(
      {
        '일반 지도 (vworld)': baseLayer,
        '위성 지도 (vworld)': satelliteLayer,
        'OpenStreetMap': osmLayer,
      },
      {
        '도로명/건물명': hybridOverlay,
      },
      { position: 'topright' }
    ).addTo(map);

    // 축척 표시
    L.control.scale({ position: 'bottomright', metric: true, imperial: false }).addTo(map);

    mapRef.current = map;
    setMapReady(true);
    console.log('✅ Leaflet + vworld 지도 초기화 완료');

    // cleanup: 실제 언마운트 시에만 파괴
    return () => {
      // StrictMode에서는 바로 re-mount되므로 파괴하지 않음
      // 실제 페이지 이탈 시에만 파괴됨
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ minHeight: '100vh' }}
      />
    </div>
  );
}
