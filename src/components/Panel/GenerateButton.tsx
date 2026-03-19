/**
 * GenerateButton - 경로 생성 버튼 (노드링크 / OSM 선택 가능)
 */
import { useCallback, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { usePathStore } from '@/stores/pathStore';
import { loadNodeLinkData } from '@/utils/nodelink';

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

  const handleNodeLink = useCallback(async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    clearPathData();

    try {
      setGenerationProgress('노드링크 데이터 로드 중...');
      const result = await loadNodeLinkData();

      setPathData({ nodes: result.nodes, ways: result.ways });
      setGenerationProgress(
        `완료! 노드 ${result.stats.totalNodes}개, 웨이 ${result.stats.totalWays}개\n` +
        `이면도로 ${result.stats.sideroadLinks}개 (노드링크)`
      );
    } catch (error) {
      console.error('❌ 노드링크 로드 실패:', error);
      setGenerationProgress(`오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, setIsGenerating, setGenerationProgress, setPathData, clearPathData]);

  if (!isMapReady || !serviceArea) return null;

  return (
    <button
      onClick={handleNodeLink}
      disabled={isGenerating}
      className={`
        px-6 py-3 rounded-xl shadow-xl text-sm font-bold transition-all
        ${isGenerating
          ? 'bg-gray-400 text-white cursor-wait'
          : 'bg-gradient-to-r from-green-600 to-teal-600 text-white hover:from-green-700 hover:to-teal-700 hover:shadow-2xl'
        }
      `}
    >
      {isGenerating ? (
        <span className="flex items-center gap-2">
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          로드 중...
        </span>
      ) : (
        '🗺️ 이면도로 불러오기 (노드링크)'
      )}
    </button>
  );
}
