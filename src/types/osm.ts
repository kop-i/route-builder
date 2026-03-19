/**
 * OSM (OpenStreetMap) 데이터 타입 정의
 * - 역삼 .xml 샘플 분석 결과를 기반으로 설계
 * - 향후 관계형 DB 마이그레이션을 고려하여 정규화된 구조 사용
 */

// ============================================
// 기본 좌표 타입
// ============================================

/** 위도/경도 좌표 */
export interface LatLng {
  lat: number;
  lng: number;
}

/** 좌표 + 고도(경사도 계산용) */
export interface LatLngAlt extends LatLng {
  alt?: number; // 해발 고도 (미터)
}

// ============================================
// OSM 핵심 요소: Node, Way, Relation
// ============================================

/** OSM 태그 (key-value 쌍) */
export interface OsmTag {
  k: string;
  v: string;
}

/**
 * OSM 노드 - 경로의 기본 단위 (점)
 * 예: 인도 위의 한 지점, 건널목의 시작/끝점
 */
export interface OsmNode {
  id: number;             // 음수 = 로컬 생성, 양수 = OSM 서버
  lat: number;            // 위도 (WGS84)
  lon: number;            // 경도 (WGS84)
  tags: OsmTag[];         // 메타데이터 (plat_node_id, road_type 등)
}

/**
 * OSM 웨이 - 노드를 연결한 경로 (선)
 * 예: 인도 구간, 이면도로, 건널목
 */
export interface OsmWay {
  id: number;             // 웨이 고유 ID
  nodeRefs: number[];     // 연결된 노드 ID 목록 (순서 중요)
  tags: OsmTag[];         // 메타데이터 (road_type, class 등)
}

/**
 * OSM 릴레이션 멤버
 * 예: 건물의 엘리베이터 라인 구성 요소
 */
export interface OsmRelationMember {
  type: 'node' | 'way' | 'relation';
  ref: number;
  role: string;
}

/**
 * OSM 릴레이션 - 노드/웨이를 묶은 그룹
 * 예: 건물(building), 엘리베이터 라인(elevator_line)
 */
export interface OsmRelation {
  id: number;
  members: OsmRelationMember[];
  tags: OsmTag[];
}

// ============================================
// 경로 도메인 타입 (UI/비즈니스 로직용)
// ============================================

/**
 * 도로 유형 - 로봇이 주행하는 경로 분류
 *
 * [이면도로 vs 차도 구분 기준]
 * - 이면도로(sideroad): 중앙분리선 없음. 주택가 골목, 생활도로 등
 * - 차도(road): 중앙분리선 있음. 2차선 이상 도로
 */
export type RoadType =
  | 'sidewalk'        // 인도 (기본값)
  | 'crosswalk'       // 건널목
  | 'sideroad'        // 이면도로 (중앙분리선 없음)
  | 'road'            // 차도 (중앙분리선 있음)
  | 'drive_on_middle'; // 도로 중앙 주행

/** 주행 규칙 */
export type DrivingRule =
  | 'drive_on_right'  // 우측 통행
  | 'drive_on_middle'; // 중앙 통행

/** 경로 경고 유형 (Phase 2) */
export type WarningType =
  | 'narrow_road'     // 도로 폭 2m 미만
  | 'steep_slope'     // 경사도 15° 초과
  | 'unverified';     // 미확인 구간

/** 경고 정보가 포함된 웨이 (UI 표시용) */
export interface WayWithWarning extends OsmWay {
  warnings: WarningType[];
  roadType: RoadType;
  width?: number;       // 도로 폭 (미터)
  slope?: number;       // 경사도 (도)
}

// ============================================
// 프로젝트/서비스 면적 타입
// ============================================

/** 서비스 면적 - 사용자가 지도에 그린 polygon */
export interface ServiceArea {
  id: string;
  name: string;
  polygon: LatLng[];     // 다각형 꼭짓점 좌표 목록
  createdAt: string;     // ISO 8601
  updatedAt: string;
}

/** 경로 프로젝트 - 하나의 작업 단위 */
export interface RouteProject {
  id: string;
  name: string;
  serviceArea: ServiceArea;
  nodes: OsmNode[];
  ways: OsmWay[];
  relations: OsmRelation[];
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Overpass API 응답 타입
// ============================================

/** Overpass API 응답의 element 타입 */
export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: OsmRelationMember[];
  tags?: Record<string, string>;
}

/** Overpass API 전체 응답 */
export interface OverpassResponse {
  version: number;
  generator: string;
  elements: OverpassElement[];
}

// ============================================
// XML 내보내기 옵션
// ============================================

/** XML 내보내기 설정 */
export interface XmlExportOptions {
  includeTags: boolean;   // true = 태그 포함, false = 좌표만
  filename?: string;      // 파일명 (기본: route_export.xml)
}
