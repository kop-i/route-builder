/**
 * MapTypeSelector - 지도 유형 전환 (일반/위성/하이브리드)
 * 네이버 지도 우측 상단에 표시
 */
import { useState } from 'react';
import { useMapStore } from '@/stores/mapStore';

const MAP_TYPES = [
  { id: 'NORMAL', label: '일반', icon: '🗺️' },
  { id: 'SATELLITE', label: '위성', icon: '🛰️' },
  { id: 'HYBRID', label: '하이브리드', icon: '🌐' },
] as const;

export default function MapTypeSelector() {
  const naverMap = useMapStore((s) => s.naverMap);
  const engine = useMapStore((s) => s.engine);
  const isMapReady = useMapStore((s) => s.isMapReady);
  const [currentType, setCurrentType] = useState('NORMAL');

  if (!isMapReady || engine !== 'naver' || !naverMap) return null;

  const handleChange = (typeId: string) => {
    setCurrentType(typeId);
    const mapTypeId = (naver.maps.MapTypeId as Record<string, string>)[typeId];
    if (mapTypeId) {
      naverMap.setMapTypeId(mapTypeId);
    }
  };

  return (
    <div className="absolute top-14 right-14 z-[1000]">
      <div className="bg-white rounded-lg shadow-lg flex overflow-hidden text-xs">
        {MAP_TYPES.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => handleChange(id)}
            className={`px-3 py-2 transition-colors ${
              currentType === id
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>
    </div>
  );
}
