/**
 * Route Builder - 메인 앱 (UI/UX 최적화)
 *
 * [레이아웃]
 * 상단바: 로고 + 검색 + 지도유형 + 로드뷰
 * 좌측: 컴팩트 Toolbar
 * 하단: 상황별 액션 (생성/완성/내보내기)
 * 우측패널: 로드뷰 (토글)
 * 하단바: 파이프라인 (활성화 시)
 */
import MapContainer from '@/components/Map/MapContainer';
import PolygonDrawer from '@/components/Map/PolygonDrawer';
import PathRenderer from '@/components/Map/PathRenderer';
import ManualDrawer from '@/components/Map/ManualDrawer';
import Toolbar from '@/components/Panel/Toolbar';
import SearchPanel from '@/components/Panel/SearchPanel';
import GenerateButton from '@/components/Panel/GenerateButton';
import ExportPanel from '@/components/Panel/ExportPanel';
import RoadViewPanel from '@/components/Panel/RoadViewPanel';
import MapTypeSelector from '@/components/Panel/MapTypeSelector';
import PipelinePanel from '@/components/Panel/PipelinePanel';
import { usePathStore } from '@/stores/pathStore';
import { useMapStore } from '@/stores/mapStore';
import { useEditorStore } from '@/stores/editorStore';
import { usePipelineStore } from '@/stores/pipelineStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import './index.css';

function App() {
  const serviceArea = usePathStore((s) => s.serviceArea);
  const ways = usePathStore((s) => s.ways);
  const isMapReady = useMapStore((s) => s.isMapReady);
  const isStreetViewOpen = useEditorStore((s) => s.isStreetViewOpen);
  const isPipelineActive = usePipelineStore((s) => s.isActive);

  useKeyboardShortcuts();

  return (
    <div className="w-screen h-screen overflow-hidden relative">
      {/* 지도 */}
      <MapContainer />
      <PolygonDrawer />
      <PathRenderer />
      <ManualDrawer />

      {/* ===== 상단바: 로고 + 검색 + 지도유형 + 로드뷰 ===== */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2">
        {/* 로고 */}
        <div className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-1.5 shadow-md">
          <span className="text-xs font-bold text-gray-800">🤖 Route Builder</span>
        </div>
        {/* 검색 */}
        <SearchPanel />
        {/* 지도유형 */}
        <MapTypeSelector />
      </div>

      {/* ===== 좌측: Toolbar ===== */}
      <Toolbar />

      {/* ===== 하단: 상황별 액션 ===== */}
      {!isPipelineActive && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2">
          {/* 경로 생성 버튼 (서비스 면적이 있고 파이프라인 비활성 시) */}
          {isMapReady && serviceArea && <GenerateButton />}

          {/* XML 내보내기 (경로가 있을 때만) */}
          {isMapReady && ways.length > 0 && <ExportPanel />}
        </div>
      )}

      {/* ===== 우측: 로드뷰 패널 ===== */}
      <RoadViewPanel />

      {/* ===== 하단바: 파이프라인 ===== */}
      <PipelinePanel />
    </div>
  );
}

export default App;
