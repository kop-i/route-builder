/**
 * MapTypeSelector - 지도 유형 전환 (인라인, 상단바에 포함)
 */
import { useState } from 'react';
import { useMapStore } from '@/stores/mapStore';

const MAP_TYPES = [
  { id: 'NORMAL', label: '일반' },
  { id: 'SATELLITE', label: '위성' },
  { id: 'HYBRID', label: '혼합' },
] as const;

export default function MapTypeSelector() {
  const naverMap = useMapStore((s) => s.naverMap);
  const engine = useMapStore((s) => s.engine);
  const [currentType, setCurrentType] = useState('NORMAL');

  if (engine !== 'naver' || !naverMap) return null;

  const handleChange = (typeId: string) => {
    setCurrentType(typeId);
    const mapTypeId = (naver.maps.MapTypeId as Record<string, string>)[typeId];
    if (mapTypeId) naverMap.setMapTypeId(mapTypeId);
  };

  return (
    <div className="bg-white rounded-lg shadow-md flex overflow-hidden text-xs">
      {MAP_TYPES.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => handleChange(id)}
          className={`px-2.5 py-1.5 transition-colors ${
            currentType === id ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
