/**
 * SearchPanel - 주소/장소 검색 (자동완성 + 네이버 Geocoder + Nominatim)
 *
 * 1. 입력 시 자동완성 (Nominatim, 300ms 디바운스)
 * 2. "강남역", "역삼동" 같은 장소명도 검색 가능
 * 3. 결과 클릭 → 지도 이동
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useMapStore } from '@/stores/mapStore';

interface SearchResult {
  title: string;
  lat: number;
  lng: number;
  type: string; // 'address' | 'place'
}

export default function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const naverMap = useMapStore((s) => s.naverMap);
  const engine = useMapStore((s) => s.engine);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // === 자동완성 (입력할 때마다 300ms 디바운스) ===
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchNominatim(query);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // === Nominatim 검색 (장소명 + 주소 모두 지원, CORS OK) ===
  const searchNominatim = useCallback(async (q: string) => {
    setIsSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=kr&limit=6&accept-language=ko`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RouteBuilder/1.0' },
      });
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        setResults(data.map((item: { display_name: string; lat: string; lon: string; type: string }) => ({
          title: item.display_name.split(',').slice(0, 3).join(', '), // 짧게 표시
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          type: item.type,
        })));
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // === 엔터 키 검색 (네이버 Geocoder 우선 → Nominatim fallback) ===
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);

    // 먼저 네이버 Geocoder 시도
    if (engine === 'naver' && window.naver?.maps?.Service) {
      naver.maps.Service.geocode({ query }, (status: string, response: unknown) => {
        const res = response as {
          v2?: { addresses?: Array<{ roadAddress: string; jibunAddress: string; x: string; y: string }> };
        };

        if (status === naver.maps.Service.Status.OK && res.v2?.addresses?.length) {
          setResults(res.v2.addresses.map(addr => ({
            title: addr.roadAddress || addr.jibunAddress,
            lat: parseFloat(addr.y),
            lng: parseFloat(addr.x),
            type: 'address',
          })));
          setIsSearching(false);
        } else {
          // 네이버 실패 → Nominatim fallback
          searchNominatim(query);
        }
      });
    } else {
      searchNominatim(query);
    }
  }, [query, engine, searchNominatim]);

  // === 결과 선택 → 지도 이동 ===
  const handleSelect = useCallback((result: SearchResult) => {
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
          placeholder="장소 또는 주소 검색..."
          className="w-52 px-3 py-1.5 text-xs text-gray-800 outline-none"
        />
        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="px-3 bg-blue-500 text-white text-xs hover:bg-blue-600 transition-colors"
        >
          {isSearching ? '...' : '검색'}
        </button>
      </div>

      {/* 자동완성 결과 리스트 */}
      {results.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto z-[1100]">
          {results.map((result, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(result)}
              className="w-full text-left px-3 py-2.5 text-xs text-gray-700 hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-start gap-2"
            >
              <span className="text-gray-400 mt-0.5">
                {result.type === 'address' ? '📍' : '🏢'}
              </span>
              <span className="flex-1 leading-relaxed">{result.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
