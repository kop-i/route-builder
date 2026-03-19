/**
 * RoadViewPanel - 네이버 로드뷰(Panorama) 패널 + 나침반
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useEditorStore } from '@/stores/editorStore';

export default function RoadViewPanel() {
  const { isStreetViewOpen, toggleStreetView } = useEditorStore();
  const naverMap = useMapStore((s) => s.naverMap);
  const leafletMap = useMapStore((s) => s.leafletMap);
  const engine = useMapStore((s) => s.engine);
  const isMapReady = useMapStore((s) => s.isMapReady);

  const [viewLat, setViewLat] = useState(37.4967);
  const [viewLng, setViewLng] = useState(127.0325);
  const [heading, setHeading] = useState(0); // 현재 바라보는 방향 (0=북, 90=동, 180=남, 270=서)
  const panoContainerRef = useRef<HTMLDivElement>(null);
  const panoRef = useRef<naver.maps.Panorama | null>(null);

  // === 네이버 지도 클릭 → 좌표 업데이트 ===
  useEffect(() => {
    if (engine !== 'naver' || !naverMap || !isStreetViewOpen) return;
    const listener = naver.maps.Event.addListener(naverMap, 'click', (e: { coord: naver.maps.LatLng }) => {
      setViewLat(e.coord.lat());
      setViewLng(e.coord.lng());
    });
    return () => { naver.maps.Event.removeListener(listener); };
  }, [naverMap, engine, isStreetViewOpen]);

  // === Leaflet 지도 클릭 → 좌표 업데이트 ===
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap || !isStreetViewOpen) return;
    const onClick = (e: L.LeafletMouseEvent) => {
      setViewLat(e.latlng.lat);
      setViewLng(e.latlng.lng);
    };
    leafletMap.on('click', onClick);
    return () => { leafletMap.off('click', onClick); };
  }, [leafletMap, engine, isStreetViewOpen]);

  // === 네이버 Panorama 생성/업데이트 + 방향 추적 ===
  useEffect(() => {
    if (!isStreetViewOpen || !panoContainerRef.current) return;
    if (engine !== 'naver' || !window.naver?.maps?.Panorama) return;

    const position = new naver.maps.LatLng(viewLat, viewLng);

    if (!panoRef.current) {
      panoRef.current = new naver.maps.Panorama(panoContainerRef.current, {
        position,
        pov: { pan: 0, tilt: 0, fov: 100 },
      });

      // 방향 변경 이벤트 (나침반 업데이트용)
      naver.maps.Event.addListener(panoRef.current, 'pov_changed', () => {
        if (panoRef.current) {
          const pov = panoRef.current.getPov();
          setHeading(pov.pan || 0);
        }
      });
    } else {
      panoRef.current.setPosition(position);
    }
  }, [viewLat, viewLng, isStreetViewOpen, engine]);

  // === 패널 닫힐 때 정리 ===
  useEffect(() => {
    if (!isStreetViewOpen && panoRef.current) {
      panoRef.current = null;
    }
  }, [isStreetViewOpen]);

  if (!isMapReady) return null;

  if (!isStreetViewOpen) {
    return (
      <button
        onClick={toggleStreetView}
        className="absolute top-14 right-4 z-[1000] bg-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        👁️ 로드뷰
      </button>
    );
  }

  const kakaoUrl = `https://map.kakao.com/link/roadview/${viewLat},${viewLng}`;

  return (
    <div
      className="absolute top-0 right-0 z-[1001] h-full flex flex-col bg-white shadow-2xl"
      style={{ width: '420px' }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-100 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">👁️ 로드뷰</span>
          <span className="text-[10px] text-gray-500">
            {viewLat.toFixed(5)}, {viewLng.toFixed(5)}
          </span>
        </div>
        <button
          onClick={toggleStreetView}
          className="text-gray-500 hover:text-gray-800 px-2 py-1 text-lg"
        >
          ✕
        </button>
      </div>

      {/* 로드뷰 콘텐츠 */}
      <div className="flex-1 relative">
        {engine === 'naver' ? (
          <div ref={panoContainerRef} className="w-full h-full" />
        ) : (
          <iframe
            key={`${viewLat}_${viewLng}`}
            src={kakaoUrl}
            className="w-full h-full border-0"
            title="로드뷰"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        )}

        {/* 나침반 */}
        <Compass heading={heading} />

        <div className="absolute bottom-2 left-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded text-center">
          지도를 클릭하면 해당 위치의 로드뷰가 표시됩니다
        </div>
      </div>
    </div>
  );
}

/**
 * 나침반 컴포넌트
 * - 현재 로드뷰가 바라보는 방향을 표시
 * - heading: 0=북, 90=동, 180=남, 270=서
 */
function Compass({ heading }: { heading: number }) {
  return (
    <div className="absolute top-3 left-3 z-10">
      <div
        className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"
        style={{ transform: `rotate(${-heading}deg)` }}
      >
        {/* 나침반 SVG */}
        <svg width="44" height="44" viewBox="0 0 44 44">
          {/* 외곽 원 */}
          <circle cx="22" cy="22" r="20" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />

          {/* 방위 글자 */}
          <text x="22" y="8" textAnchor="middle" fill="#EF4444" fontSize="9" fontWeight="bold">N</text>
          <text x="22" y="40" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="7">S</text>
          <text x="38" y="24" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="7">E</text>
          <text x="6" y="24" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="7">W</text>

          {/* 북쪽 화살표 (빨간색) */}
          <polygon points="22,10 19,22 25,22" fill="#EF4444" />
          {/* 남쪽 화살표 (흰색) */}
          <polygon points="22,34 19,22 25,22" fill="rgba(255,255,255,0.5)" />

          {/* 중심점 */}
          <circle cx="22" cy="22" r="2" fill="white" />
        </svg>
      </div>
      {/* 현재 방향 각도 표시 */}
      <div className="text-center mt-1">
        <span className="text-[9px] text-white bg-black/50 px-1.5 py-0.5 rounded">
          {Math.round(heading)}°
        </span>
      </div>
    </div>
  );
}
