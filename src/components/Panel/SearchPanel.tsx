/**
 * SearchPanel - 주소 검색 (인라인, 상단바에 포함)
 */
import { useState, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';

const VWORLD_API_KEY = import.meta.env.VITE_VWORLD_API_KEY;

interface SearchResult {
  title: string;
  point: { x: string; y: string };
}

export default function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const leafletMap = useMapStore((s) => s.leafletMap);
  const naverMap = useMapStore((s) => s.naverMap);
  const engine = useMapStore((s) => s.engine);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const url = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=5&page=1&query=${encodeURIComponent(query)}&type=place&format=json&errorformat=json&key=${VWORLD_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.response?.status === 'OK' && data.response?.result?.items) {
        setResults(data.response.result.items.map((item: Record<string, unknown>) => ({
          title: item.title as string,
          point: item.point as { x: string; y: string },
        })));
      } else {
        setResults([]);
      }
    } catch { setResults([]); }
    finally { setIsSearching(false); }
  }, [query]);

  const handleSelect = useCallback((result: SearchResult) => {
    const lat = parseFloat(result.point.y);
    const lng = parseFloat(result.point.x);
    if (engine === 'naver' && naverMap) {
      naverMap.setCenter(new naver.maps.LatLng(lat, lng));
      naverMap.setZoom(17);
    } else if (leafletMap) {
      leafletMap.setView([lat, lng], 17);
    }
    setResults([]);
    setQuery(result.title.replace(/<[^>]*>/g, ''));
  }, [leafletMap, naverMap, engine]);

  return (
    <div className="relative">
      <div className="bg-white rounded-lg shadow-md flex overflow-hidden">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="주소 검색..."
          className="w-44 px-3 py-1.5 text-xs text-gray-800 outline-none"
        />
        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="px-3 bg-blue-500 text-white text-xs hover:bg-blue-600"
        >
          {isSearching ? '...' : '검색'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto z-[1001]">
          {results.map((result, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(result)}
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 border-b border-gray-50 last:border-0"
              dangerouslySetInnerHTML={{ __html: result.title }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
