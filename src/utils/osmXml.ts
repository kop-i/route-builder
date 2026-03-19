/**
 * OSM XML 파싱/생성 유틸리티
 * - .xml 파일 읽기 (임포트)
 * - .xml 파일 생성 (내보내기) - 태그 포함/미포함 2종
 * - 역삼 샘플 파일 구조를 기준으로 설계
 */
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import type { OsmNode, OsmWay, OsmRelation, OsmTag, XmlExportOptions } from '@/types/osm';

// ============================================
// XML 파싱 (임포트)
// ============================================

/**
 * OSM XML 문자열을 파싱하여 노드/웨이/릴레이션으로 변환
 * JOSM이 생성하는 OSM XML 형식을 지원
 */
export function parseOsmXml(xmlString: string): {
  nodes: OsmNode[];
  ways: OsmWay[];
  relations: OsmRelation[];
} {
  const parser = new XMLParser({
    ignoreAttributes: false,       // 속성(id, lat, lon 등) 파싱
    attributeNamePrefix: '@_',     // 속성 접두사
    isArray: (name) => {           // 항상 배열로 파싱할 태그
      return ['node', 'way', 'relation', 'tag', 'nd', 'member'].includes(name);
    },
  });

  const parsed = parser.parse(xmlString);
  const osm = parsed.osm;

  // --- 노드 파싱 ---
  const nodes: OsmNode[] = (osm.node || []).map((n: Record<string, unknown>) => ({
    id: Number(n['@_id']),
    lat: Number(n['@_lat']),
    lon: Number(n['@_lon']),
    tags: (n.tag as Record<string, string>[] || []).map((t) => ({
      k: t['@_k'],
      v: t['@_v'],
    })),
  }));

  // --- 웨이 파싱 ---
  const ways: OsmWay[] = (osm.way || []).map((w: Record<string, unknown>) => ({
    id: Number(w['@_id']),
    nodeRefs: (w.nd as Record<string, string>[] || []).map((nd) => Number(nd['@_ref'])),
    tags: (w.tag as Record<string, string>[] || []).map((t) => ({
      k: t['@_k'],
      v: t['@_v'],
    })),
  }));

  // --- 릴레이션 파싱 ---
  const relations: OsmRelation[] = (osm.relation || []).map((r: Record<string, unknown>) => ({
    id: Number(r['@_id']),
    members: (r.member as Record<string, string>[] || []).map((m) => ({
      type: m['@_type'] as 'node' | 'way' | 'relation',
      ref: Number(m['@_ref']),
      role: m['@_role'] || '',
    })),
    tags: (r.tag as Record<string, string>[] || []).map((t) => ({
      k: t['@_k'],
      v: t['@_v'],
    })),
  }));

  return { nodes, ways, relations };
}

// ============================================
// XML 생성 (내보내기)
// ============================================

/**
 * 노드/웨이 데이터를 OSM XML 문자열로 변환
 *
 * @param nodes - 노드 배열
 * @param ways - 웨이 배열
 * @param relations - 릴레이션 배열 (선택)
 * @param options - 내보내기 옵션 (태그 포함 여부)
 * @returns OSM XML 문자열
 */
export function generateOsmXml(
  nodes: OsmNode[],
  ways: OsmWay[],
  relations: OsmRelation[] = [],
  options: XmlExportOptions = { includeTags: true }
): string {
  // XML 객체 구조 생성
  const osmObj: Record<string, unknown> = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    osm: {
      '@_version': '0.6',
      '@_generator': 'RouteBuilder',
      node: nodes.map((n) => {
        const nodeObj: Record<string, unknown> = {
          '@_id': n.id,
          '@_lat': n.lat,
          '@_lon': n.lon,
        };
        // 태그 포함 옵션이면 태그 추가
        if (options.includeTags && n.tags.length > 0) {
          nodeObj.tag = n.tags.map((t) => ({
            '@_k': t.k,
            '@_v': t.v,
          }));
        }
        return nodeObj;
      }),
      way: ways.map((w) => {
        const wayObj: Record<string, unknown> = {
          '@_id': w.id,
          nd: w.nodeRefs.map((ref) => ({ '@_ref': ref })),
        };
        if (options.includeTags && w.tags.length > 0) {
          wayObj.tag = w.tags.map((t) => ({
            '@_k': t.k,
            '@_v': t.v,
          }));
        }
        return wayObj;
      }),
    },
  };

  // 릴레이션이 있고 태그 포함이면 추가
  if (options.includeTags && relations.length > 0) {
    (osmObj.osm as Record<string, unknown>).relation = relations.map((r) => ({
      '@_id': r.id,
      member: r.members.map((m) => ({
        '@_type': m.type,
        '@_ref': m.ref,
        '@_role': m.role,
      })),
      tag: r.tags.map((t) => ({
        '@_k': t.k,
        '@_v': t.v,
      })),
    }));
  }

  // XML 문자열 생성
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: false,          // 줄바꿈 없이 (JOSM 호환)
    suppressEmptyNode: true,
  });

  return builder.build(osmObj);
}

/**
 * XML 문자열을 .xml 파일로 다운로드
 */
export function downloadXml(xmlString: string, filename: string = 'route_export.xml'): void {
  const blob = new Blob([xmlString], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
