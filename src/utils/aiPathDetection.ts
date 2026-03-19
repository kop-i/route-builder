/**
 * AI 기반 도로 분류 (Claude Vision API)
 *
 * [역할]
 * 1. 차도 옆 인도 유무 확인 (양쪽/한쪽/없음)
 * 2. 중앙선 유무 확인 → OSM에서 이면도로로 분류된 도로가
 *    실제로는 중앙선이 있는 차도인지 검증
 */
import type { SatelliteChunk } from './satelliteCapture';

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const API_URL = 'https://api.anthropic.com/v1/messages';

/** AI 분류 결과 */
export interface RoadClassification {
  /** 차도 옆 인도 유무 */
  mainRoadSidewalks: 'both' | 'left' | 'right' | 'none';
  /** 중앙선이 있는데 이면도로로 잘못 분류된 도로가 보이는지 */
  hasHiddenMainRoads: boolean;
  /** 메모 */
  notes: string;
}

/**
 * 위성 이미지를 보고 도로 특성을 분류
 */
export async function classifyRoadsInChunk(
  chunk: SatelliteChunk,
  imageBase64: string
): Promise<RoadClassification> {
  const { north, south, east, west } = chunk.bounds;

  const prompt = `당신은 한국 도심의 위성사진을 분석하여 도로 특성을 판별하는 전문가입니다.

**이미지 범위:** 위도 ${south.toFixed(6)}~${north.toFixed(6)}, 경도 ${west.toFixed(6)}~${east.toFixed(6)}

**질문 1: 큰 도로(차도) 옆에 인도(보도)가 보이나요?**
- "both": 도로 양쪽에 인도 있음
- "left": 한쪽에만 인도
- "right": 한쪽에만 인도
- "none": 인도 안 보임

**질문 2: 좁은 도로 중에 중앙선(노란색 실선/점선)이 있는 도로가 보이나요?**
한국에서는 폭이 좁아도 중앙선이 있으면 차도입니다. 중앙선이 있는데 골목처럼 보이는 도로가 있으면 true.

**응답 형식:** JSON만 반환하세요.
\`\`\`json
{
  "mainRoadSidewalks": "both" 또는 "left" 또는 "right" 또는 "none",
  "hasHiddenMainRoads": true 또는 false,
  "notes": "관찰 메모"
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
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.warn(`⚠️ Claude API 오류 (${response.status})`);
      return { mainRoadSidewalks: 'both', hasHiddenMainRoads: false, notes: 'API 오류' };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*?\})/);

    if (!jsonMatch) {
      return { mainRoadSidewalks: 'both', hasHiddenMainRoads: false, notes: 'JSON 파싱 실패' };
    }

    const parsed = JSON.parse(jsonMatch[1]);
    return {
      mainRoadSidewalks: parsed.mainRoadSidewalks ?? 'both',
      hasHiddenMainRoads: parsed.hasHiddenMainRoads ?? false,
      notes: parsed.notes ?? '',
    };
  } catch (err) {
    console.warn('⚠️ AI 분류 실패:', err);
    return { mainRoadSidewalks: 'both', hasHiddenMainRoads: false, notes: '예외' };
  }
}

// 기존 호환성을 위한 래퍼 (hybridPipeline에서 사용)
export async function classifySidewalksInChunk(
  chunk: SatelliteChunk,
  imageBase64: string
) {
  const result = await classifyRoadsInChunk(chunk, imageBase64);
  return {
    hasSidewalks: result.mainRoadSidewalks !== 'none',
    mainRoadSidewalks: result.mainRoadSidewalks,
    hasHiddenMainRoads: result.hasHiddenMainRoads,
    notes: result.notes,
  };
}
