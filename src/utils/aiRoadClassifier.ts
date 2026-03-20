/**
 * AI 도로 분류기 v3 — 네이버 위성 타일 기반 (CORS 해결됨!)
 *
 * [핵심 변경]
 * - vworld (CORS 실패) → 네이버 위성 타일 (Canvas 캡처 성공 확인)
 * - 위성 이미지에 OSM 도로를 빨간 선으로 그린 후
 * - Claude에게 이면도로(S) / 차도(R) 분류 요청
 */
import type { OsmWay } from '@/types/osm';
import type { SatelliteImage } from './naverSatellite';

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const API_URL = 'https://api.anthropic.com/v1/messages';

/** 도로 + 좌표 정보 */
export interface RoadForClassification {
  wayId: number;
  coords: { lat: number; lon: number }[];
  currentType: string; // 현재 분류된 도로 유형
}

/**
 * 위성 이미지에 도로를 표시하고 Claude에게 분류 요청
 */
export async function classifyRoadsOnSatelliteImage(
  satImage: SatelliteImage,
  roads: RoadForClassification[],
): Promise<Map<number, 'sideroad' | 'road' | 'crosswalk'>> {
  if (roads.length === 0) return new Map();

  const { north, south, east, west } = satImage.bounds;

  // Canvas에 위성 이미지 + 도로 그리기
  const canvas = document.createElement('canvas');
  canvas.width = satImage.pixelWidth;
  canvas.height = satImage.pixelHeight;
  const ctx = canvas.getContext('2d')!;

  // 위성 이미지 로드
  const img = new Image();
  await new Promise<void>((resolve) => {
    img.onload = () => { ctx.drawImage(img, 0, 0); resolve(); };
    img.onerror = () => { ctx.fillStyle = '#333'; ctx.fillRect(0, 0, canvas.width, canvas.height); resolve(); };
    img.src = `data:image/jpeg;base64,${satImage.imageBase64}`;
  });

  const toPixel = (lat: number, lon: number) => ({
    x: ((lon - west) / (east - west)) * canvas.width,
    y: ((north - lat) / (north - south)) * canvas.height,
  });

  // 최대 15개 도로만 한 번에 분류
  const batch = roads.slice(0, 15);

  batch.forEach((road, idx) => {
    // 빨간 선으로 도로 그리기
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    road.coords.forEach((c, i) => {
      const p = toPixel(c.lat, c.lon);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // 번호 라벨
    const midIdx = Math.floor(road.coords.length / 2);
    const midP = toPixel(road.coords[midIdx].lat, road.coords[midIdx].lon);
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(midP.x - 2, midP.y - 16, 22, 18);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 13px Arial';
    ctx.fillText(`${idx + 1}`, midP.x + 1, midP.y - 2);
  });

  const annotatedBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];

  // Claude 분류 요청
  const prompt = `이 위성사진에 ${batch.length}개의 도로를 빨간 선(번호 포함)으로 표시했습니다.

각 도로를 아래 기준으로 분류하세요:
- **S** = 이면도로: 중앙분리선(노란 실선/점선)이 없고, 좁은 도로. 골목길, 주택가 도로, 1차선.
- **R** = 차도: 중앙분리선이 있거나, 왕복 2차선 이상의 넓은 도로.
- **X** = 건널목: 횡단보도가 보이는 구간.

중요: 위성사진에서 실제 도로 모습을 보고 판단하세요.

JSON만 반환:
\`\`\`json
{"roads":[{"id":1,"type":"S"},{"id":2,"type":"R"}]}
\`\`\``;

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
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: annotatedBase64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.warn(`⚠️ AI 분류 실패 (${response.status})`);
      return defaultMap(batch);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*?\})/);

    if (!jsonMatch) return defaultMap(batch);

    const parsed = JSON.parse(jsonMatch[1]);
    const result = new Map<number, 'sideroad' | 'road' | 'crosswalk'>();

    for (const r of (parsed.roads || [])) {
      const idx = (r.id || 0) - 1;
      if (idx >= 0 && idx < batch.length) {
        const type = r.type === 'R' ? 'road' : r.type === 'X' ? 'crosswalk' : 'sideroad';
        result.set(batch[idx].wayId, type);
      }
    }

    // 미분류 도로는 기본값
    for (const r of batch) {
      if (!result.has(r.wayId)) result.set(r.wayId, 'sideroad');
    }

    return result;
  } catch (err) {
    console.warn('⚠️ AI 분류 예외:', err);
    return defaultMap(batch);
  }
}

function defaultMap(batch: RoadForClassification[]): Map<number, 'sideroad' | 'road' | 'crosswalk'> {
  return new Map(batch.map(r => [r.wayId, 'sideroad']));
}

/** 분류 결과를 ways에 적용 */
export function applyClassification(
  ways: OsmWay[],
  classifications: Map<number, 'sideroad' | 'road' | 'crosswalk'>
): void {
  for (const way of ways) {
    const roadType = classifications.get(way.id);
    if (roadType) {
      const tagIdx = way.tags.findIndex(t => t.k === 'road_type');
      if (tagIdx >= 0) way.tags[tagIdx].v = roadType;
    }
  }
}
