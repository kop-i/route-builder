/**
 * 국토교통부 노드링크 데이터 로더 v4
 *
 * [제1원칙] 선택한 범위(polygon)에만 경로 표시
 * [제2원칙] 이면도로/차도 구분 표시 (ROAD_RANK + LANES + MAX_SPD 기반)
 *
 * [분류 기준]
 * 이면도로: ROAD_RANK=107 또는 (LANES=1이고 MAX_SPD<=30)
 * 차도: 그 외 (ROAD_RANK 103~106, LANES>=2, MAX_SPD>=40)
 */
import type { OsmNode, OsmWay } from '@/types/osm';

interface NodeLinkFeature {
  type: 'Feature';
  properties: {
    LINK_ID: string;
    F_NODE: string;
    T_NODE: string;
    LANES: number;
    ROAD_RANK: string;
    ROAD_NAME: string;
    MAX_SPD: number;
    LENGTH: number;
  };
  geometry: { type: 'LineString'; coordinates: number[][] };
}

interface NodeLinkCollection {
  type: 'FeatureCollection';
  features: NodeLinkFeature[];
}

export interface NodeLinkResult {
  nodes: OsmNode[];
  ways: OsmWay[];
  stats: {
    totalLinks: number;
    sideroadCount: number;
    roadCount: number;
    filteredOut: number;
    totalNodes: number;
    totalWays: number;
  };
}

// ============================================
// Polygon 필터링 (bbox 기반 + point-in-polygon 보완)
// ============================================

interface BBox { south: number; north: number; west: number; east: number }

function polygonToBBox(polygon: { lat: number; lng: number }[]): BBox {
  const lats = polygon.map(p => p.lat);
  const lngs = polygon.map(p => p.lng);
  return { south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lngs), east: Math.max(...lngs) };
}

/** 라인의 bbox가 polygon의 bbox와 겹치는지 확인 */
function lineIntersectsBBox(coords: number[][], bbox: BBox): boolean {
  for (const [lon, lat] of coords) {
    if (lat >= bbox.south && lat <= bbox.north && lon >= bbox.west && lon <= bbox.east) {
      return true;
    }
  }
  return false;
}

// ============================================
// 도로 분류
// ============================================

function classifyRoad(rank: string, lanes: number, maxSpd: number): 'sideroad' | 'road' {
  // 기타도로(107)는 무조건 이면도로
  if (rank === '107') return 'sideroad';

  // 1차선이고 제한속도 30km/h 이하 → 이면도로
  if (lanes <= 1 && maxSpd <= 30) return 'sideroad';

  // 그 외 → 차도
  return 'road';
}

// ============================================
// 메인 로드 함수
// ============================================

export async function loadNodeLinkData(
  polygon?: { lat: number; lng: number }[],
  dataUrl = '/data/yeoksam_links.geojson'
): Promise<NodeLinkResult> {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error(`노드링크 데이터 로드 실패: ${response.status}`);

  const geojson: NodeLinkCollection = await response.json();

  // polygon bbox 계산 (필터링용)
  const bbox = polygon ? polygonToBBox(polygon) : null;

  let nodeId = -500000;
  let wayId = -500000;
  const nodes: OsmNode[] = [];
  const ways: OsmWay[] = [];
  const coordToNodeId = new Map<string, number>();
  let sideroadCount = 0;
  let roadCount = 0;
  let filteredOut = 0;

  function getOrCreateNode(lon: number, lat: number): number {
    const key = `${lat.toFixed(6)}_${lon.toFixed(6)}`;
    if (coordToNodeId.has(key)) return coordToNodeId.get(key)!;
    const id = nodeId--;
    coordToNodeId.set(key, id);
    nodes.push({ id, lat, lon, tags: [{ k: 'plat_node_id', v: String(Math.abs(id)) }] });
    return id;
  }

  for (const feature of geojson.features) {
    const { ROAD_RANK, ROAD_NAME, LINK_ID, LANES, MAX_SPD } = feature.properties;

    // 고속도로 제외
    if (ROAD_RANK === '101' || ROAD_RANK === '102') continue;

    const coords = feature.geometry.coordinates;
    if (coords.length < 2) continue;

    // [제1원칙] polygon bbox 필터링
    if (bbox && !lineIntersectsBBox(coords, bbox)) {
      filteredOut++;
      continue;
    }

    // [제2원칙] 이면도로/차도 분류
    const roadType = classifyRoad(ROAD_RANK, LANES, MAX_SPD);

    const nodeRefs: number[] = [];
    for (const [lon, lat] of coords) {
      nodeRefs.push(getOrCreateNode(lon, lat));
    }
    if (nodeRefs.length < 2) continue;

    ways.push({
      id: wayId--,
      nodeRefs,
      tags: [
        { k: 'plat_way_id', v: String(Math.abs(wayId + 1)) },
        { k: 'road_type', v: roadType },
        { k: 'source', v: 'nodelink' },
        { k: 'link_id', v: LINK_ID },
        { k: 'road_name', v: ROAD_NAME },
        { k: 'road_rank', v: ROAD_RANK },
        { k: 'lanes', v: String(LANES) },
        { k: 'max_spd', v: String(MAX_SPD) },
      ],
    });

    if (roadType === 'sideroad') sideroadCount++;
    else roadCount++;
  }

  console.log(`📊 노드링크: 이면도로 ${sideroadCount}, 차도 ${roadCount}, 영역 밖 ${filteredOut}`);

  return {
    nodes, ways,
    stats: { totalLinks: geojson.features.length, sideroadCount, roadCount, filteredOut, totalNodes: nodes.length, totalWays: ways.length },
  };
}
