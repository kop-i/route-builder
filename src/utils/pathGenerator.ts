/**
 * 경로 자동 생성 알고리즘 v3
 *
 * [하이브리드 전략]
 * 1. Overpass 응답에서 모든 도로를 분류
 * 2. 인도/건널목/이면도로 → 직접 경로로 변환
 * 3. 차도 → 도로 유형별 동적 offset으로 인도 경로 생성
 *    - primary(대로): offset 13m
 *    - secondary: offset 10m
 *    - tertiary: offset 7.5m
 *    - residential(2차선): offset 5.5m
 *    OSM의 lanes/width 태그가 있으면 더 정확한 계산
 */
import type {
  OsmNode,
  OsmWay,
  OsmTag,
  OverpassResponse,
  OverpassElement,
  RoadType,
} from '@/types/osm';
import { offsetPolyline } from './geometry';

// ============================================
// 차도의 좌표 + 메타데이터 (offset용)
// ============================================

export interface MainRoadGeometry {
  osmWayId: number;
  coords: { lat: number; lon: number }[];
  highway: string;
  lanes: number;      // OSM lanes 태그 (0이면 미지정)
  width: number;      // OSM width 태그 (0이면 미지정)
}

export interface HybridGenerationResult {
  nodes: OsmNode[];
  ways: OsmWay[];
  mainRoads: MainRoadGeometry[];
  stats: {
    totalNodes: number;
    totalWays: number;
    sidewalkWays: number;
    crosswalkWays: number;
    sideroadWays: number;
    mainRoadCount: number;
  };
}

// ============================================
// 도로 분류
// ============================================

function classifyRoadType(tags: Record<string, string>): RoadType | 'main_road' {
  const highway = tags.highway || '';
  const footway = tags.footway || '';
  const lanes = parseInt(tags.lanes || '0', 10);
  const maxspeed = parseInt(tags.maxspeed || '0', 10);

  if (highway === 'crossing' || footway === 'crossing') return 'crosswalk';
  if (['footway', 'pedestrian', 'path', 'steps', 'cycleway'].includes(highway)) return 'sidewalk';
  if (['primary', 'secondary', 'tertiary', 'trunk', 'motorway'].includes(highway)) return 'main_road';
  if (highway.endsWith('_link')) return 'main_road';

  if (['residential', 'living_street', 'service', 'unclassified'].includes(highway)) {
    if (lanes >= 2 || maxspeed >= 40) return 'main_road';
    return 'sideroad';
  }

  return 'sidewalk';
}

// ============================================
// 도로 유형별 동적 offset 거리 계산
// ============================================

/**
 * 차도 중심선에서 인도 중심까지의 offset 거리를 계산
 *
 * [한국 도로 설계 기준 기반]
 * offset = (도로 노면 폭 / 2) + (인도 폭 / 2)
 *
 * 도로 노면 폭 추정:
 * - 1차선 ≈ 3.25m (한국 표준)
 * - 중앙분리대 ≈ 1.5m
 * - 길어깨 ≈ 0.5m × 2
 *
 * 인도 폭 추정: 평균 2m → 중심까지 1m
 *
 * 우선순위:
 * 1. OSM width 태그가 있으면 그걸 사용
 * 2. OSM lanes 태그가 있으면 계산
 * 3. highway 타입 기반 기본값
 */
export function calculateSidewalkOffset(road: MainRoadGeometry): number {
  const SIDEWALK_CENTER = 1.5; // 인도 중심까지 거리 (도로 경계에서)

  // 1순위: OSM width 태그
  if (road.width > 0) {
    return (road.width / 2) + SIDEWALK_CENTER;
  }

  // 2순위: OSM lanes 태그 기반 계산
  if (road.lanes > 0) {
    const laneWidth = 3.25; // 한국 표준 차선 폭
    const median = road.lanes >= 4 ? 1.5 : 0; // 4차선 이상이면 중앙분리대
    const roadWidth = (road.lanes * laneWidth) + median;
    return (roadWidth / 2) + SIDEWALK_CENTER;
  }

  // 3순위: highway 타입 기본값
  const defaults: Record<string, number> = {
    'primary':    13.0,  // 왕복 6차선(~22m) + 인도: 22/2 + 1.5 ≈ 12.5 → 13
    'secondary':  10.0,  // 왕복 4차선(~16m) + 인도: 16/2 + 1.5 ≈ 9.5 → 10
    'tertiary':    7.5,  // 왕복 2~3차선(~11m) + 인도: 11/2 + 1.5 ≈ 7
    'trunk':      15.0,  // 간선도로
    'motorway':   18.0,  // 고속도로 (인도 없을 수 있음)
    'residential': 5.5,  // 주택가 2차선(~7m): 7/2 + 1.5 ≈ 5
  };

  // _link 도로는 원래 타입의 70%
  const baseType = road.highway.replace('_link', '');
  const baseOffset = defaults[baseType] || defaults[road.highway] || 6.0;

  return road.highway.endsWith('_link') ? baseOffset * 0.7 : baseOffset;
}

// ============================================
// Overpass → 하이브리드 결과 변환
// ============================================

export function generatePathsFromOverpass(
  overpassData: OverpassResponse
): HybridGenerationResult {
  const overpassNodeMap = new Map<number, { lat: number; lon: number }>();
  for (const el of overpassData.elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      overpassNodeMap.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  const nodeIdMap = new Map<number, number>();
  let localNodeId = -1;
  const nodes: OsmNode[] = [];

  function getOrCreateLocalNode(overpassId: number): number | null {
    if (nodeIdMap.has(overpassId)) return nodeIdMap.get(overpassId)!;
    const coord = overpassNodeMap.get(overpassId);
    if (!coord) return null;
    const id = localNodeId--;
    nodeIdMap.set(overpassId, id);
    nodes.push({
      id, lat: coord.lat, lon: coord.lon,
      tags: [{ k: 'plat_node_id', v: String(Math.abs(id)) }],
    });
    return id;
  }

  let localWayId = -1;
  let sidewalkCount = 0, crosswalkCount = 0, sideroadCount = 0;
  const ways: OsmWay[] = [];
  const mainRoads: MainRoadGeometry[] = [];
  const usedNodeIds = new Set<number>();

  for (const el of overpassData.elements) {
    if (el.type !== 'way' || !el.nodes || el.nodes.length < 2) continue;

    const roadType = classifyRoadType(el.tags || {});

    if (roadType === 'main_road') {
      const coords = (el.nodes || [])
        .map((nid) => overpassNodeMap.get(nid))
        .filter((c): c is { lat: number; lon: number } => c !== undefined);
      if (coords.length >= 2) {
        mainRoads.push({
          osmWayId: el.id,
          coords,
          highway: el.tags?.highway || '',
          lanes: parseInt(el.tags?.lanes || '0', 10),
          width: parseFloat(el.tags?.width || '0'),
        });
      }
      continue;
    }

    const localNodeRefs = (el.nodes || [])
      .map((nid) => getOrCreateLocalNode(nid))
      .filter((id): id is number => id !== null);
    if (localNodeRefs.length < 2) continue;

    localNodeRefs.forEach((id) => usedNodeIds.add(id));

    switch (roadType) {
      case 'sidewalk': sidewalkCount++; break;
      case 'crosswalk': crosswalkCount++; break;
      case 'sideroad': sideroadCount++; break;
    }

    ways.push({
      id: localWayId--,
      nodeRefs: localNodeRefs,
      tags: [
        { k: 'plat_way_id', v: String(Math.abs(localWayId + 1)) },
        { k: 'road_type', v: roadType },
      ],
    });
  }

  const filteredNodes = nodes.filter((n) => usedNodeIds.has(n.id));
  console.log(`📊 OSM 분류: 인도 ${sidewalkCount}, 건널목 ${crosswalkCount}, 이면도로 ${sideroadCount}, 차도 ${mainRoads.length}`);

  return {
    nodes: filteredNodes, ways, mainRoads,
    stats: {
      totalNodes: filteredNodes.length, totalWays: ways.length,
      sidewalkWays: sidewalkCount, crosswalkWays: crosswalkCount,
      sideroadWays: sideroadCount, mainRoadCount: mainRoads.length,
    },
  };
}

// ============================================
// 차도에서 인도 offset 생성 (동적 거리)
// ============================================

export function generateSidewalkFromMainRoads(
  mainRoads: MainRoadGeometry[],
  sides: 'both' | 'left' | 'right' = 'both',
): { nodes: OsmNode[]; ways: OsmWay[] } {
  let nodeId = -100000;
  let wayId = -100000;
  const nodes: OsmNode[] = [];
  const ways: OsmWay[] = [];

  for (const road of mainRoads) {
    // 도로별 동적 offset 거리 계산
    const offsetDist = calculateSidewalkOffset(road);

    const sideConfigs: { offset: number; label: string }[] = [];
    if (sides === 'both' || sides === 'left') {
      sideConfigs.push({ offset: offsetDist, label: 'left' });
    }
    if (sides === 'both' || sides === 'right') {
      sideConfigs.push({ offset: -offsetDist, label: 'right' });
    }

    for (const { offset, label } of sideConfigs) {
      const offsetCoords = offsetPolyline(road.coords, offset);
      const nodeRefs: number[] = [];

      for (const c of offsetCoords) {
        const id = nodeId--;
        nodes.push({
          id, lat: c.lat, lon: c.lon,
          tags: [{ k: 'plat_node_id', v: String(Math.abs(id)) }],
        });
        nodeRefs.push(id);
      }

      if (nodeRefs.length >= 2) {
        ways.push({
          id: wayId--,
          nodeRefs,
          tags: [
            { k: 'plat_way_id', v: String(Math.abs(wayId + 1)) },
            { k: 'road_type', v: 'sidewalk' },
            { k: 'source', v: 'ai_offset' },
            { k: 'offset_side', v: label },
            { k: 'offset_meters', v: String(Math.abs(offset).toFixed(1)) },
            { k: 'offset_from_highway', v: road.highway },
          ],
        });
      }
    }
  }

  return { nodes, ways };
}
