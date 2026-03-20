/**
 * GenerateButton - OSM + 네이버 위성 AI 분류 통합
 *
 * Step 1: OSM Overpass로 polygon 내 모든 도로 수집
 * Step 2: 네이버 위성 타일 캡처 (Canvas → base64, CORS 확인됨!)
 * Step 3: 위성 이미지에 도로 표시 → Claude가 이면도로/차도/건널목 분류
 * Step 4: 분류 결과 반영하여 지도에 색상별 표시
 *
 * [중요] 위성 모드에서 실행해야 네이버 위성 타일 version을 DOM에서 추출 가능
 */
import { useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { usePathStore } from '@/stores/pathStore';
import { fetchRoadsInArea } from '@/utils/overpass';
import { generatePathsFromOverpass } from '@/utils/pathGenerator';
import { captureNaverSatelliteImages } from '@/utils/naverSatellite';
import { classifyRoadsOnSatelliteImage, applyClassification, type RoadForClassification } from '@/utils/aiRoadClassifier';

export default function GenerateButton() {
  const isMapReady = useMapStore((s) => s.isMapReady);
  const {
    serviceArea,
    isGenerating,
    setIsGenerating,
    setGenerationProgress,
    setPathData,
    clearPathData,
  } = usePathStore();

  const handleGenerate = useCallback(async () => {
    if (!serviceArea || isGenerating) return;
    setIsGenerating(true);
    clearPathData();

    try {
      // === Step 1: OSM 도로 수집 ===
      setGenerationProgress('Step 1/3: OSM 도로 다운로드 중...');
      const overpassData = await fetchRoadsInArea(serviceArea.polygon, (done, total) => {
        setGenerationProgress(`Step 1/3: 타일 (${done}/${total})`);
      });

      const osmResult = generatePathsFromOverpass(overpassData);

      // 모든 도로를 합쳐서 하나의 배열로
      const allNodes = [...osmResult.nodes];
      const allWays = [...osmResult.ways];

      // 차도도 추가 (AI 분류 대상)
      let nodeId = -300000;
      let wayId = -300000;
      for (const road of osmResult.mainRoads) {
        const nodeRefs: number[] = [];
        for (const c of road.coords) {
          const id = nodeId--;
          allNodes.push({ id, lat: c.lat, lon: c.lon, tags: [{ k: 'plat_node_id', v: String(Math.abs(id)) }] });
          nodeRefs.push(id);
        }
        if (nodeRefs.length >= 2) {
          allWays.push({
            id: wayId--,
            nodeRefs,
            tags: [
              { k: 'plat_way_id', v: String(Math.abs(wayId + 1)) },
              { k: 'road_type', v: 'road' },
              { k: 'highway', v: road.highway },
            ],
          });
        }
      }

      setGenerationProgress(`Step 1/3 완료: ${allWays.length}개 도로`);

      // === Step 2: 네이버 위성 캡처 ===
      setGenerationProgress('Step 2/3: 네이버 위성 캡처 중...');
      const satImages = await captureNaverSatelliteImages(serviceArea.polygon, 17, 4, (done, total) => {
        setGenerationProgress(`Step 2/3: 위성 캡처 (${done}/${total})`);
      });

      if (satImages.length === 0) {
        console.warn('⚠️ 위성 이미지 캡처 실패 — AI 분류 스킵');
        setPathData({ nodes: allNodes, ways: allWays });
        setGenerationProgress(`완료! ${allWays.length}개 도로 (AI 분류 없음 — 위성 모드로 전환 후 재시도)`);
        return;
      }

      // === Step 3: AI 분류 ===
      const nodeMap = new Map(allNodes.map(n => [n.id, { lat: n.lat, lon: n.lon }]));
      const allClassifications = new Map<number, 'sideroad' | 'road' | 'crosswalk'>();
      let classifiedCount = 0;

      for (let i = 0; i < satImages.length; i++) {
        setGenerationProgress(`Step 3/3: AI 분류 (${i + 1}/${satImages.length})`);
        const sat = satImages[i];

        // 이 위성 이미지 영역에 포함된 도로 찾기
        const roadsInArea: RoadForClassification[] = allWays
          .filter(way => {
            const midRef = way.nodeRefs[Math.floor(way.nodeRefs.length / 2)];
            const mid = nodeMap.get(midRef);
            if (!mid) return false;
            return mid.lat >= sat.bounds.south && mid.lat <= sat.bounds.north
              && mid.lon >= sat.bounds.west && mid.lon <= sat.bounds.east;
          })
          .map(way => ({
            wayId: way.id,
            coords: way.nodeRefs
              .map(ref => nodeMap.get(ref))
              .filter((c): c is { lat: number; lon: number } => c !== undefined),
            currentType: way.tags.find(t => t.k === 'road_type')?.v || 'sideroad',
          }));

        if (roadsInArea.length === 0) continue;

        try {
          const classifications = await classifyRoadsOnSatelliteImage(sat, roadsInArea);
          for (const [id, type] of classifications) {
            allClassifications.set(id, type);
            classifiedCount++;
          }
        } catch (err) {
          console.warn(`⚠️ 청크 ${i + 1} 분류 실패:`, err);
        }

        if (i < satImages.length - 1) await new Promise(r => setTimeout(r, 300));
      }

      // 분류 결과 적용
      if (classifiedCount > 0) {
        applyClassification(allWays, allClassifications);
      }

      setPathData({ nodes: allNodes, ways: allWays });

      const sideroads = allWays.filter(w => w.tags.some(t => t.k === 'road_type' && t.v === 'sideroad')).length;
      const roads = allWays.filter(w => w.tags.some(t => t.k === 'road_type' && t.v === 'road')).length;
      const crosswalks = allWays.filter(w => w.tags.some(t => t.k === 'road_type' && t.v === 'crosswalk')).length;
      const sidewalks = allWays.filter(w => w.tags.some(t => t.k === 'road_type' && t.v === 'sidewalk')).length;

      setGenerationProgress(
        `완료! 이면도로 ${sideroads}, 차도 ${roads}, 건널목 ${crosswalks}, 인도 ${sidewalks}\n` +
        `AI: ${classifiedCount}개 분류 (네이버 위성)`
      );
    } catch (error) {
      console.error('❌ 실패:', error);
      setGenerationProgress(`오류: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGenerating(false);
    }
  }, [serviceArea, isGenerating, setIsGenerating, setGenerationProgress, setPathData, clearPathData]);

  if (!isMapReady || !serviceArea) return null;

  return (
    <button
      onClick={handleGenerate}
      disabled={isGenerating}
      className={`
        px-6 py-3 rounded-xl shadow-xl text-sm font-bold transition-all
        ${isGenerating
          ? 'bg-gray-400 text-white cursor-wait'
          : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 hover:shadow-2xl'
        }
      `}
    >
      {isGenerating ? (
        <span className="flex items-center gap-2">
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          생성 중...
        </span>
      ) : (
        '🚀 도로 불러오기 + AI 분류'
      )}
    </button>
  );
}
