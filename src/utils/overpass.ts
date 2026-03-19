/**
 * Overpass API 유틸리티
 * - OSM 도로 데이터를 가져오는 API 호출 함수
 *
 * [타일 분할 전략]
 * 넓은 면적을 한 번에 요청하면 504 Timeout이 발생하므로,
 * polygon의 bounding box를 작은 타일(약 500m x 500m)로 분할하여
 * 병렬로 요청한 뒤 결과를 병합한다.
 */
import type { LatLng, OverpassResponse, OverpassElement } from '@/types/osm';

const OVERPASS_URL = import.meta.env.VITE_OVERPASS_API_URL
  || 'https://overpass-api.de/api/interpreter';

// 타일 크기: 약 500m (위도 0.005도 ≈ 약 550m)
const TILE_SIZE_DEG = 0.005;

// 동시 요청 수 제한 (Overpass 서버 부하 방지)
const MAX_CONCURRENT = 3;

// ============================================
// 타일 분할 유틸
// ============================================

/** bounding box 타입 */
interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** polygon의 bounding box 계산 */
function polygonToBBox(polygon: LatLng[]): BBox {
  const lats = polygon.map((p) => p.lat);
  const lngs = polygon.map((p) => p.lng);
  return {
    south: Math.min(...lats),
    west: Math.min(...lngs),
    north: Math.max(...lats),
    east: Math.max(...lngs),
  };
}

/** bounding box를 타일로 분할 */
function splitBBoxToTiles(bbox: BBox): BBox[] {
  const tiles: BBox[] = [];
  for (let lat = bbox.south; lat < bbox.north; lat += TILE_SIZE_DEG) {
    for (let lng = bbox.west; lng < bbox.east; lng += TILE_SIZE_DEG) {
      tiles.push({
        south: lat,
        west: lng,
        north: Math.min(lat + TILE_SIZE_DEG, bbox.north),
        east: Math.min(lng + TILE_SIZE_DEG, bbox.east),
      });
    }
  }
  return tiles;
}

/**
 * 동시 실행 수 제한 유틸
 * 최대 N개의 Promise를 동시에 실행하고 결과를 반환
 */
async function parallelLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onProgress?: (done: number, total: number) => void
): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;
  let done = 0;

  async function next(): Promise<void> {
    const currentIdx = idx++;
    if (currentIdx >= tasks.length) return;

    results[currentIdx] = await tasks[currentIdx]();
    done++;
    onProgress?.(done, tasks.length);

    await next();
  }

  // limit 개수만큼 동시 실행 시작
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
  return results;
}

// ============================================
// Overpass 쿼리
// ============================================

/** 하나의 bbox에 대한 Overpass 쿼리 실행 */
async function fetchTile(bbox: BBox): Promise<OverpassResponse> {
  const { south, west, north, east } = bbox;

  const query = `
    [out:json][timeout:30][bbox:${south},${west},${north},${east}];
    (
      way["highway"="footway"];
      way["highway"="pedestrian"];
      way["highway"="path"];
      way["highway"="cycleway"];
      way["footway"="crossing"];
      way["highway"="residential"];
      way["highway"="living_street"];
      way["highway"="service"];
      way["highway"="unclassified"];
      way["highway"="tertiary"];
      way["highway"="secondary"];
      way["highway"="primary"];
    );
    out body;
    >;
    out skel qt;
  `;

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    // 개별 타일 실패 시 빈 결과 반환 (전체를 실패시키지 않음)
    console.warn(`⚠️ 타일 실패 (${south.toFixed(4)},${west.toFixed(4)}): ${response.status}`);
    return { version: 0.6, generator: 'Overpass', elements: [] };
  }

  return response.json();
}

/** 여러 Overpass 응답을 하나로 병합 (중복 element 제거) */
function mergeResponses(responses: OverpassResponse[]): OverpassResponse {
  const seen = new Set<string>();
  const merged: OverpassElement[] = [];

  for (const res of responses) {
    for (const el of res.elements) {
      // type + id 조합으로 중복 제거
      const key = `${el.type}_${el.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(el);
      }
    }
  }

  return {
    version: 0.6,
    generator: 'Overpass (tiled)',
    elements: merged,
  };
}

// ============================================
// 공개 API
// ============================================

/**
 * 서비스 면적 내 도로 데이터를 타일 분할 방식으로 가져오기
 *
 * @param polygon - 서비스 면적의 꼭짓점 좌표
 * @param onProgress - 진행 콜백 (done, total)
 * @returns 병합된 Overpass 응답
 */
export async function fetchRoadsInArea(
  polygon: LatLng[],
  onProgress?: (done: number, total: number) => void
): Promise<OverpassResponse> {
  // 1. polygon → bounding box → 타일 분할
  const bbox = polygonToBBox(polygon);
  const tiles = splitBBoxToTiles(bbox);

  console.log(`📦 면적을 ${tiles.length}개 타일로 분할 (각 ~${(TILE_SIZE_DEG * 111000).toFixed(0)}m)`);

  // 2. 타일별 병렬 요청 (동시 최대 3개)
  const tasks = tiles.map((tile) => () => fetchTile(tile));
  const responses = await parallelLimit(tasks, MAX_CONCURRENT, onProgress);

  // 3. 결과 병합 (중복 제거)
  const merged = mergeResponses(responses);
  console.log(`✅ 병합 완료: ${merged.elements.length}개 요소 (${tiles.length}개 타일)`);

  return merged;
}

/**
 * 특정 bounding box 내 건널목만 가져오기
 */
export async function fetchCrosswalksInBbox(
  south: number,
  west: number,
  north: number,
  east: number
): Promise<OverpassResponse> {
  const query = `
    [out:json][timeout:30];
    (
      node["highway"="crossing"](${south},${west},${north},${east});
      way["footway"="crossing"](${south},${west},${north},${east});
    );
    out body;
    >;
    out skel qt;
  `;

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API 오류: ${response.status}`);
  }

  return response.json();
}
