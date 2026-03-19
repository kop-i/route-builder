/**
 * ExportPanel 컴포넌트
 * - XML 다운로드 버튼 (태그 포함 / 미포함)
 * - 지도 우측 하단에 위치
 */
import { usePathStore } from '@/stores/pathStore';
import { useMapStore } from '@/stores/mapStore';
import { generateOsmXml, downloadXml } from '@/utils/osmXml';

export default function ExportPanel() {
  const { nodes, ways, relations } = usePathStore();
  const isMapReady = useMapStore((s) => s.isMapReady);

  if (!isMapReady || ways.length === 0) return null;

  /** 태그 포함 XML 다운로드 */
  const handleExportWithTags = () => {
    const xml = generateOsmXml(nodes, ways, relations, { includeTags: true });
    downloadXml(xml, 'route_with_tags.xml');
  };

  /** 좌표만 포함 XML 다운로드 */
  const handleExportClean = () => {
    const xml = generateOsmXml(nodes, ways, relations, { includeTags: false });
    downloadXml(xml, 'route_clean.xml');
  };

  return (
    <div className="absolute bottom-6 right-4 z-[1000] flex gap-2">
      <button
        onClick={handleExportWithTags}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        📥 XML 다운로드 (태그 포함)
      </button>
      <button
        onClick={handleExportClean}
        className="bg-white text-gray-700 px-4 py-2 rounded-lg shadow-lg text-sm font-medium hover:bg-gray-50 transition-colors border border-gray-200"
      >
        📥 XML 다운로드 (경로만)
      </button>
    </div>
  );
}
