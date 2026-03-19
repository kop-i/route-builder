/**
 * SearchPanel - 주소 검색 패널
 *
 * [기능]
 * - vworld Geocoding API를 사용한 주소 검색
 * - 검색 결과 선택 시 지도 이동
 * - 지도 우측 상단에 위치 (레이어 컨트롤 아래)
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
  const isMapReady = useMapStore((s) => s.isMapReady);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);

    try {
      // vworld Geocoding API
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
    } catch (error) {
      console.error('검색 오류:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handleSelect = useCallback((result: SearchResult) => {
    if (!leafletMap) return;

    const lat = parseFloat(result.point.y);
    const lng = parseFloat(result.point.x);
    leafletMap.setView([lat, lng], 17);
    setResults([]);
    setQuery(result.title.replace(/<[^>]*>/g, '')); // HTML 태그 제거
  }, [leafletMap]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  if (!isMapReady) return null;

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1000] w-80">
      {/* 검색 입력 */}
      <div className="bg-white rounded-lg shadow-lg flex overflow-hidden">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="주소 또는 장소 검색..."
          className="flex-1 px-4 py-2.5 text-sm text-gray-800 outline-none"
        />
        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="px-4 bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
        >
          {isSearching ? '...' : '검색'}
        </button>
      </div>

      {/* 검색 결과 */}
      {results.length > 0 && (
        <div className="mt-1 bg-white rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {results.map((result, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(result)}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 border-b border-gray-100 last:border-0"
              dangerouslySetInnerHTML={{
                __html: result.title,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
