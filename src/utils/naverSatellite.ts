/**
 * 네이버 Static Map API로 위성 이미지 캡처
 *
 * [핵심] vworld 타일 대신 네이버 위성 이미지를 사용
 * - vworld: CORS 이슈 + 일부 줌레벨에서 이미지 없음 → AI에 빈 이미지 전달
 * - 네이버: REST API로 직접 fetch → base64로 안정적 변환 가능
 *
 * API: https://maps.apigw.ntruss.com/map-static/v2/raster
 * 인증: x-ncp-apigw-api-key-id + x-ncp-apigw-api-key (Client ID + Secret)
 */

const CLIENT_ID = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_NAVER_MAP_CLIENT_SECRET;
const STATIC_MAP_URL = 'https://naveropenapi.apigw.ntruss.com/map-static/v2/raster';

/**
 * 특정 영역의 네이버 위성 이미지를 base64로 가져오기
 *
 * @param centerLat 중심 위도
 * @param centerLon 중심 경도
 * @param zoom 줌 레벨 (1-20, 기본 18)
 * @param width 이미지 너비 (px, 최대 1024)
 * @param height 이미지 높이 (px, 최대 1024)
 * @returns base64 인코딩된 위성 이미지
 */
export async function fetchNaverSatelliteImage(
  centerLat: number,
  centerLon: number,
  zoom = 18,
  width = 800,
  height = 600,
): Promise<string> {
  const params = new URLSearchParams({
    center: `${centerLon},${centerLat}`,
    level: String(zoom),
    w: String(width),
    h: String(height),
    maptype: 'satellite',
    format: 'jpg',
  });

  const url = `${STATIC_MAP_URL}?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      'x-ncp-apigw-api-key-id': CLIENT_ID,
      'x-ncp-apigw-api-key': CLIENT_SECRET,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`네이버 Static Map API 오류 (${response.status}): ${text}`);
  }

  // Blob → base64
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // "data:image/jpeg;base64,..." → base64 부분만
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 서비스 면적을 여러 영역으로 나눠 위성 이미지를 가져오기
 *
 * @param polygon 서비스 면적 꼭짓점
 * @param onProgress 진행 콜백
 * @returns { centerLat, centerLon, imageBase64, bounds }[] 배열
 */
export async function fetchSatelliteImagesForArea(
  polygon: { lat: number; lng: number }[],
  onProgress?: (done: number, total: number) => void,
): Promise<{
  centerLat: number;
  centerLon: number;
  imageBase64: string;
  bounds: { north: number; south: number; east: number; west: number };
}[]> {
  // polygon의 bounding box
  const lats = polygon.map(p => p.lat);
  const lngs = polygon.map(p => p.lng);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);

  // zoom 18에서 800x600 이미지는 약 300m x 225m 커버
  // 영역을 겹침 없이 분할
  const stepLat = 0.002;  // 약 220m
  const stepLon = 0.003;  // 약 265m

  const images: {
    centerLat: number;
    centerLon: number;
    imageBase64: string;
    bounds: { north: number; south: number; east: number; west: number };
  }[] = [];

  const centers: { lat: number; lon: number }[] = [];
  for (let lat = south + stepLat / 2; lat < north; lat += stepLat) {
    for (let lon = west + stepLon / 2; lon < east; lon += stepLon) {
      centers.push({ lat, lon });
    }
  }

  console.log(`📸 ${centers.length}개 위성 이미지 캡처 예정`);

  for (let i = 0; i < centers.length; i++) {
    const { lat, lon } = centers[i];
    onProgress?.(i + 1, centers.length);

    try {
      const imageBase64 = await fetchNaverSatelliteImage(lat, lon, 18, 800, 600);
      images.push({
        centerLat: lat,
        centerLon: lon,
        imageBase64,
        bounds: {
          north: lat + stepLat / 2,
          south: lat - stepLat / 2,
          east: lon + stepLon / 2,
          west: lon - stepLon / 2,
        },
      });
    } catch (err) {
      console.warn(`⚠️ 이미지 캡처 실패 (${lat.toFixed(4)}, ${lon.toFixed(4)}):`, err);
    }

    // rate limit 대비
    if (i < centers.length - 1) await new Promise(r => setTimeout(r, 200));
  }

  return images;
}
