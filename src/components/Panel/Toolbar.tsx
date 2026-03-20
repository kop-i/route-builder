/**
 * Toolbar - 컴팩트 도구 모음 (좌측)
 */
import { useEditorStore } from '@/stores/editorStore';
import { usePathStore } from '@/stores/pathStore';
import { useMapStore } from '@/stores/mapStore';

export default function Toolbar() {
  const { mode, setMode, layerVisibility, toggleLayer, selectedElement, setSelectedElement, isStreetViewOpen, toggleStreetView } = useEditorStore();
  const { nodes, ways, isGenerating, generationProgress, removeWay, removeNode } = usePathStore();
  const isMapReady = useMapStore((s) => s.isMapReady);

  const handleDelete = () => {
    if (!selectedElement) return;
    if (selectedElement.type === 'way') removeWay(selectedElement.id);
    else if (selectedElement.type === 'node') removeNode(selectedElement.id);
    setSelectedElement(null);
  };

  if (!isMapReady) return null;

  return (
    <div className="absolute top-14 left-3 z-[1000] flex flex-col gap-1.5" style={{ maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
      {/* 도구 버튼 */}
      <div className="bg-white rounded-lg shadow-lg p-1.5 flex flex-col gap-0.5">
        <Btn label="🖐️" tip="보기" shortcut="V" active={mode === 'view'} onClick={() => setMode('view')} />
        <Btn label="📐" tip="면적" shortcut="B" active={mode === 'draw_area'} onClick={() => setMode('draw_area')} />
        <div className="border-t border-gray-200 my-0.5" />
        <Btn label="🟦" tip="인도" shortcut="A" active={mode === 'draw_sidewalk'} onClick={() => setMode('draw_sidewalk')} />
        <Btn label="🟥" tip="건널목" shortcut="C" active={mode === 'draw_crosswalk'} onClick={() => setMode('draw_crosswalk')} />
        <Btn label="🟧" tip="이면도로" shortcut="W" active={mode === 'draw_sideroad'} onClick={() => setMode('draw_sideroad')} />
        <div className="border-t border-gray-200 my-0.5" />
        <Btn label="🔍" tip="선택" shortcut="S" active={mode === 'select'} onClick={() => setMode('select')} disabled={ways.length === 0} />
        <Btn label="✋" tip="이동" shortcut="M" active={mode === 'move_node'} onClick={() => setMode('move_node')} disabled={nodes.length === 0} />
        <div className="border-t border-gray-200 my-0.5" />
        <Btn label="👁️" tip="로드뷰" shortcut="R" active={isStreetViewOpen} onClick={toggleStreetView} />
      </div>

      {/* 선택된 요소 삭제 */}
      {selectedElement && (
        <button
          onClick={handleDelete}
          className="bg-red-500 text-white text-[10px] px-2 py-1.5 rounded-lg shadow-lg hover:bg-red-600"
        >
          🗑️ 삭제 <kbd className="bg-red-400 px-1 rounded text-[8px]">D</kbd>
        </button>
      )}

      {/* 그리기 모드 안내 */}
      {(mode === 'draw_sidewalk' || mode === 'draw_crosswalk' || mode === 'draw_sideroad') && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-1.5 text-[10px] text-blue-700 max-w-[120px]">
          클릭→노드 | 더블클릭→완성 | ESC→취소
        </div>
      )}

      {/* 진행 상태 */}
      {(isGenerating || generationProgress) && (
        <div className="bg-white rounded-lg shadow-lg p-1.5 text-[10px] text-gray-600 max-w-[140px]">
          {isGenerating && <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-1" />}
          {generationProgress?.split('\n')[0] || '처리 중...'}
        </div>
      )}

      {/* 레이어 토글 */}
      {ways.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-1.5 text-[10px]">
          <div className="flex flex-wrap gap-1">
            <LayerChip label="인도" color="#3B82F6" active={layerVisibility.sidewalk} onClick={() => toggleLayer('sidewalk')} />
            <LayerChip label="건널목" color="#EF4444" active={layerVisibility.crosswalk} onClick={() => toggleLayer('crosswalk')} />
            <LayerChip label="이면" color="#F59E0B" active={layerVisibility.sideroad} onClick={() => toggleLayer('sideroad')} />
            <LayerChip label="차도" color="#9CA3AF" active={layerVisibility.road} onClick={() => toggleLayer('road')} />
            <LayerChip label="노드" color="#6B7280" active={layerVisibility.nodes} onClick={() => toggleLayer('nodes')} />
          </div>
        </div>
      )}

      {/* 통계 */}
      {ways.length > 0 && (
        <div className="bg-white/80 rounded-lg px-1.5 py-1 text-[9px] text-gray-500">
          N:{nodes.length} W:{ways.length}
        </div>
      )}
    </div>
  );
}

// 컴팩트 아이콘 버튼
function Btn({ label, tip, shortcut, active, onClick, disabled = false }: {
  label: string; tip: string; shortcut: string;
  active: boolean; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={`${tip} (${shortcut})`}
      className={`
        w-9 h-9 rounded-md flex items-center justify-center text-sm transition-colors relative group
        ${active ? 'bg-blue-500 text-white shadow-sm' :
          disabled ? 'bg-gray-50 text-gray-300 cursor-not-allowed' :
          'bg-white text-gray-700 hover:bg-gray-100'}
      `}
    >
      {label}
      {/* 호버 시 툴팁 */}
      <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
        {tip} <kbd className="bg-gray-600 px-1 rounded">{shortcut}</kbd>
      </span>
    </button>
  );
}

// 레이어 토글 칩
function LayerChip({ label, color, active, onClick }: {
  label: string; color: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border transition-colors ${
        active ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-100 opacity-50'
      }`}
    >
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: active ? color : '#ccc' }} />
      <span className="text-gray-600">{label}</span>
    </button>
  );
}
