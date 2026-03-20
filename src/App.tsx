/**
 * Route Builder - 메인 앱 컴포넌트
 * 로봇 경로 자동 생성 도구
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
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import './index.css';

function App() {
  const serviceArea = usePathStore((s) => s.serviceArea);
  const isMapReady = useMapStore((s) => s.isMapReady);

  // JOSM 스타일 키보드 단축키 활성화
  useKeyboardShortcuts();

  return (
    <div className="w-screen h-screen overflow-hidden relative">
      <MapContainer />
      <PolygonDrawer />
      <PathRenderer />
      <ManualDrawer />
      <Toolbar />
      <SearchPanel />

      {isMapReady && serviceArea && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000]">
          <GenerateButton />
        </div>
      )}

      <ExportPanel />
      <RoadViewPanel />
      <MapTypeSelector />
      <PipelinePanel />

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]">
        <div className="bg-white/90 backdrop-blur-sm rounded-full px-5 py-2 shadow-lg">
          <h1 className="text-sm font-bold text-gray-800 tracking-tight">
            🤖 Route Builder
          </h1>
        </div>
      </div>
    </div>
  );
}

export default App;
