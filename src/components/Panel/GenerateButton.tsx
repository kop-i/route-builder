/**
 * GenerateButton - 통합 경로 생성 버튼
 *
 * 단일 버튼으로 전체 하이브리드 파이프라인 실행:
 * OSM 도로 수집 → 분류 → AI 인도 분류 → offset 생성 → 병합
 */
import { useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { usePathStore } from '@/stores/pathStore';
import { runHybridPipeline } from '@/utils/hybridPipeline';

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
      const result = await runHybridPipeline(
        serviceArea.polygon,
        (msg) => setGenerationProgress(msg)
      );

      setPathData({ nodes: result.nodes, ways: result.ways });
    } catch (error) {
      console.error('❌ 경로 생성 실패:', error);
      setGenerationProgress(`오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
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
          경로 생성 중...
        </span>
      ) : (
        '🚀 경로 생성 (OSM + AI)'
      )}
    </button>
  );
}
