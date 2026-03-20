/**
 * SearchPanel - 주소 검색 (네이버 Geocoder 사용)
 *
 * vworld API는 CORS 차단됨 → 네이버 Maps API 내장 geocoder 사용
 * naver.maps.Service.geocode()로 주소 검색
 */
import { useState, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';

interface SearchResult {
  title: string;
  lat: number;
  lng: number;
}

export default function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const naverMap = useMapStore((s) => s.naverMap);
  const engine = useMapStore((s) => s.engine);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);

    try {
      if (engine === 'naver' && window.naver?.maps?.Service) {
        // 네이버 Geocoder 사용
        naver.maps.Service.geocode({ query }, (status: string, response: unknown) => {
          setIsSearching(false);
          const res = response as {
            v2?: {
              addresses?: Array<{
                roadAddress: string;
                jibunAddress: string;
                x: string;
                y: string;
              }>;
            };
          };

          if (status !== naver.maps.Service.Status.OK || !res.v2?.addresses?.length) {
            // Geocode 실패 시 검색 API 시도
            searchWithPlaces(query);
            return;
          }

          setResults(res.v2.addresses.map(addr => ({
            title: addr.roadAddress || addr.jibunAddress,
            lat: parseFloat(addr.y),
            lng: parseFloat(addr.x),
          })));
        });
      } else {
        setIsSearching(false);
      }
    } catch {
      setIsSearching(false);
      setResults([]);
    }
  }, [query, engine]);

  // 장소명 검색 (주소가 아닌 경우)
  const searchWithPlaces = useCallback((q: string) => {
    if (!window.naver?.maps?.Service) return;

    // TransCoord를 이용한 장소 검색은 지원 안 됨
    // 대신 현재 지도 중심 근처에서 검색 결과를 제공
    // 네이버 Maps JS API에는 Place Search가 없으므로 주소 기반만 지원
    setResults([{
      title: `"${q}" — 주소를 정확히 입력해주세요 (예: 역삼동 123)`,
      lat: 0,
      lng: 0,
    }]);
  }, []);

  const handleSelect = useCallback((result: SearchResult) => {
    if (result.lat === 0 && result.lng === 0) {
      setResults([]);
      return;
    }

    if (engine === 'naver' && naverMap) {
      naverMap.setCenter(new naver.maps.LatLng(result.lat, result.lng));
      naverMap.setZoom(17);
    }

    setResults([]);
    setQuery(result.title);
  }, [naverMap, engine]);

  return (
    <div className="relative">
      <div className="bg-white rounded-lg shadow-md flex overflow-hidden">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="주소 검색..."
          className="w-48 px-3 py-1.5 text-xs text-gray-800 outline-none"
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
        <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto z-[1100]">
          {results.map((result, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(result)}
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 border-b border-gray-50 last:border-0"
            >
              📍 {result.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
