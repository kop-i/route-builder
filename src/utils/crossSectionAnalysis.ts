/**
 * 횡단면 분석 (Cross-Section Analysis)
 *
 * [핵심 원리]
 * 차도의 한 지점에서 수직으로 위성 이미지를 잘라
 * Claude에게 "도로 중심에서 인도까지 몇 픽셀?"을 질문.
 * pixel → meter 변환하여 정확한 offset 거리를 측정.
 *
 * [정밀도]
 * zoom 19에서 1px ≈ 0.3m → 3px 오차 = 약 1m 오차
 * 고정 테이블(13m, 10m...)보다 실제 도로에 맞는 offset 생성 가능
 *
 * [비용 최적화]
 * 차도 1개당 1~2개 샘플만 분석 (도로 중간 지점)
 * 한 청크에 여러 횡단면을 모아 1번의 API 호출로 처리
 */
import type { SatelliteChunk } from './satelliteCapture';
import type { MainRoadGeometry } from './pathGenerator';

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const API_URL = 'https://api.anthropic.com/v1/messages';

// zoom 19에서 적도 기준 1px ≈ 0.298m, 서울(37.5°) 기준 약 0.237m
// 하지만 위성 타일 3×3 = 768px = 약 225m → 1px ≈ 0.293m
const METERS_PER_PIXEL = 0.293;

/** 횡단면 분석 결과: 도로 1개의 인도 offset */
export interface CrossSectionResult {
  osmWayId: number;
  /** 좌측 인도까지 거리 (미터). 0이면 인도 없음 */
  leftOffsetM: number;
  /** 우측 인도까지 거리 (미터). 0이면 인도 없음 */
  rightOffsetM: number;
  /** 인도 존재 여부 */
  hasSidewalk: boolean;
}

/**
 * 차도 목록을 위성 이미지 위에 표시하고,
 * Claude에게 각 도로의 인도까지 거리를 질문
 *
 * [방법]
 * 1. 위성 이미지에 차도 centerline을 빨간 선으로 그림 (번호 라벨)
 * 2. Claude에게 이미지를 보내고:
 *    "각 빨간 선(도로)에서 인도까지의 거리를 픽셀로 추정하세요"
 * 3. pixel × METERS_PER_PIXEL = 실제 미터 거리
 *
 * @param chunk 위성 청크
 * @param imageBase64 위성 이미지 (base64)
 * @param roadsInChunk 이 청크 영역에 포함된 차도 목록
 */
export async function analyzeCrossSections(
  chunk: SatelliteChunk,
  imageBase64: string,
  roadsInChunk: MainRoadGeometry[],
): Promise<CrossSectionResult[]> {
  if (roadsInChunk.length === 0) return [];

  const { north, south, east, west } = chunk.bounds;
  const imgWidth = chunk.cols * 256;
  const imgHeight = chunk.rows * 256;

  // Canvas에 위성 이미지 + 도로 표시를 그리기
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

  // 좌표 → 픽셀 변환 함수
  const toPixel = (lat: number, lon: number) => ({
    x: ((lon - west) / (east - west)) * imgWidth,
    y: ((north - lat) / (north - south)) * imgHeight,
  });

  // 도로 centerline을 빨간 선으로 그리기 (번호 라벨 포함)
  const roadInfos: string[] = [];
  roadsInChunk.forEach((road, idx) => {
    const num = idx + 1;

    // 도로 선 그리기
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const coords = road.coords;
    for (let i = 0; i < coords.length; i++) {
      const p = toPixel(coords[i].lat, coords[i].lon);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // 도로 중간 지점에 번호 라벨
    const midIdx = Math.floor(coords.length / 2);
    const midP = toPixel(coords[midIdx].lat, coords[midIdx].lon);
    ctx.fillStyle = 'yellow';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(`${num}`, midP.x + 5, midP.y - 5);

    roadInfos.push(`도로 ${num}: ${road.highway} (OSM ID: ${road.osmWayId})`);
  });

  const annotatedBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

  // Claude에게 횡단면 분석 요청
  const prompt = `당신은 한국 도심의 위성사진에서 도로 폭과 인도 위치를 측정하는 전문가입니다.

이 위성사진에 **빨간 선**으로 ${roadsInChunk.length}개의 도로 중심선을 표시했습니다.
각 도로에 번호가 붙어 있습니다.

**이미지 축척: 1 pixel ≈ ${METERS_PER_PIXEL.toFixed(2)} m**

**도로 목록:**
${roadInfos.join('\n')}

**작업:** 각 도로(빨간 선)에 대해:
1. 빨간 선(도로 중심)에서 **좌측 인도 중심**까지 거리를 **픽셀 수**로 추정하세요
2. 빨간 선(도로 중심)에서 **우측 인도 중심**까지 거리를 **픽셀 수**로 추정하세요
3. 인도가 보이지 않는 쪽은 0으로 표시하세요

**추정 기준:**
- 인도 = 차도 옆에 있는 보행자 통로 (회색/갈색 포장, 보도블록)
- 차도 경계(연석)가 보이면 그 바깥쪽이 인도입니다
- 건물 벽까지가 아니라 **인도의 중심**까지 거리입니다

**응답 형식:** JSON만 반환하세요.
\`\`\`json
{
  "roads": [
    {"id": 1, "left_px": 35, "right_px": 38, "notes": "양쪽 인도 뚜렷"},
    {"id": 2, "left_px": 25, "right_px": 0, "notes": "우측은 건물 벽, 인도 없음"}
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
        model: 'claude-haiku-4-5-20251001',
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
      console.warn(`⚠️ Claude API 오류 (${response.status})`);
      return roadsInChunk.map(r => fallbackResult(r.osmWayId, r.highway));
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      return roadsInChunk.map(r => fallbackResult(r.osmWayId, r.highway));
    }

    const parsed = JSON.parse(jsonMatch[1]);
    const roadResults = parsed.roads as { id: number; left_px: number; right_px: number; notes?: string }[];

    return roadsInChunk.map((road, idx) => {
      const aiResult = roadResults?.find(r => r.id === idx + 1);
      if (!aiResult) return fallbackResult(road.osmWayId, road.highway);

      const leftM = (aiResult.left_px || 0) * METERS_PER_PIXEL;
      const rightM = (aiResult.right_px || 0) * METERS_PER_PIXEL;

      console.log(`📏 도로 ${idx + 1} (${road.highway}): L=${leftM.toFixed(1)}m, R=${rightM.toFixed(1)}m — ${aiResult.notes || ''}`);

      return {
        osmWayId: road.osmWayId,
        leftOffsetM: leftM,
        rightOffsetM: rightM,
        hasSidewalk: leftM > 0 || rightM > 0,
      };
    });
  } catch (err) {
    console.warn('⚠️ 횡단면 분석 실패:', err);
    return roadsInChunk.map(r => fallbackResult(r.osmWayId, r.highway));
  }
}

/** API 실패 시 도로 유형 기반 기본값 */
function fallbackResult(osmWayId: number, highway: string): CrossSectionResult {
  const defaults: Record<string, number> = {
    primary: 13, secondary: 10, tertiary: 7.5, residential: 5.5,
  };
  const offset = defaults[highway.replace('_link', '')] || 6;
  return { osmWayId, leftOffsetM: offset, rightOffsetM: offset, hasSidewalk: true };
}

/**
 * 차도를 청크별로 그룹화
 * (각 차도의 중간점이 어느 청크에 속하는지 판별)
 */
export function groupRoadsByChunk(
  mainRoads: MainRoadGeometry[],
  chunks: SatelliteChunk[],
): Map<number, MainRoadGeometry[]> {
  const result = new Map<number, MainRoadGeometry[]>();

  for (const road of mainRoads) {
    // 도로 중간점
    const midIdx = Math.floor(road.coords.length / 2);
    const mid = road.coords[midIdx];

    // 어느 청크에 속하는지
    for (const chunk of chunks) {
      if (mid.lat >= chunk.bounds.south && mid.lat <= chunk.bounds.north &&
          mid.lon >= chunk.bounds.west && mid.lon <= chunk.bounds.east) {
        if (!result.has(chunk.index)) result.set(chunk.index, []);
        result.get(chunk.index)!.push(road);
        break;
      }
    }
  }

  return result;
}
