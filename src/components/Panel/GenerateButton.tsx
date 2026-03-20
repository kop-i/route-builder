/**
 * GenerateButton - 파이프라인 시작 버튼
 */
import { useMapStore } from '@/stores/mapStore';
import { usePathStore } from '@/stores/pathStore';
import { usePipelineStore } from '@/stores/pipelineStore';

export default function GenerateButton() {
  const isMapReady = useMapStore((s) => s.isMapReady);
  const serviceArea = usePathStore((s) => s.serviceArea);
  const { isActive, startPipeline } = usePipelineStore();

  if (!isMapReady || !serviceArea || isActive) return null;

  return (
    <button
      onClick={startPipeline}
      className="px-6 py-3 rounded-xl shadow-xl text-sm font-bold transition-all bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 hover:shadow-2xl"
    >
      🚀 경로 생성 시작
    </button>
  );
}
