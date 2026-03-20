/**
 * ExportPanel - XML 다운로드 (인라인, 하단 액션바에 포함)
 */
import { usePathStore } from '@/stores/pathStore';
import { generateOsmXml, downloadXml } from '@/utils/osmXml';

export default function ExportPanel() {
  const { nodes, ways, relations } = usePathStore();

  return (
    <>
      <button
        onClick={() => {
          const xml = generateOsmXml(nodes, ways, relations, { includeTags: true });
          downloadXml(xml, 'route_with_tags.xml');
        }}
        className="bg-white text-gray-700 px-3 py-2.5 rounded-xl shadow-lg text-xs font-medium hover:bg-gray-50 border border-gray-200"
      >
        📥 XML (태그)
      </button>
      <button
        onClick={() => {
          const xml = generateOsmXml(nodes, ways, relations, { includeTags: false });
          downloadXml(xml, 'route_clean.xml');
        }}
        className="bg-white text-gray-700 px-3 py-2.5 rounded-xl shadow-lg text-xs font-medium hover:bg-gray-50 border border-gray-200"
      >
        📥 XML (경로만)
      </button>
    </>
  );
}
