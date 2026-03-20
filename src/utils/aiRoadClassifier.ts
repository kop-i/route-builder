/**
 * AI 도로 분석기 v4 — Sonnet + 종합 분석
 *
 * [Step 2의 3가지 역할]
 * 1. 도로 재분류: OSM이 잘못 분류한 이면도로↔차도 수정
 * 2. 인도 발견: 각 도로 옆에 인도가 있는지 (좌/우/양쪽/없음)
 * 3. 건널목 발견: 교차로에 횡단보도가 있는지
 *
 * [결과물] 각 도로에 대한 상세 분석 리포트
 * → Step 3에서 인도 경로 생성에 활용
 */
import type { OsmWay } from '@/types/osm';
import type { SatelliteImage } from './naverSatellite';

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const API_URL = 'https://api.anthropic.com/v1/messages';

/** 도로 분석에 필요한 정보 */
export interface RoadForAnalysis {
  wayId: number;
  coords: { lat: number; lon: number }[];
  currentType: string;
}

/** AI 분석 결과 — 도로 1개에 대한 상세 리포트 */
export interface RoadAnalysisResult {
  wayId: number;
  /** 도로 유형 재분류 */
  roadType: 'sideroad' | 'road' | 'crosswalk';
  /** 인도 유무 (Step 3에서 인도 경로 생성에 사용) */
  sidewalk: {
    left: boolean;   // 진행 방향 기준 좌측
    right: boolean;  // 진행 방향 기준 우측
  };
  /** AI 분석 메모 */
  notes: string;
}

/**
 * 위성 이미지에 도로를 표시하고 Sonnet으로 종합 분석
 */
export async function analyzeRoadsOnSatelliteImage(
  satImage: SatelliteImage,
  roads: RoadForAnalysis[],
): Promise<RoadAnalysisResult[]> {
  if (roads.length === 0) return [];

  const { north, south, east, west } = satImage.bounds;

  // Canvas: 위성 이미지 + 도로 표시
  const canvas = document.createElement('canvas');
  canvas.width = satImage.pixelWidth;
  canvas.height = satImage.pixelHeight;
  const ctx = canvas.getContext('2d')!;

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

  // 최대 12개 도로만 한 번에 (Sonnet 토큰 효율)
  const batch = roads.slice(0, 12);

  batch.forEach((road, idx) => {
    ctx.strokeStyle = 'rgba(255, 50, 50, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    road.coords.forEach((c, i) => {
      const p = toPixel(c.lat, c.lon);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    const midIdx = Math.floor(road.coords.length / 2);
    const midP = toPixel(road.coords[midIdx].lat, road.coords[midIdx].lon);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(midP.x - 3, midP.y - 18, 24, 20);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(`${idx + 1}`, midP.x, midP.y - 2);
  });

  const annotatedBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];

  const prompt = `당신은 한국 도심의 위성사진을 분석하여 도로 유형과 인도(보도) 유무를 판별하는 전문가입니다.

이 위성사진에 ${batch.length}개의 도로를 빨간 선(번호 포함)으로 표시했습니다.

**각 도로에 대해 세 가지를 분석하세요:**

**1. 도로 유형 (type)**
- "S" = 이면도로: 중앙분리선(노란 실선/점선)이 없는 좁은 도로. 골목길, 주택가 도로.
- "R" = 차도: 중앙분리선이 있거나, 왕복 2차선 이상의 넓은 도로. 대로, 간선도로.
- "X" = 건널목: 횡단보도가 보이는 구간 (흰색 줄무늬).

**2. 인도(보도) 유무 (sidewalk)**
- 도로 양쪽에 인도(보행자 통로)가 보이는지 확인하세요.
- 인도는 차도 옆에 있는 회색/갈색 포장 영역, 보도블록 등입니다.
- "left": 도로 시작점→끝점 방향 기준 왼쪽에 인도가 있는가 (true/false)
- "right": 오른쪽에 인도가 있는가 (true/false)

**3. 관찰 메모 (notes)**
- 특이사항, 공사 중, 주차 차량으로 인도가 가려진 경우 등

**중요 판별 기준:**
- 넓고 직선인 도로 = 대부분 차도(R)
- 좁고 굽은 도로 = 대부분 이면도로(S)
- 위성사진에서 흰색 줄무늬가 보이면 = 건널목(X)
- 차도(R) 옆에는 대부분 인도가 있음
- 이면도로(S) 옆에는 인도가 없는 경우가 많음

**응답 형식:** JSON만 반환하세요.
\`\`\`json
{
  "roads": [
    {"id": 1, "type": "S", "sidewalk": {"left": false, "right": false}, "notes": "좁은 골목길"},
    {"id": 2, "type": "R", "sidewalk": {"left": true, "right": true}, "notes": "왕복 4차선, 양쪽 넓은 인도"},
    {"id": 3, "type": "X", "sidewalk": {"left": false, "right": false}, "notes": "횡단보도 확인"}
  ]
}
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
        max_tokens: 2048,
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
      const errText = await response.text();
      console.warn(`⚠️ AI 분석 실패 (${response.status}):`, errText);
      return batch.map(r => defaultResult(r.wayId));
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      console.warn('⚠️ JSON 파싱 실패');
      return batch.map(r => defaultResult(r.wayId));
    }

    const parsed = JSON.parse(jsonMatch[1]);
    const results: RoadAnalysisResult[] = [];

    for (const r of (parsed.roads || [])) {
      const idx = (r.id || 0) - 1;
      if (idx < 0 || idx >= batch.length) continue;

      results.push({
        wayId: batch[idx].wayId,
        roadType: r.type === 'R' ? 'road' : r.type === 'X' ? 'crosswalk' : 'sideroad',
        sidewalk: {
          left: r.sidewalk?.left ?? false,
          right: r.sidewalk?.right ?? false,
        },
        notes: r.notes || '',
      });
    }

    // 미분석 도로 기본값
    for (const road of batch) {
      if (!results.find(r => r.wayId === road.wayId)) {
        results.push(defaultResult(road.wayId));
      }
    }

    return results;
  } catch (err) {
    console.warn('⚠️ AI 분석 예외:', err);
    return batch.map(r => defaultResult(r.wayId));
  }
}

function defaultResult(wayId: number): RoadAnalysisResult {
  return { wayId, roadType: 'sideroad', sidewalk: { left: false, right: false }, notes: '분석 실패' };
}

/** 분석 결과를 ways의 road_type 태그에 적용 */
export function applyAnalysisResults(
  ways: OsmWay[],
  results: RoadAnalysisResult[]
): void {
  const resultMap = new Map(results.map(r => [r.wayId, r]));
  for (const way of ways) {
    const result = resultMap.get(way.id);
    if (!result) continue;

    // road_type 업데이트
    const tagIdx = way.tags.findIndex(t => t.k === 'road_type');
    if (tagIdx >= 0) way.tags[tagIdx].v = result.roadType;

    // 인도 정보 태그 추가 (Step 3에서 활용)
    way.tags = way.tags.filter(t => t.k !== 'sidewalk_left' && t.k !== 'sidewalk_right' && t.k !== 'ai_notes');
    way.tags.push(
      { k: 'sidewalk_left', v: result.sidewalk.left ? 'yes' : 'no' },
      { k: 'sidewalk_right', v: result.sidewalk.right ? 'yes' : 'no' },
      { k: 'ai_notes', v: result.notes },
    );
  }
}
