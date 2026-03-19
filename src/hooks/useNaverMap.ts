/**
 * 네이버 지도 초기화 Hook
 * - 네이버 Maps API 스크립트를 동적으로 로드
 * - 지도 인스턴스를 생성하고 mapStore에 등록
 *
 * [핵심] React 18 StrictMode 대응:
 * StrictMode는 개발 모드에서 useEffect를 mount → unmount → mount로 두 번 실행한다.
 * 네이버 지도는 destroy() 후 같은 DOM에 다시 생성하면 문제가 생기므로,
 * cleanup에서 destroy하지 않고 인스턴스를 재사용하는 전략을 사용한다.
 */
import { useEffect, useRef } from 'react';
import { useMapStore } from '@/stores/mapStore';

const NAVER_MAP_CLIENT_ID = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;

/** 스크립트 로드 상태를 모듈 레벨에서 관리 (중복 로드 방지) */
let scriptLoadPromise: Promise<void> | null = null;

/**
 * 네이버 Maps API 스크립트를 <head>에 삽입
 * 이미 로드되었으면 즉시 resolve, 로딩 중이면 같은 Promise를 반환
 */
function loadNaverMapScript(): Promise<void> {
  // 이미 로드 완료
  if (window.naver && window.naver.maps) {
    return Promise.resolve();
  }

  // 이미 로딩 중이면 같은 Promise 반환 (중복 스크립트 삽입 방지)
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    // submodules는 Phase 2에서 추가 (drawing: 면적 그리기, panorama: 로드뷰)
    // MVP에서는 기본 지도만 로드하여 인증 문제 방지
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${NAVER_MAP_CLIENT_ID}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null; // 실패 시 재시도 가능하도록
      reject(new Error('네이버 지도 API 로드 실패. Client ID를 확인하세요.'));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

/**
 * 네이버 지도 Hook
 * @param containerRef - 지도를 렌더링할 DOM 요소의 ref
 */
export function useNaverMap(containerRef: React.RefObject<HTMLDivElement | null>) {
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const setMapInstance = useMapStore((s) => s.setMapInstance);
  const setMapReady = useMapStore((s) => s.setMapReady);

  // 지도 인스턴스를 ref로 관리 (StrictMode 재실행 시에도 유지)
  const mapRef = useRef<naver.maps.Map | null>(null);
  // cleanup에서 실제로 파괴할지 결정하는 플래그
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    async function init() {
      if (!containerRef.current) return;

      try {
        await loadNaverMapScript();

        // StrictMode 두 번째 mount: 이미 인스턴스가 있으면 재사용
        if (mapRef.current) {
          if (!cancelled) {
            setMapInstance(mapRef.current);
            setMapReady(true);
          }
          return;
        }

        // 지도 인스턴스 생성
        const map = new naver.maps.Map(containerRef.current, {
          center: new naver.maps.LatLng(center.lat, center.lng),
          zoom,
          zoomControl: true,
          zoomControlOptions: {
            position: naver.maps.Position.TOP_RIGHT,
          },
          mapTypeId: naver.maps.MapTypeId.NORMAL,
          scaleControl: true,
          mapDataControl: false,
          logoControlOptions: {
            position: naver.maps.Position.BOTTOM_LEFT,
          },
        });

        mapRef.current = map;

        if (!cancelled) {
          setMapInstance(map);
          setMapReady(true);
          console.log('✅ 네이버 지도 초기화 완료');
        }
      } catch (error) {
        console.error('❌ 네이버 지도 초기화 실패:', error);
      }
    }

    init();

    // StrictMode cleanup: destroy하지 않고 인스턴스 유지
    // 실제 언마운트(페이지 이탈 등)에서만 destroy
    return () => {
      cancelled = true;
      isMountedRef.current = false;

      // 약간의 딜레이 후 여전히 unmounted 상태면 진짜 파괴
      // (StrictMode의 즉시 re-mount가 아닌 실제 언마운트인 경우)
      setTimeout(() => {
        if (!isMountedRef.current && mapRef.current) {
          mapRef.current.destroy();
          mapRef.current = null;
          setMapReady(false);
          console.log('🗑️ 네이버 지도 인스턴스 파괴');
        }
      }, 100);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return mapRef;
}
