/**
 * 격자 분류 결과 → 경로 변환 + OSM 스무딩
 *
 * [알고리즘]
 * 1. 인도(S) 셀을 찾아 연결된 그룹(connected component)으로 묶음
 * 2. 각 그룹에서 경로를 추출 (셀 중심을 연결)
 * 3. 인접한 OSM 도로를 찾아 경로를 도로와 평행하게 스무딩
 * 4. 건널목(C) 셀도 별도로 처리
 *
 * [핵심] 격자 셀의 중심 좌표는 정확한 lat/lng → 인도 위치 정밀도 향상
 */
import type { OsmNode, OsmWay, OsmTag } from '@/types/osm';
import type { GridClassification, CellType } from './aiPathDetection';
import type { GridMetadata } from './satelliteCapture';
import type { MainRoadGeometry } from './pathGenerator';
import { distanceMeters } from './geometry';

/** 격자→경로 변환 결과 */
export interface GridPathResult {
  nodes: OsmNode[];
  ways: OsmWay[];
  stats: {
    sidewalkWays: number;
    crosswalkWays: number;
  };
}

// ============================================
// Connected Component (연결 그룹) 탐색
// ============================================

/** 격자에서 특정 셀 타입의 연결된 그룹 찾기 (BFS) */
function findConnectedGroups(
  grid: CellType[][],
  targetType: CellType
): number[][][] {
  const rows = grid.length;
  const cols = grid[0].length;
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const groups: number[][][] = [];

  // 4방향 탐색 (상하좌우)
  const dx = [0, 0, -1, 1];
  const dy = [-1, 1, 0, 0];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== targetType || visited[r][c]) continue;

      // BFS로 연결된 셀 찾기
      const group: number[][] = [];
      const queue: number[][] = [[r, c]];
      visited[r][c] = true;

      while (queue.length > 0) {
        const [cr, cc] = queue.shift()!;
        group.push([cr, cc]);

        for (let d = 0; d < 4; d++) {
          const nr = cr + dy[d];
          const nc = cc + dx[d];
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols
            && !visited[nr][nc] && grid[nr][nc] === targetType) {
            visited[nr][nc] = true;
            queue.push([nr, nc]);
          }
        }
      }

      if (group.length >= 2) { // 최소 2셀 이상이어야 경로로 인정
        groups.push(group);
      }
    }
  }

  return groups;
}

// ============================================
// 셀 그룹 → 정렬된 경로로 변환
// ============================================

/**
 * 연결된 셀 그룹을 순서대로 정렬하여 경로로 변환
 * Greedy nearest neighbor 방식: 시작점에서 가장 가까운 다음 점을 선택
 */
function orderGroupIntoPath(
  group: number[][],
  gridMeta: GridMetadata
): { lat: number; lon: number }[] {
  if (group.length === 0) return [];

  const gridCols = gridMeta.cols;
  const getCellCoord = (r: number, c: number) => {
    const cell = gridMeta.cells[r * gridCols + c];
    return cell ? { lat: cell.centerLat, lon: cell.centerLon } : null;
  };

  // 시작점: 그룹의 가장 왼쪽 상단 셀
  const sorted = [...group].sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);

  const path: { lat: number; lon: number }[] = [];
  const used = new Set<string>();

  let current = sorted[0];
  used.add(`${current[0]}_${current[1]}`);
  const coord = getCellCoord(current[0], current[1]);
  if (coord) path.push(coord);

  // Greedy nearest neighbor
  while (used.size < group.length) {
    let bestDist = Infinity;
    let bestIdx = -1;

    for (let i = 0; i < group.length; i++) {
      const key = `${group[i][0]}_${group[i][1]}`;
      if (used.has(key)) continue;

      const dist = Math.abs(group[i][0] - current[0]) + Math.abs(group[i][1] - current[1]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;

    current = group[bestIdx];
    used.add(`${current[0]}_${current[1]}`);
    const c = getCellCoord(current[0], current[1]);
    if (c) path.push(c);
  }

  return path;
}

// ============================================
// OSM 도로 기반 스무딩
// ============================================

/**
 * 인도 경로를 인접 OSM 도로 방향으로 스무딩
 *
 * [원리]
 * 1. 인도 경로의 각 점에서 가장 가까운 OSM 도로 segment를 찾음
 * 2. 인도 점을 도로 segment에 수선의 발을 내린 후,
 *    그 수선 방향으로 원래 거리만큼 이동 (도로와 평행 유지)
 * 3. 결과: 인도가 도로와 평행하게 스무딩됨
 */
function smoothWithOsmRoads(
  path: { lat: number; lon: number }[],
  mainRoads: MainRoadGeometry[],
  maxSnapDistance = 25 // 25m 이내의 도로만 스냅
): { lat: number; lon: number }[] {
  if (path.length < 2 || mainRoads.length === 0) return path;

  // 모든 도로 segment를 플랫하게 펼침
  const segments: { a: { lat: number; lon: number }; b: { lat: number; lon: number } }[] = [];
  for (const road of mainRoads) {
    for (let i = 0; i < road.coords.length - 1; i++) {
      segments.push({ a: road.coords[i], b: road.coords[i + 1] });
    }
  }

  if (segments.length === 0) return path;

  return path.map(point => {
    // 가장 가까운 도로 segment 찾기
    let minDist = Infinity;
    let nearestFoot: { lat: number; lon: number } | null = null;

    for (const seg of segments) {
      const foot = perpendicularFoot(point, seg.a, seg.b);
      const dist = distanceMeters(point, foot);
      if (dist < minDist) {
        minDist = dist;
        nearestFoot = foot;
      }
    }

    // 도로가 너무 멀면 스냅하지 않음
    if (minDist > maxSnapDistance || !nearestFoot) return point;

    // 도로에서 인도까지의 방향 벡터 유지, 도로 segment 방향으로 정렬
    // (점을 도로 위로 투영하지 않고, 도로와의 수직 거리만 유지)
    return point; // MVP에서는 스냅 없이 격자 중심 좌표 그대로 사용
    // TODO: Phase 2에서 스무딩 알고리즘 고도화
  });
}

/** 점 P에서 선분 AB 위로 수선의 발 */
function perpendicularFoot(
  p: { lat: number; lon: number },
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): { lat: number; lon: number } {
  const dx = b.lon - a.lon;
  const dy = b.lat - a.lat;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-12) return a;

  let t = ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t)); // clamp to [0, 1]

  return {
    lat: a.lat + t * dy,
    lon: a.lon + t * dx,
  };
}

// ============================================
// 메인 변환 함수
// ============================================

/**
 * 격자 분류 결과를 OsmNode/OsmWay로 변환
 *
 * @param classification AI 격자 분류 결과
 * @param gridMeta 격자 메타데이터 (각 셀의 좌표)
 * @param mainRoads OSM 차도 데이터 (스무딩용)
 * @param startNodeId 시작 노드 ID (기존 노드와 충돌 방지)
 * @param startWayId 시작 웨이 ID
 */
export function convertGridToPath(
  classification: GridClassification,
  gridMeta: GridMetadata,
  mainRoads: MainRoadGeometry[],
  startNodeId = -200000,
  startWayId = -200000,
): GridPathResult {
  let nodeId = startNodeId;
  let wayId = startWayId;
  const nodes: OsmNode[] = [];
  const ways: OsmWay[] = [];
  let sidewalkWays = 0;
  let crosswalkWays = 0;

  // === 인도(S) 경로 생성 ===
  const sidewalkGroups = findConnectedGroups(classification.cells, 'S');
  console.log(`🚶 인도 그룹 ${sidewalkGroups.length}개 발견`);

  for (const group of sidewalkGroups) {
    // 셀 그룹 → 정렬된 좌표 경로
    let path = orderGroupIntoPath(group, gridMeta);

    // OSM 도로로 스무딩
    path = smoothWithOsmRoads(path, mainRoads);

    if (path.length < 2) continue;

    // 노드 + 웨이 생성
    const nodeRefs: number[] = [];
    for (const coord of path) {
      const id = nodeId--;
      nodes.push({
        id,
        lat: coord.lat,
        lon: coord.lon,
        tags: [{ k: 'plat_node_id', v: String(Math.abs(id)) }],
      });
      nodeRefs.push(id);
    }

    const id = wayId--;
    ways.push({
      id,
      nodeRefs,
      tags: [
        { k: 'plat_way_id', v: String(Math.abs(id)) },
        { k: 'road_type', v: 'sidewalk' },
        { k: 'source', v: 'ai_grid' },
      ],
    });
    sidewalkWays++;
  }

  // === 건널목(C) 경로 생성 ===
  const crosswalkGroups = findConnectedGroups(classification.cells, 'C');
  console.log(`🚦 건널목 그룹 ${crosswalkGroups.length}개 발견`);

  for (const group of crosswalkGroups) {
    const path = orderGroupIntoPath(group, gridMeta);
    if (path.length < 2) continue;

    const nodeRefs: number[] = [];
    for (const coord of path) {
      const id = nodeId--;
      nodes.push({
        id,
        lat: coord.lat,
        lon: coord.lon,
        tags: [{ k: 'plat_node_id', v: String(Math.abs(id)) }],
      });
      nodeRefs.push(id);
    }

    const id = wayId--;
    ways.push({
      id,
      nodeRefs,
      tags: [
        { k: 'plat_way_id', v: String(Math.abs(id)) },
        { k: 'road_type', v: 'crosswalk' },
        { k: 'source', v: 'ai_grid' },
      ],
    });
    crosswalkWays++;
  }

  return {
    nodes,
    ways,
    stats: { sidewalkWays, crosswalkWays },
  };
}
