/**
 * 하이브리드 경로 생성 파이프라인 v4 — 횡단면 분석
 *
 * [전략]
 * Step 1: Overpass API → 모든 도로 수집
 * Step 2: 분류 → 인도/건널목/이면도로는 그대로 사용, 차도는 별도 분리
 * Step 3: 차도 → 위성 이미지에 도로 표시 → Claude가 인도까지 픽셀 거리 측정
 * Step 4: 측정된 거리로 차도별 맞춤 offset 인도 생성
 * Step 5: OSM 경로 + AI 인도 병합
 *
 * [핵심 변경]
 * - 이면도로에는 offset 안 함 (로봇이 도로 위 직접 주행)
 * - 차도에만 횡단면 분석으로 정확한 인도 offset
 * - 중앙선 재분류 제거 (잘못된 로직)
 */
import type { LatLng, OsmNode, OsmWay } from '@/types/osm';
import { fetchRoadsInArea } from './overpass';
import { generatePathsFromOverpass, generateSidewalkFromMainRoads } from './pathGenerator';
import { createSatelliteChunks, stitchChunkToBase64 } from './satelliteCapture';
import { analyzeCrossSections, groupRoadsByChunk, type CrossSectionResult } from './crossSectionAnalysis';
import { offsetPolyline } from './geometry';

type ProgressCallback = (message: string) => void;

export interface PipelineResult {
  nodes: OsmNode[];
  ways: OsmWay[];
  stats: {
    osmSidewalks: number;
    osmCrosswalks: number;
    osmSideroads: number;
    mainRoadsFound: number;
    aiSidewalksGenerated: number;
    totalNodes: number;
    totalWays: number;
  };
}

export async function runHybridPipeline(
  polygon: LatLng[],
  onProgress: ProgressCallback
): Promise<PipelineResult> {
  // ============================================
  // Step 1: Overpass API
  // ============================================
  onProgress('Step 1/4: OSM 도로 데이터 다운로드 중...');
  const overpassData = await fetchRoadsInArea(polygon, (done, total) => {
    onProgress(`Step 1/4: OSM 타일 (${done}/${total})`);
  });

  // ============================================
  // Step 2: 분류
  // ============================================
  onProgress('Step 2/4: 도로 분류 중...');
  const osmResult = generatePathsFromOverpass(overpassData);

  if (osmResult.mainRoads.length === 0) {
    const msg = `완료! 노드 ${osmResult.nodes.length}, 웨이 ${osmResult.ways.length} (차도 없음 → 인도 offset 없음)`;
    onProgress(msg);
    return {
      nodes: osmResult.nodes, ways: osmResult.ways,
      stats: {
        osmSidewalks: osmResult.stats.sidewalkWays,
        osmCrosswalks: osmResult.stats.crosswalkWays,
        osmSideroads: osmResult.stats.sideroadWays,
        mainRoadsFound: 0, aiSidewalksGenerated: 0,
        totalNodes: osmResult.nodes.length, totalWays: osmResult.ways.length,
      },
    };
  }

  // ============================================
  // Step 3: 횡단면 분석 (차도별 인도 거리 측정)
  // ============================================
  onProgress(`Step 3/4: 횡단면 AI 분석 중... (${osmResult.mainRoads.length}개 차도)`);

  const chunks = createSatelliteChunks(polygon, 3);
  const roadsByChunk = groupRoadsByChunk(osmResult.mainRoads, chunks);

  const allResults: CrossSectionResult[] = [];
  let chunksDone = 0;

  for (const [chunkIdx, roadsInChunk] of roadsByChunk.entries()) {
    chunksDone++;
    onProgress(`Step 3/4: 횡단면 분석 (청크 ${chunksDone}/${roadsByChunk.size}, 도로 ${roadsInChunk.length}개)`);

    const chunk = chunks[chunkIdx];
    const base64 = await stitchChunkToBase64(chunk);
    const results = await analyzeCrossSections(chunk, base64, roadsInChunk);
    allResults.push(...results);

    if (chunksDone < roadsByChunk.size) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // ============================================
  // Step 4: 측정된 offset으로 인도 생성 (차도별 맞춤)
  // ============================================
  onProgress('Step 4/4: 인도 경로 생성 중...');

  let nodeId = -100000;
  let wayId = -100000;
  const aiNodes: OsmNode[] = [];
  const aiWays: OsmWay[] = [];

  // 결과를 osmWayId로 빠르게 찾기 위한 맵
  const resultMap = new Map(allResults.map(r => [r.osmWayId, r]));

  for (const road of osmResult.mainRoads) {
    const measured = resultMap.get(road.osmWayId);
    if (!measured || !measured.hasSidewalk) {
      console.log(`⏭️ ${road.highway} (${road.osmWayId}): 인도 없음 → 스킵`);
      continue;
    }

    // 좌측 인도 생성
    if (measured.leftOffsetM > 0) {
      const offsetCoords = offsetPolyline(road.coords, measured.leftOffsetM);
      const nodeRefs: number[] = [];
      for (const c of offsetCoords) {
        const id = nodeId--;
        aiNodes.push({ id, lat: c.lat, lon: c.lon, tags: [{ k: 'plat_node_id', v: String(Math.abs(id)) }] });
        nodeRefs.push(id);
      }
      if (nodeRefs.length >= 2) {
        aiWays.push({
          id: wayId--,
          nodeRefs,
          tags: [
            { k: 'plat_way_id', v: String(Math.abs(wayId + 1)) },
            { k: 'road_type', v: 'sidewalk' },
            { k: 'source', v: 'cross_section' },
            { k: 'offset_side', v: 'left' },
            { k: 'offset_meters', v: measured.leftOffsetM.toFixed(1) },
          ],
        });
      }
    }

    // 우측 인도 생성
    if (measured.rightOffsetM > 0) {
      const offsetCoords = offsetPolyline(road.coords, -measured.rightOffsetM);
      const nodeRefs: number[] = [];
      for (const c of offsetCoords) {
        const id = nodeId--;
        aiNodes.push({ id, lat: c.lat, lon: c.lon, tags: [{ k: 'plat_node_id', v: String(Math.abs(id)) }] });
        nodeRefs.push(id);
      }
      if (nodeRefs.length >= 2) {
        aiWays.push({
          id: wayId--,
          nodeRefs,
          tags: [
            { k: 'plat_way_id', v: String(Math.abs(wayId + 1)) },
            { k: 'road_type', v: 'sidewalk' },
            { k: 'source', v: 'cross_section' },
            { k: 'offset_side', v: 'right' },
            { k: 'offset_meters', v: measured.rightOffsetM.toFixed(1) },
          ],
        });
      }
    }

    console.log(`✅ ${road.highway}: L=${measured.leftOffsetM.toFixed(1)}m, R=${measured.rightOffsetM.toFixed(1)}m`);
  }

  // ============================================
  // 병합
  // ============================================
  const mergedNodes = [...osmResult.nodes, ...aiNodes];
  const mergedWays = [...osmResult.ways, ...aiWays];

  const stats = {
    osmSidewalks: osmResult.stats.sidewalkWays,
    osmCrosswalks: osmResult.stats.crosswalkWays,
    osmSideroads: osmResult.stats.sideroadWays,
    mainRoadsFound: osmResult.mainRoads.length,
    aiSidewalksGenerated: aiWays.length,
    totalNodes: mergedNodes.length,
    totalWays: mergedWays.length,
  };

  onProgress(
    `완료! 노드 ${stats.totalNodes}개, 웨이 ${stats.totalWays}개\n` +
    `OSM: 인도 ${stats.osmSidewalks}, 건널목 ${stats.osmCrosswalks}, 이면도로 ${stats.osmSideroads}\n` +
    `AI 횡단면: 차도 ${stats.mainRoadsFound}개 분석 → 인도 ${stats.aiSidewalksGenerated}개 생성`
  );

  return { nodes: mergedNodes, ways: mergedWays, stats };
}
