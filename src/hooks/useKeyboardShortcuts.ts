/**
 * JOSM 스타일 키보드 단축키
 *
 * [JOSM 단축키 매핑]
 * S        → 선택/삭제 모드 (Select)
 * A        → 인도 그리기 모드 (Add)
 * D / Del  → 선택된 요소 삭제 (Delete)
 * Backspace → 선택된 요소 삭제
 * Escape   → 보기 모드로 돌아가기 / 선택 해제
 * Ctrl+Z   → 실행 취소 (Undo) - 향후 구현
 * Ctrl+Shift+Z / Ctrl+Y → 다시 실행 (Redo) - 향후 구현
 * B        → 면적 그리기 (Boundary)
 * W        → 이면도로 그리기 (Way)
 * C        → 건널목 그리기 (Crosswalk)
 * R        → 로드뷰 토글 (Road view)
 */
import { useEffect } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { usePathStore } from '@/stores/pathStore';
import { useMapStore } from '@/stores/mapStore';

export function useKeyboardShortcuts() {
  const setMode = useEditorStore((s) => s.setMode);
  const mode = useEditorStore((s) => s.mode);
  const selectedElement = useEditorStore((s) => s.selectedElement);
  const setSelectedElement = useEditorStore((s) => s.setSelectedElement);
  const toggleStreetView = useEditorStore((s) => s.toggleStreetView);

  const removeWay = usePathStore((s) => s.removeWay);
  const removeNode = usePathStore((s) => s.removeNode);
  const undo = usePathStore((s) => s.undo);
  const redo = usePathStore((s) => s.redo);

  // === 스페이스바 + 드래그로 지도 이동 (JOSM 스타일) ===
  useEffect(() => {
    let spaceDown = false;
    const naverMap = useMapStore.getState().naverMap;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spaceDown) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        spaceDown = true;
        document.body.style.cursor = 'grab';
        // 네이버 지도: 그리기 모드에서도 스페이스바 누르면 지도 드래그 가능
        if (naverMap) naverMap.setOptions({ draggable: true });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown = false;
        document.body.style.cursor = '';
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // === 메인 단축키 ===
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // === Ctrl+Z → Undo ===
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // === Ctrl+Shift+Z / Ctrl+Y → Redo ===
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      const isDrawing = mode === 'draw_area' || mode === 'draw_sidewalk'
        || mode === 'draw_crosswalk' || mode === 'draw_sideroad';

      // === Delete / Backspace / D → 삭제 ===
      if ((e.key === 'Delete' || e.key === 'Backspace' || (!isDrawing && e.key === 'd')) && selectedElement) {
        e.preventDefault();
        if (selectedElement.type === 'way') removeWay(selectedElement.id);
        else if (selectedElement.type === 'node') removeNode(selectedElement.id);
        setSelectedElement(null);
        return;
      }

      if (isDrawing) return;

      // === Escape ===
      if (e.key === 'Escape') {
        if (selectedElement) setSelectedElement(null);
        else setMode('view');
        return;
      }

      // === 모드 전환 ===
      switch (e.key.toLowerCase()) {
        case 's': setMode('select'); break;
        case 'a': setMode('draw_sidewalk'); break;
        case 'w': setMode('draw_sideroad'); break;
        case 'c': setMode('draw_crosswalk'); break;
        case 'b': setMode('draw_area'); break;
        case 'm': setMode('move_node'); break;
        case 'r': toggleStreetView(); break;
        case 'v': setMode('view'); break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mode, selectedElement, setMode, setSelectedElement, removeWay, removeNode, toggleStreetView, undo, redo]);
}
