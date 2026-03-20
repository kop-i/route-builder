/**
 * AI 도로 분석기 v5 — 위성 + 로드뷰 이중 검증 (Sonnet)
 *
 * [핵심 변경] 위성사진만 보던 것 → 위성 + 로드뷰를 동시에 전달
 * 로드뷰에서는 인도/이면도로/건널목이 훨씬 명확하게 보임
 */
import type { OsmWay } from '@/types/osm';
import type { SatelliteImage } from './naverSatellite';
import { captureRoadviewForRoad } from './naverRoadview';

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const API_URL = 'https://api.anthropic.com/v1/messages';

export interface RoadForAnalysis {
  wayId: number;
  coords: { lat: number; lon: number }[];
  currentType: string;
}

export interface RoadAnalysisResult {
  wayId: number;
  roadType: 'sideroad' | 'road' | 'crosswalk' | 'sidewalk';
  sidewalk: { left: boolean; right: boolean };
  notes: string;
}

/**
 * 개별 도로를 위성 + 로드뷰로 분석
 * 도로 하나당 1번의 API 호출 (정확도 최우선)
 */
export async function analyzeRoadWithDualView(
  satImage: SatelliteImage,
  road: RoadForAnalysis,
): Promise<RoadAnalysisResult> {
  const { north, south, east, west } = satImage.bounds;

  // 1. 위성 이미지에 이 도로만 표시
  const canvas = document.createElement('canvas');
  canvas.width = satImage.pixelWidth;
  canvas.height = satImage.pixelHeight;
  const ctx = canvas.getContext('2d')!;

  const img = new Image();
  await new Promise<void>((resolve) => {
    img.onload = () => { ctx.drawImage(img, 0, 0); resolve(); };
    img.onerror = () => resolve();
    img.src = `data:image/jpeg;base64,${satImage.imageBase64}`;
  });

  const toPixel = (lat: number, lon: number) => ({
    x: ((lon - west) / (east - west)) * canvas.width,
    y: ((north - lat) / (north - south)) * canvas.height,
  });

  // 도로를 빨간 선으로 표시
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  road.coords.forEach((c, i) => {
    const p = toPixel(c.lat, c.lon);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  const satBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];

  // 2. 로드뷰 캡처
  const roadviewBase64 = await captureRoadviewForRoad(road.coords);

  // 3. Claude에게 위성 + 로드뷰 동시 전달
  const content: Array<{ type: string; source?: unknown; text?: string }> = [
    {
      type: 'text',
      text: '이미지 1: 위성사진 (빨간 선 = 분석 대상 도로)',
    },
    {
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: satBase64 },
    },
  ];

  if (roadviewBase64) {
    content.push(
      { type: 'text', text: '이미지 2: 해당 도로의 로드뷰 (거리 시점)' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: roadviewBase64 } },
    );
  }

  content.push({
    type: 'text',
    text: `위 이미지를 분석하세요. 현재 이 도로는 "${road.currentType}"로 분류되어 있습니다.

**분석 항목:**

1. **도로 유형** — 실제로 무엇인가요?
   - "sidewalk" = 인도/보도 (보행자만 다니는 길, 보도블록이 깔린 곳)
   - "sideroad" = 이면도로 (차량이 다니지만 중앙분리선이 없는 좁은 도로)
   - "road" = 차도 (중앙분리선이 있는 넓은 도로, 왕복 2차선 이상)
   - "crosswalk" = 건널목/횡단보도 (흰색 줄무늬)

2. **이 도로 옆에 인도(보도)가 있나요?**
   - left: 도로 왼쪽에 인도가 있는가 (true/false)
   - right: 도로 오른쪽에 인도가 있는가 (true/false)

${roadviewBase64 ? '로드뷰 이미지를 꼭 참고하세요! 로드뷰에서 인도가 더 잘 보입니다.' : ''}

JSON만 반환:
\`\`\`json
{"type": "sideroad", "sidewalk": {"left": true, "right": false}, "notes": "좁은 이면도로, 왼쪽에 인도 확인"}
\`\`\``,
  });

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20241022',
        max_tokens: 512,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      console.warn(`⚠️ AI 분석 실패 (${response.status})`);
      return defaultResult(road.wayId, road.currentType);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*?\})/);

    if (!jsonMatch) return defaultResult(road.wayId, road.currentType);

    const parsed = JSON.parse(jsonMatch[1]);
    const validTypes = ['sidewalk', 'sideroad', 'road', 'crosswalk'];
    const roadType = validTypes.includes(parsed.type) ? parsed.type : road.currentType;

    return {
      wayId: road.wayId,
      roadType: roadType as RoadAnalysisResult['roadType'],
      sidewalk: {
        left: parsed.sidewalk?.left ?? false,
        right: parsed.sidewalk?.right ?? false,
      },
      notes: parsed.notes || '',
    };
  } catch (err) {
    console.warn('⚠️ AI 분석 예외:', err);
    return defaultResult(road.wayId, road.currentType);
  }
}

function defaultResult(wayId: number, currentType: string): RoadAnalysisResult {
  return {
    wayId,
    roadType: (currentType as RoadAnalysisResult['roadType']) || 'sideroad',
    sidewalk: { left: false, right: false },
    notes: '분석 실패',
  };
}

/** 분석 결과를 ways 태그에 적용 */
export function applyAnalysisResults(
  ways: OsmWay[],
  results: RoadAnalysisResult[]
): void {
  const resultMap = new Map(results.map(r => [r.wayId, r]));
  for (const way of ways) {
    const result = resultMap.get(way.id);
    if (!result) continue;

    const tagIdx = way.tags.findIndex(t => t.k === 'road_type');
    if (tagIdx >= 0) way.tags[tagIdx].v = result.roadType;

    way.tags = way.tags.filter(t => !['sidewalk_left', 'sidewalk_right', 'ai_notes'].includes(t.k));
    way.tags.push(
      { k: 'sidewalk_left', v: result.sidewalk.left ? 'yes' : 'no' },
      { k: 'sidewalk_right', v: result.sidewalk.right ? 'yes' : 'no' },
      { k: 'ai_notes', v: result.notes },
    );
  }
}
