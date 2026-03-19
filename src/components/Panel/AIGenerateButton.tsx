/**
 * AIGenerateButton - 위성사진 AI 분석으로 경로 생성
 *
 * [플로우]
 * 1. 서비스 면적의 위성 타일을 zoom 19로 캡처
 * 2. 3×3 타일 청크로 묶어 Claude Vision API에 전송
 * 3. 인도/건널목/이면도로를 AI가 식별하여 좌표 반환
 * 4. OsmNode/OsmWay로 변환하여 지도에 렌더링
 */
import { useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { usePathStore } from '@/stores/pathStore';
import { createSatelliteChunks, stitchChunkToBase64 } from '@/utils/satelliteCapture';
import { analyzeChunkWithClaude, convertDetectedPathsToOsm } from '@/utils/aiPathDetection';

export default function AIGenerateButton() {
  const isMapReady = useMapStore((s) => s.isMapReady);
  const {
    serviceArea,
    isGenerating,
    setIsGenerating,
    setGenerationProgress,
    setPathData,
    clearPathData,
  } = usePathStore();

  const handleAIGenerate = useCallback(async () => {
    if (!serviceArea || isGenerating) return;

    setIsGenerating(true);
    clearPathData();

    try {
      // === 1단계: 위성 타일 청크 생성 ===
      setGenerationProgress('위성 이미지 타일 계산 중...');
      const chunks = createSatelliteChunks(serviceArea.polygon, 3);
      console.log(`📦 ${chunks.length}개 청크 생성 (각 3×3 타일, zoom 19)`);

      // === 2단계: 청크별 위성 이미지 캡처 + AI 분석 ===
      const allDetectedPaths = [];
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        setGenerationProgress(
          `위성 분석 중... (${i + 1}/${chunks.length}) — ` +
          `성공 ${successCount}, 실패 ${failCount}`
        );

        try {
          // 타일 캡처 → base64 이미지 합성
          console.log(`📸 청크 ${i + 1} 캡처 중... (${chunk.tiles.length}개 타일)`);
          const imageBase64 = await stitchChunkToBase64(chunk);

          // Claude Vision API로 분석
          console.log(`🤖 청크 ${i + 1} AI 분석 중...`);
          const detected = await analyzeChunkWithClaude(chunk, imageBase64);

          const pathCount =
            detected.sidewalks.length +
            detected.crosswalks.length +
            detected.sideroads.length;

          console.log(
            `✅ 청크 ${i + 1} 완료: ` +
            `인도 ${detected.sidewalks.length}, ` +
            `건널목 ${detected.crosswalks.length}, ` +
            `이면도로 ${detected.sideroads.length}`
          );

          allDetectedPaths.push(detected);
          successCount++;

          // API rate limit 대비 약간의 딜레이
          if (i < chunks.length - 1) {
            await new Promise((r) => setTimeout(r, 500));
          }
        } catch (err) {
          console.error(`❌ 청크 ${i + 1} 실패:`, err);
          failCount++;
          // 실패해도 다음 청크 계속 진행
        }
      }

      // === 3단계: AI 결과 → OsmNode/OsmWay 변환 ===
      setGenerationProgress('경로 데이터 변환 중...');
      const { nodes, ways } = convertDetectedPathsToOsm(allDetectedPaths);

      // 통계 집계
      const sidewalkWays = ways.filter(
        (w) => w.tags.some((t) => t.k === 'road_type' && t.v === 'sidewalk')
      ).length;
      const crosswalkWays = ways.filter(
        (w) => w.tags.some((t) => t.k === 'road_type' && t.v === 'crosswalk')
      ).length;
      const sideroadWays = ways.filter(
        (w) => w.tags.some((t) => t.k === 'road_type' && t.v === 'sideroad')
      ).length;

      // store에 저장
      setPathData({ nodes, ways });

      setGenerationProgress(
        `AI 분석 완료! 노드 ${nodes.length}개, 웨이 ${ways.length}개 ` +
        `(인도 ${sidewalkWays}, 건널목 ${crosswalkWays}, 이면도로 ${sideroadWays}) ` +
        `— ${successCount}/${chunks.length} 청크 성공`
      );

      console.log('🎉 AI 경로 생성 완료:', {
        nodes: nodes.length,
        ways: ways.length,
        sidewalkWays,
        crosswalkWays,
        sideroadWays,
      });
    } catch (error) {
      console.error('❌ AI 경로 생성 실패:', error);
      setGenerationProgress(
        `오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      );
    } finally {
      setIsGenerating(false);
    }
  }, [serviceArea, isGenerating, setIsGenerating, setGenerationProgress, setPathData, clearPathData]);

  if (!isMapReady || !serviceArea) return null;

  return (
    <button
      onClick={handleAIGenerate}
      disabled={isGenerating}
      className={`
        px-6 py-3 rounded-xl shadow-xl text-sm font-bold transition-all
        ${isGenerating
          ? 'bg-gray-400 text-white cursor-wait'
          : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 hover:shadow-2xl'
        }
      `}
    >
      {isGenerating ? (
        <span className="flex items-center gap-2">
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          AI 분석 중...
        </span>
      ) : (
        '🛰️ AI 위성 분석'
      )}
    </button>
  );
}
