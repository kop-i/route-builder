/**
 * RoadViewPanel - 네이버 로드뷰 + 경로 오버레이 + 나침반
 *
 * [경로 오버레이]
 * - 로드뷰 위에 주변 경로 노드를 색상 점으로 표시
 * - 인도=파랑, 건널목=빨강, 이면도로=주황, 차도=회색
 * - 노드 간 연결선도 표시
 * - 카메라 위치/방향 기반 좌표 투영
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useEditorStore } from '@/stores/editorStore';
import { usePathStore } from '@/stores/pathStore';
import { projectPointsToRoadview } from '@/utils/roadviewProjection';

const ROAD_COLORS: Record<string, string> = {
  sidewalk: '#3B82F6',
  crosswalk: '#EF4444',
  sideroad: '#F59E0B',
  road: '#9CA3AF',
  default: '#6B7280',
};

export default function RoadViewPanel() {
  const { isStreetViewOpen, toggleStreetView } = useEditorStore();
  const naverMap = useMapStore((s) => s.naverMap);
  const leafletMap = useMapStore((s) => s.leafletMap);
  const engine = useMapStore((s) => s.engine);
  const isMapReady = useMapStore((s) => s.isMapReady);
  const { nodes, ways } = usePathStore();

  const [viewLat, setViewLat] = useState(37.4967);
  const [viewLng, setViewLng] = useState(127.0325);
  const [heading, setHeading] = useState(0);
  const panoContainerRef = useRef<HTMLDivElement>(null);
  const panoRef = useRef<naver.maps.Panorama | null>(null);

  // 지도 클릭 → 좌표 업데이트
  useEffect(() => {
    if (engine !== 'naver' || !naverMap || !isStreetViewOpen) return;
    const listener = naver.maps.Event.addListener(naverMap, 'click', (e: { coord: naver.maps.LatLng }) => {
      setViewLat(e.coord.lat());
      setViewLng(e.coord.lng());
    });
    return () => { naver.maps.Event.removeListener(listener); };
  }, [naverMap, engine, isStreetViewOpen]);

  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMap || !isStreetViewOpen) return;
    const onClick = (e: L.LeafletMouseEvent) => { setViewLat(e.latlng.lat); setViewLng(e.latlng.lng); };
    leafletMap.on('click', onClick);
    return () => { leafletMap.off('click', onClick); };
  }, [leafletMap, engine, isStreetViewOpen]);

  // Panorama 생성/업데이트
  useEffect(() => {
    if (!isStreetViewOpen || !panoContainerRef.current) return;
    if (engine !== 'naver' || !window.naver?.maps?.Panorama) return;

    const position = new naver.maps.LatLng(viewLat, viewLng);
    if (!panoRef.current) {
      panoRef.current = new naver.maps.Panorama(panoContainerRef.current, {
        position,
        pov: { pan: 0, tilt: 0, fov: 100 },
      });
      naver.maps.Event.addListener(panoRef.current, 'pov_changed', () => {
        if (panoRef.current) setHeading(panoRef.current.getPov().pan || 0);
      });
    } else {
      panoRef.current.setPosition(position);
    }
  }, [viewLat, viewLng, isStreetViewOpen, engine]);

  useEffect(() => {
    if (!isStreetViewOpen && panoRef.current) panoRef.current = null;
  }, [isStreetViewOpen]);

  // === 경로 오버레이 데이터 계산 ===
  const overlayData = useMemo(() => {
    if (!isStreetViewOpen || nodes.length === 0 || ways.length === 0) return [];

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // 카메라 주변 50m 이내의 웨이만 가져오기
    const nearbyWays = ways.filter(way => {
      const midRef = way.nodeRefs[Math.floor(way.nodeRefs.length / 2)];
      const midNode = nodeMap.get(midRef);
      if (!midNode) return false;
      const dlat = (midNode.lat - viewLat) * 111000;
      const dlon = (midNode.lon - viewLng) * 88000;
      return Math.sqrt(dlat * dlat + dlon * dlon) < 60; // 60m 이내
    });

    // 각 웨이의 노드를 투영
    return nearbyWays.map(way => {
      const roadType = way.tags.find(t => t.k === 'road_type')?.v || 'sideroad';
      const color = ROAD_COLORS[roadType] || ROAD_COLORS.default;

      const wayNodes = way.nodeRefs
        .map(id => nodeMap.get(id))
        .filter((n): n is NonNullable<typeof n> => n !== undefined)
        .map(n => ({ lat: n.lat, lon: n.lon, nodeId: n.id }));

      const projected = projectPointsToRoadview(viewLat, viewLng, heading, 100, wayNodes, 60);

      return { wayId: way.id, roadType, color, points: projected };
    });
  }, [viewLat, viewLng, heading, nodes, ways, isStreetViewOpen]);

  if (!isMapReady || !isStreetViewOpen) return null;

  return (
    <div
      className="absolute top-0 right-0 z-[1001] h-full flex flex-col bg-white shadow-2xl"
      style={{ width: '420px' }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-100 border-b">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-800">👁️ 로드뷰</span>
          <span className="text-[9px] text-gray-400">{viewLat.toFixed(5)}, {viewLng.toFixed(5)}</span>
          {overlayData.length > 0 && (
            <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
              경로 {overlayData.length}개
            </span>
          )}
        </div>
        <button onClick={toggleStreetView} className="text-gray-400 hover:text-gray-600 px-1">✕</button>
      </div>

      {/* 로드뷰 + 오버레이 */}
      <div className="flex-1 relative">
        <div ref={panoContainerRef} className="w-full h-full" />

        {/* === 경로 오버레이 (SVG) === */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
          {overlayData.map(({ wayId, color, points }) => {
            const visiblePoints = points.filter(p => p.visible);
            if (visiblePoints.length === 0) return null;

            return (
              <g key={wayId}>
                {/* 연결선 */}
                {visiblePoints.length >= 2 && (
                  <polyline
                    points={visiblePoints.map(p => `${p.x * 420},${p.y * 100}%`).join(' ')}
                    fill="none"
                    stroke={color}
                    strokeWidth="3"
                    strokeOpacity="0.7"
                    strokeDasharray="6 3"
                  />
                )}
                {/* 노드 점 */}
                {visiblePoints.map((p, i) => (
                  <circle
                    key={i}
                    cx={`${p.x * 100}%`}
                    cy={`${p.y * 100}%`}
                    r={Math.max(4, 8 - p.distance / 10)}
                    fill={color}
                    stroke="white"
                    strokeWidth="2"
                    opacity="0.9"
                  />
                ))}
              </g>
            );
          })}
        </svg>

        {/* 나침반 */}
        <Compass heading={heading} />

        {/* 안내 */}
        <div className="absolute bottom-2 left-2 right-2 bg-black/50 text-white text-[9px] px-2 py-1 rounded text-center">
          지도 클릭 → 로드뷰 이동 | 경로가 점으로 오버레이됩니다
        </div>
      </div>
    </div>
  );
}

function Compass({ heading }: { heading: number }) {
  return (
    <div className="absolute top-2 left-2 z-10">
      <div
        className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
        style={{ transform: `rotate(${-heading}deg)` }}
      >
        <svg width="36" height="36" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <text x="18" y="7" textAnchor="middle" fill="#EF4444" fontSize="8" fontWeight="bold">N</text>
          <text x="18" y="33" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="6">S</text>
          <text x="31" y="20" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="6">E</text>
          <text x="5" y="20" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="6">W</text>
          <polygon points="18,8 16,18 20,18" fill="#EF4444" />
          <polygon points="18,28 16,18 20,18" fill="rgba(255,255,255,0.4)" />
          <circle cx="18" cy="18" r="1.5" fill="white" />
        </svg>
      </div>
      <div className="text-center mt-0.5">
        <span className="text-[8px] text-white bg-black/40 px-1 py-0.5 rounded">{Math.round(heading)}°</span>
      </div>
    </div>
  );
}
