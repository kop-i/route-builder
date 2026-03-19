/**
 * NaverMap 컴포넌트
 * - 네이버 지도를 렌더링하는 메인 컴포넌트
 * - 전체 화면을 차지하며, 위에 패널/도구가 오버레이됨
 */
import { useRef } from 'react';
import { useNaverMap } from '@/hooks/useNaverMap';
import { useMapStore } from '@/stores/mapStore';

export default function NaverMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isMapReady = useMapStore((s) => s.isMapReady);

  // 지도 초기화 (Hook이 모든 걸 처리)
  useNaverMap(containerRef);

  return (
    <div className="relative w-full h-full">
      {/* 지도 컨테이너 */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ minHeight: '100vh' }}
      />

      {/* 로딩 표시 */}
      {!isMapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-600 text-sm">지도를 불러오는 중...</p>
          </div>
        </div>
      )}
    </div>
  );
}
