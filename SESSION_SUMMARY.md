# Route Builder - 세션 요약

## 프로젝트 개요
로봇 배달 경로를 자동 생성하는 웹 서비스. 지정한 구역의 인도/이면도로/건널목 경로를 자동으로 그려주는 도구.

## 현재 완성된 기능
- 네이버 지도 (ncpKeyId 인증) + vworld fallback
- 네이버 로드뷰 (Panorama) 패널 + 나침반
- 주소 검색 (vworld Geocoding)
- 서비스 면적 Polygon 그리기
- OSM 도로 데이터 수집 (Overpass API, 타일 분할)
- 수동 경로 그리기 (인도/건널목/이면도로)
- 경로 시각화 (색상별 레이어, 토글)
- 편집 (웨이 삭제, 노드 이동)
- XML 내보내기 (태그 포함/미포함 2종)

## AI 자동 인도 생성 (시도한 방법들)
1. Claude Vision 직접 좌표 생성 → 정확도 매우 낮음
2. 격자 분류 (Grid Classification) → 해상도 부족, 지그재그
3. 고정 offset (2.5m) → 차도 위에 경로 생성
4. 동적 offset (도로 유형별) → 중복 way, 여전히 부정확
5. 횡단면 분석 (pixel 거리 측정) → 중복 way 문제
→ 결론: offset 방식은 구조적 한계. CV segmentation 모델 필요 (2-3개월)

## 다음 세션 할 일
1. 수동 그리기 도구 테스트/개선 (로드뷰 보면서 인도 그리기)
2. 국토교통부 노드링크 데이터 연동 (이면도로/건널목 정확도 향상)
3. CV segmentation 모델 구축 계획 수립

## 기술 스택
React + TypeScript + Vite + Tailwind CSS + Leaflet + Naver Maps API

## API 키 (.env)
- VITE_NAVER_MAP_CLIENT_ID, VITE_NAVER_MAP_CLIENT_SECRET
- VITE_VWORLD_API_KEY
- VITE_ANTHROPIC_API_KEY
- VITE_MAP_ENGINE=naver

## 핵심 발견
- 네이버 Maps API: ncpClientId → ncpKeyId 파라미터명 변경 (2025 업그레이드)
