/**
 * AI 도로 분류기 v2 — 네이버 위성 이미지 기반
 *
 * [변경] vworld 타일 → 네이버 Static Map API
 * - CORS 이슈 해결
 * - 선명한 위성 이미지로 분류 정확도 향상
 */
import type { OsmWay, OsmNode } from '@/types/osm';
import { fetchNaverSatelliteImage } from './naverSatellite';

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * 도로 그룹을 위성 이미지 위에 표시하고 AI로 분류
 *
 * @param roads 분류할 도로들 (wayId + 좌표)
 * @param centerLat 영역 중심 위도
 * @param centerLon 영역 중심 경도
 * @param bounds 영역 범위
 */
export async function classifyRoadsWithNaverSatellite(
  roads: { wayId: number; coords: { lat: number; lon: number }[] }[],
  centerLat: number,
  centerLon: number,
  bounds: { north: number; south: number; east: number; west: number },
): Promise<Map<number, 'sideroad' | 'road'>> {
  if (roads.length === 0) return new Map();

  // 네이버 위성 이미지 가져오기
  const imageBase64 = await fetchNaverSatelliteImage(centerLat, centerLon, 18, 800, 600);

  // Canvas에 도로 그리기
  const imgWidth = 800;
  const imgHeight = 600;
  const canvas = document.createElement('canvas');
  canvas.width = imgWidth;
  canvas.height = imgHeight;
  const ctx = canvas.getContext('2d')!;

  // 위성 이미지 로드
  const img = new Image();
  await new Promise<void>((resolve) => {
    img.onload = () => { ctx.drawImage(img, 0, 0); resolve(); };
    img.onerror = () => resolve();
    img.src = `data:image/jpeg;base64,${imageBase64}`;
  });

  const { north, south, east, west } = bounds;
  const toPixel = (lat: number, lon: number) => ({
    x: ((lon - west) / (east - west)) * imgWidth,
    y: ((north - lat) / (north - south)) * imgHeight,
  });

  // 최대 15개씩 배치 처리
  const batch = roads.slice(0, 15);

  batch.forEach((road, idx) => {
    // 도로 선 그리기 (빨간색, 두꺼운 선)
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;
    ctx.beginPath();
    road.coords.forEach((c, i) => {
      const p = toPixel(c.lat, c.lon);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // 번호 라벨 (노란색 배경)
    const midIdx = Math.floor(road.coords.length / 2);
    const midP = toPixel(road.coords[midIdx].lat, road.coords[midIdx].lon);

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(midP.x - 2, midP.y - 14, 20, 16);
    ctx.fillStyle = 'yellow';
    ctx.font = 'bold 12px Arial';
    ctx.fillText(`${idx + 1}`, midP.x + 2, midP.y - 2);
  });

  const annotatedBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];

  // Claude에게 분류 요청
  const prompt = `이 위성사진에 ${batch.length}개의 도로를 빨간 선(번호 포함)으로 표시했습니다.

각 도로를 분류하세요:
- **S** = 이면도로: 중앙분리선(노란선)이 없고, 좁은 도로. 골목길, 주택가 도로, 1차선 도로.
- **R** = 차도: 중앙분리선이 있거나, 넓은 도로 (왕복 2차선 이상). 대로, 간선도로.

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
        model: 'claude-haiku-4-5-20251001',
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
      return new Map(batch.map(r => [r.wayId, 'sideroad' as const]));
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*?\})/);

    if (!jsonMatch) {
      return new Map(batch.map(r => [r.wayId, 'sideroad' as const]));
    }

    const parsed = JSON.parse(jsonMatch[1]);
    const result = new Map<number, 'sideroad' | 'road'>();

    for (const road of (parsed.roads || [])) {
      const wayIdx = (road.id || 0) - 1;
      if (wayIdx >= 0 && wayIdx < batch.length) {
        result.set(batch[wayIdx].wayId, road.type === 'R' ? 'road' : 'sideroad');
      }
    }

    for (const r of batch) {
      if (!result.has(r.wayId)) result.set(r.wayId, 'sideroad');
    }

    return result;
  } catch (err) {
    console.warn('⚠️ AI 분류 예외:', err);
    return new Map(batch.map(r => [r.wayId, 'sideroad' as const]));
  }
}

/** 분류 결과를 ways에 적용 */
export function applyClassification(
  ways: OsmWay[],
  classifications: Map<number, 'sideroad' | 'road'>
): void {
  for (const way of ways) {
    const roadType = classifications.get(way.id);
    if (roadType) {
      const tagIdx = way.tags.findIndex(t => t.k === 'road_type');
      if (tagIdx >= 0) way.tags[tagIdx].v = roadType;
    }
  }
}
