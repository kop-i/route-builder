/**
 * 국토교통부 노드링크 데이터 로더
 *
 * [데이터 구조]
 * - GeoJSON 형태로 public/data/ 에 저장
 * - 링크: LineString (도로 구간)
 * - 노드: Point (교차점)
 *
 * [ROAD_RANK 분류]
 * 101: 고속도로 → 제외
 * 102: 도시고속 → 제외
 * 103: 일반국도 → 차도
 * 104: 특별/광역시도 → 차도 또는 이면도로 (LANES 기반)
 * 105: 국가지원지방도 → 차도
 * 106: 지방도 → 차도/이면도로
 * 107: 기타도로 → 이면도로
 */
import type { OsmNode, OsmWay, RoadType } from '@/types/osm';

/** GeoJSON Feature from nodelink */
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
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
}

interface NodeLinkCollection {
  type: 'FeatureCollection';
  features: NodeLinkFeature[];
}

/** 노드링크 로드 결과 */
export interface NodeLinkResult {
  nodes: OsmNode[];
  ways: OsmWay[];
  stats: {
    totalLinks: number;
    sideroadLinks: number;
    mainRoadLinks: number;
    excludedLinks: number;
    totalNodes: number;
    totalWays: number;
  };
}

/**
 * ROAD_RANK → Route Builder RoadType 변환
 * 로봇이 주행 가능한 도로만 포함
 */
function classifyNodeLinkRoad(rank: string, lanes: number): RoadType | null {
  switch (rank) {
    case '101': return null;  // 고속도로 → 제외
    case '102': return null;  // 도시고속 → 제외
    case '103': return 'road'; // 일반국도 → 차도
    case '104': // 특별/광역시도
      return lanes <= 1 ? 'sideroad' : 'road';
    case '105': return 'road'; // 국가지원지방도
    case '106': // 지방도
      return lanes <= 1 ? 'sideroad' : 'road';
    case '107': return 'sideroad'; // 기타도로 → 이면도로
    default: return 'sideroad';
  }
}

/**
 * 서비스 면적(polygon) 내의 노드링크 데이터 로드
 * 현재는 public/data/yeoksam_links.geojson 사용 (향후 동적 로드)
 */
export async function loadNodeLinkData(
  dataUrl = '/data/yeoksam_links.geojson'
): Promise<NodeLinkResult> {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error(`노드링크 데이터 로드 실패: ${response.status}`);

  const geojson: NodeLinkCollection = await response.json();

  let nodeId = -500000;
  let wayId = -500000;
  const nodes: OsmNode[] = [];
  const ways: OsmWay[] = [];
  const coordToNodeId = new Map<string, number>();

  let sideroadCount = 0;
  let mainRoadCount = 0;
  let excludedCount = 0;

  function getOrCreateNode(lon: number, lat: number): number {
    const key = `${lat.toFixed(6)}_${lon.toFixed(6)}`;
    if (coordToNodeId.has(key)) return coordToNodeId.get(key)!;

    const id = nodeId--;
    coordToNodeId.set(key, id);
    nodes.push({
      id,
      lat,
      lon,
      tags: [{ k: 'plat_node_id', v: String(Math.abs(id)) }],
    });
    return id;
  }

  for (const feature of geojson.features) {
    const { ROAD_RANK, LANES, ROAD_NAME, LINK_ID } = feature.properties;
    const roadType = classifyNodeLinkRoad(ROAD_RANK, LANES);

    if (roadType === null) {
      excludedCount++;
      continue;
    }

    // 이면도로만 포함 (차도는 인도 자동 생성이 준비될 때까지 제외)
    if (roadType === 'road') {
      mainRoadCount++;
      continue; // 향후 인도 offset 생성 시 활용
    }

    const coords = feature.geometry.coordinates;
    if (coords.length < 2) continue;

    const nodeRefs: number[] = [];
    for (const [lon, lat] of coords) {
      nodeRefs.push(getOrCreateNode(lon, lat));
    }

    if (nodeRefs.length < 2) continue;

    const id = wayId--;
    ways.push({
      id,
      nodeRefs,
      tags: [
        { k: 'plat_way_id', v: String(Math.abs(id)) },
        { k: 'road_type', v: roadType },
        { k: 'source', v: 'nodelink' },
        { k: 'link_id', v: LINK_ID },
        { k: 'road_name', v: ROAD_NAME },
      ],
    });
    sideroadCount++;
  }

  console.log(`📊 노드링크: 이면도로 ${sideroadCount}, 차도 ${mainRoadCount} (제외), 고속도로 등 ${excludedCount} (제외)`);

  return {
    nodes,
    ways,
    stats: {
      totalLinks: geojson.features.length,
      sideroadLinks: sideroadCount,
      mainRoadLinks: mainRoadCount,
      excludedLinks: excludedCount,
      totalNodes: nodes.length,
      totalWays: ways.length,
    },
  };
}
