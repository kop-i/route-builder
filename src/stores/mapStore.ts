/**
 * 지도 상태 관리 스토어
 * - 지도 엔진 (naver / leaflet) 자동 감지
 * - Leaflet 인스턴스를 통합 관리 (Naver 전환 시에도 동일 인터페이스)
 */
import { create } from 'zustand';
import type { LatLng } from '@/types/osm';
import type L from 'leaflet';

/** 사용 중인 지도 엔진 */
export type MapEngine = 'naver' | 'leaflet' | 'none';

interface MapState {
  // === 상태 ===
  engine: MapEngine;                    // 현재 사용 중인 지도 엔진
  naverMap: naver.maps.Map | null;      // 네이버 지도 인스턴스
  leafletMap: L.Map | null;             // Leaflet 지도 인스턴스
  center: LatLng;                       // 지도 중심 좌표
  zoom: number;                         // 줌 레벨
  isMapReady: boolean;                  // 지도 로드 완료 여부

  // === 액션 ===
  setEngine: (engine: MapEngine) => void;
  setNaverMap: (map: naver.maps.Map) => void;
  setLeafletMap: (map: L.Map) => void;
  setCenter: (center: LatLng) => void;
  setZoom: (zoom: number) => void;
  setMapReady: (ready: boolean) => void;
}

export const useMapStore = create<MapState>((set) => ({
  // 초기 상태: 역삼역 부근
  engine: 'none',
  naverMap: null,
  leafletMap: null,
  center: { lat: 37.4967, lng: 127.0325 },
  zoom: 17,
  isMapReady: false,

  setEngine: (engine) => set({ engine }),
  setNaverMap: (map) => set({ naverMap: map, engine: 'naver' }),
  setLeafletMap: (map) => set({ leafletMap: map, engine: 'leaflet' }),
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setMapReady: (ready) => set({ isMapReady: ready }),
}));
