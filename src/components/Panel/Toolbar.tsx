/**
 * Toolbar 컴포넌트
 * - 지도 위에 오버레이되는 도구 모음
 * - 편집 모드 전환, 서비스 면적 그리기, XML 내보내기 등
 */
import { useEditorStore } from '@/stores/editorStore';
import { usePathStore } from '@/stores/pathStore';
import { useMapStore } from '@/stores/mapStore';

export default function Toolbar() {
  const { mode, setMode, layerVisibility, toggleLayer, selectedElement, setSelectedElement } = useEditorStore();
  const { nodes, ways, isGenerating, generationProgress, removeWay, removeNode } = usePathStore();
  const isMapReady = useMapStore((s) => s.isMapReady);

  /** 선택된 요소 삭제 */
  const handleDelete = () => {
    if (!selectedElement) return;
    if (selectedElement.type === 'way') {
      removeWay(selectedElement.id);
    } else if (selectedElement.type === 'node') {
      removeNode(selectedElement.id);
    }
    setSelectedElement(null);
  };

  if (!isMapReady) return null;

  return (
    <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
      {/* 메인 도구 버튼들 (JOSM 단축키 표시) */}
      <div className="bg-white rounded-lg shadow-lg p-2 flex flex-col gap-1">
        <ToolButton label="🖐️ 보기" shortcut="V" active={mode === 'view'} onClick={() => setMode('view')} />
        <ToolButton label="📐 면적 그리기" shortcut="B" active={mode === 'draw_area'} onClick={() => setMode('draw_area')} />
        <div className="border-t border-gray-200 my-1" />
        <p className="text-[10px] text-gray-400 px-1">수동 그리기</p>
        <ToolButton label="🟦 인도" shortcut="A" active={mode === 'draw_sidewalk'} onClick={() => setMode('draw_sidewalk')} />
        <ToolButton label="🟥 건널목" shortcut="C" active={mode === 'draw_crosswalk'} onClick={() => setMode('draw_crosswalk')} />
        <ToolButton label="🟧 이면도로" shortcut="W" active={mode === 'draw_sideroad'} onClick={() => setMode('draw_sideroad')} />
        <div className="border-t border-gray-200 my-1" />
        <ToolButton label="🔍 선택/삭제" shortcut="S" active={mode === 'select'} onClick={() => setMode('select')} disabled={ways.length === 0} />
        <ToolButton label="✋ 노드 이동" shortcut="M" active={mode === 'move_node'} onClick={() => setMode('move_node')} disabled={nodes.length === 0} />
      </div>

      {/* 통계 정보 */}
      {ways.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-3 text-xs text-gray-600">
          <p className="font-semibold text-gray-800 mb-1">경로 데이터</p>
          <p>노드: {nodes.length.toLocaleString()}개</p>
          <p>웨이: {ways.length.toLocaleString()}개</p>
        </div>
      )}

      {/* 그리기 모드 안내 */}
      {(mode === 'draw_sidewalk' || mode === 'draw_crosswalk' || mode === 'draw_sideroad') && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-700">
          <p className="font-semibold mb-1">
            {mode === 'draw_sidewalk' && '🟦 인도 그리기 모드'}
            {mode === 'draw_crosswalk' && '🟥 건널목 그리기 모드'}
            {mode === 'draw_sideroad' && '🟧 이면도로 그리기 모드'}
          </p>
          <p>• 지도를 <b>클릭</b>하여 노드를 찍으세요</p>
          <p>• <b>더블클릭</b> 또는 <b>Enter</b>로 웨이 완성</p>
          <p>• <b>ESC</b>로 취소</p>
        </div>
      )}

      {/* 선택된 요소 삭제 버튼 */}
      {selectedElement && (mode === 'select' || mode === 'move_node') && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2">
          <p className="text-xs text-red-700 mb-1.5">
            {selectedElement.type === 'way' ? '웨이' : '노드'} #{Math.abs(selectedElement.id)} 선택됨
          </p>
          <button
            onClick={handleDelete}
            className="w-full px-3 py-1.5 bg-red-500 text-white text-xs rounded-md hover:bg-red-600 transition-colors"
          >
            🗑️ 삭제
          </button>
        </div>
      )}

      {/* 생성 진행/결과 표시 */}
      {(isGenerating || generationProgress) && (
        <div className={`border rounded-lg p-3 text-xs ${isGenerating ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {isGenerating ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span>{generationProgress || '경로 생성 중...'}</span>
            </div>
          ) : (
            <p>{generationProgress}</p>
          )}
        </div>
      )}

      {/* 레이어 토글 */}
      {ways.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-3 text-xs">
          <p className="font-semibold text-gray-800 mb-2">레이어</p>
          <LayerToggle
            label="인도"
            color="#3B82F6"
            active={layerVisibility.sidewalk}
            onClick={() => toggleLayer('sidewalk')}
          />
          <LayerToggle
            label="건널목"
            color="#EF4444"
            active={layerVisibility.crosswalk}
            onClick={() => toggleLayer('crosswalk')}
          />
          <LayerToggle
            label="이면도로"
            color="#F59E0B"
            active={layerVisibility.sideroad}
            onClick={() => toggleLayer('sideroad')}
          />
          <LayerToggle
            label="차도"
            color="#9CA3AF"
            active={layerVisibility.road}
            onClick={() => toggleLayer('road')}
          />
          <LayerToggle
            label="노드"
            color="#6B7280"
            active={layerVisibility.nodes}
            onClick={() => toggleLayer('nodes')}
          />
        </div>
      )}
    </div>
  );
}

// --- 하위 컴포넌트 ---

function ToolButton({
  label,
  shortcut,
  active,
  onClick,
  disabled = false,
}: {
  label: string;
  shortcut?: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        px-3 py-2 text-xs rounded-md transition-colors text-left flex items-center justify-between gap-2
        ${active
          ? 'bg-blue-500 text-white'
          : disabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
        }
      `}
    >
      <span>{label}</span>
      {shortcut && (
        <kbd className={`text-[9px] px-1 py-0.5 rounded ${active ? 'bg-blue-400' : 'bg-gray-200 text-gray-500'}`}>
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

function LayerToggle({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full py-1 hover:bg-gray-50 rounded"
    >
      <div
        className="w-3 h-3 rounded-sm border"
        style={{
          backgroundColor: active ? color : 'transparent',
          borderColor: color,
        }}
      />
      <span className={active ? 'text-gray-800' : 'text-gray-400'}>
        {label}
      </span>
    </button>
  );
}
