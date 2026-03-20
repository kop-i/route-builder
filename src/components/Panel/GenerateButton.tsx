/**
 * GenerateButton - OSM Overpass 기반 도로 불러오기
 * 제1원칙: polygon 내 도로만 표시
 * 제2원칙: 이면도로(주황)/차도(회색)/건널목(빨강) 구분
 */
import { useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { usePathStore } from '@/stores/pathStore';
import { fetchRoadsInArea } from '@/utils/overpass';
import { generatePathsFromOverpass } from '@/utils/pathGenerator';

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
      setGenerationProgress('도로 데이터 다운로드 중...');
      const overpassData = await fetchRoadsInArea(serviceArea.polygon, (done, total) => {
        setGenerationProgress(`도로 다운로드 (${done}/${total})`);
      });

      setGenerationProgress('도로 분류 중...');
      const result = generatePathsFromOverpass(overpassData);

      // 이면도로 + 차도 + 건널목 모두 표시 (mainRoads → road 타입으로 변환)
      const allNodes = [...result.nodes];
      const allWays = [...result.ways];

      // 차도도 road 타입으로 추가 (이전에는 제외했지만 이제 표시)
      let nodeId = -300000;
      let wayId = -300000;
      for (const road of result.mainRoads) {
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

      setPathData({ nodes: allNodes, ways: allWays });

      const sideroads = result.stats.sideroadWays;
      const crosswalks = result.stats.crosswalkWays;
      const sidewalks = result.stats.sidewalkWays;
      const roads = result.mainRoads.length;

      setGenerationProgress(
        `완료! 이면도로 ${sideroads}, 차도 ${roads}, 건널목 ${crosswalks}, 인도 ${sidewalks}`
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
          : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 hover:shadow-2xl'
        }
      `}
    >
      {isGenerating ? (
        <span className="flex items-center gap-2">
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          로드 중...
        </span>
      ) : (
        '🚀 도로 불러오기'
      )}
    </button>
  );
}
