/**
 * MapContainer - 통합 지도 컴포넌트
 *
 * [전략] 환경 변수로 지도 엔진 선택
 * - VITE_MAP_ENGINE=naver → 네이버 지도 사용
 * - VITE_MAP_ENGINE=leaflet 또는 미설정 → Leaflet + vworld 사용
 *
 * 네이버 API 인증이 정상화되면 .env에서 VITE_MAP_ENGINE=naver로 변경하면 됨.
 */
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapStore } from '@/stores/mapStore';

const NAVER_CLIENT_ID = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
const NAVER_CLIENT_SECRET = import.meta.env.VITE_NAVER_MAP_CLIENT_SECRET;
const VWORLD_API_KEY = import.meta.env.VITE_VWORLD_API_KEY;

// .env에서 VITE_MAP_ENGINE=naver 로 설정하면 네이버 지도 사용
const PREFERRED_ENGINE = import.meta.env.VITE_MAP_ENGINE || 'leaflet';

// vworld 타일
const VWORLD_TILES = {
  base: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Base/{z}/{y}/{x}.png`,
  satellite: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Satellite/{z}/{y}/{x}.jpeg`,
  hybrid: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Hybrid/{z}/{y}/{x}.png`,
  osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
};

/** 네이버 Maps 스크립트 로드 */
function loadNaverScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!NAVER_CLIENT_ID) { resolve(false); return; }
    if (window.naver?.maps?.Map) { resolve(true); return; }

    const timer = setTimeout(() => resolve(false), 5000);
    const script = document.createElement('script');
    // 2025년 업그레이드 이후: ncpClientId → ncpKeyId 로 파라미터명 변경됨
    // panorama 서브모듈: 네이버 로드뷰 지원
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${NAVER_CLIENT_ID}&submodules=panorama,geocoder`;
    script.async = true;
    script.onload = () => { setTimeout(() => { clearTimeout(timer); resolve(!!window.naver?.maps?.Map); }, 300); };
    script.onerror = () => { clearTimeout(timer); resolve(false); };
    document.head.appendChild(script);
  });
}

export default function MapContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInitialized = useRef(false);
  const [status, setStatus] = useState<'loading' | 'naver' | 'leaflet'>('loading');

  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const setNaverMap = useMapStore((s) => s.setNaverMap);
  const setLeafletMap = useMapStore((s) => s.setLeafletMap);
  const setMapReady = useMapStore((s) => s.setMapReady);

  useEffect(() => {
    if (!containerRef.current || mapInitialized.current) return;
    mapInitialized.current = true;

    async function init() {
      const container = containerRef.current!;
      setStatus('loading');

      // === 네이버 지도 엔진 선택 시 ===
      if (PREFERRED_ENGINE === 'naver') {
        console.log('🔄 네이버 지도 로드 중...');
        const loaded = await loadNaverScript();
        if (loaded) {
          try {
            const map = new naver.maps.Map(container, {
              center: new naver.maps.LatLng(center.lat, center.lng),
              zoom,
              zoomControl: true,
              zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT },
              mapTypeId: naver.maps.MapTypeId.NORMAL,
              scaleControl: true,
              mapDataControl: false,
            });
            setNaverMap(map);
            setMapReady(true);
            setStatus('naver');
            console.log('✅ 네이버 지도 초기화 완료');
            return;
          } catch (e) {
            console.warn('⚠️ 네이버 지도 실패, vworld로 전환:', e);
          }
        }
      }

      // === Leaflet + vworld (기본) ===
      initLeaflet(container);
    }

    function initLeaflet(container: HTMLElement) {
      if ((container as unknown as Record<string, unknown>)._leaflet_id) return;

      const map = L.map(container, {
        center: [center.lat, center.lng],
        zoom,
        zoomControl: true,
      });

      const baseLayer = L.tileLayer(VWORLD_TILES.base, {
        attribution: '© vworld',
        maxZoom: 19,
        minZoom: 5,
      });

      const satelliteLayer = L.tileLayer(VWORLD_TILES.satellite, {
        attribution: '© vworld',
        maxZoom: 19,
        minZoom: 5,
      });

      const hybridOverlay = L.tileLayer(VWORLD_TILES.hybrid, {
        attribution: '© vworld',
        maxZoom: 19,
        minZoom: 5,
      });

      const osmLayer = L.tileLayer(VWORLD_TILES.osm, {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      });

      baseLayer.addTo(map);

      L.control.layers(
        {
          '일반 지도 (vworld)': baseLayer,
          '위성 지도 (vworld)': satelliteLayer,
          'OpenStreetMap': osmLayer,
        },
        { '도로명/건물명': hybridOverlay },
        { position: 'topright' }
      ).addTo(map);

      L.control.scale({
        position: 'bottomright',
        metric: true,
        imperial: false,
      }).addTo(map);

      setLeafletMap(map);
      setMapReady(true);
      setStatus('leaflet');
      console.log('✅ Leaflet + vworld 지도 초기화 완료');
    }

    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ minHeight: '100vh' }}
      />

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-[999]">
          <div className="text-center">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-600 text-sm">지도를 불러오는 중...</p>
          </div>
        </div>
      )}

      {status !== 'loading' && (
        <div className="absolute bottom-2 left-2 z-[1000]">
          <span className={`
            text-[10px] px-2 py-0.5 rounded-full font-medium
            ${status === 'naver'
              ? 'bg-green-100 text-green-700'
              : 'bg-blue-100 text-blue-700'
            }
          `}>
            {status === 'naver' ? '🗺️ Naver Maps' : '🗺️ vworld'}
          </span>
        </div>
      )}
    </div>
  );
}
