/**
 * 네이버 위성 타일 캡처
 *
 * [핵심 발견]
 * - 네이버 위성 타일: nrbe.map.naver.net/styles/satellite/{version}/{zoom}/{x}/{y}@2x.png
 * - crossOrigin: anonymous → Canvas toDataURL() 가능
 * - 512x512 레티나 타일
 *
 * [방식]
 * 1. 현재 DOM에서 위성 타일 URL의 version 번호 추출
 * 2. polygon 영역의 타일 좌표 계산
 * 3. 타일을 Canvas에 합성하여 base64 반환
 */

// 타일 좌표 변환 (Slippy Map Tilenames)
function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

function tileToLatLng(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const n = Math.pow(2, zoom);
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

/** DOM에서 네이버 위성 타일의 version 번호 추출 */
function extractNaverTileVersion(): string {
  const imgs = document.querySelectorAll('img[src*="satellite"]');
  for (const img of imgs) {
    const src = (img as HTMLImageElement).src;
    const match = src.match(/satellite\/(\d+)\//);
    if (match) return match[1];
  }
  // 기본값 (fallback)
  return '1773365648';
}

/** 위성 캡처 결과 */
export interface SatelliteImage {
  imageBase64: string;
  bounds: { north: number; south: number; east: number; west: number };
  centerLat: number;
  centerLon: number;
  pixelWidth: number;
  pixelHeight: number;
}

/**
 * polygon 영역의 네이버 위성 이미지를 캡처
 *
 * @param polygon 서비스 면적 꼭짓점
 * @param zoom 줌 레벨 (기본 17 — 네이버 기본 줌)
 * @param chunkSize 청크당 타일 수 (기본 4 = 4×4 타일)
 * @param onProgress 진행 콜백
 */
export async function captureNaverSatelliteImages(
  polygon: { lat: number; lng: number }[],
  zoom = 17,
  chunkSize = 4,
  onProgress?: (done: number, total: number) => void,
): Promise<SatelliteImage[]> {
  const version = extractNaverTileVersion();
  console.log(`📸 네이버 위성 타일 version: ${version}, zoom: ${zoom}`);

  // polygon bbox → 타일 범위
  const lats = polygon.map(p => p.lat);
  const lngs = polygon.map(p => p.lng);
  const topLeft = latLngToTile(Math.max(...lats), Math.min(...lngs), zoom);
  const bottomRight = latLngToTile(Math.min(...lats), Math.max(...lngs), zoom);

  // 청크 분할
  const chunks: { startX: number; startY: number; endX: number; endY: number }[] = [];
  for (let y = topLeft.y; y <= bottomRight.y; y += chunkSize) {
    for (let x = topLeft.x; x <= bottomRight.x; x += chunkSize) {
      chunks.push({
        startX: x,
        startY: y,
        endX: Math.min(x + chunkSize - 1, bottomRight.x),
        endY: Math.min(y + chunkSize - 1, bottomRight.y),
      });
    }
  }

  console.log(`📦 ${chunks.length}개 위성 청크 (${topLeft.x}~${bottomRight.x}, ${topLeft.y}~${bottomRight.y})`);

  const results: SatelliteImage[] = [];

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i + 1, chunks.length);
    const chunk = chunks[i];
    const cols = chunk.endX - chunk.startX + 1;
    const rows = chunk.endY - chunk.startY + 1;

    // Canvas에 타일 합성
    const tileSize = 256; // 512/2 (2x 타일을 256으로 축소)
    const canvas = document.createElement('canvas');
    canvas.width = cols * tileSize;
    canvas.height = rows * tileSize;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 타일 로드
    const promises: Promise<void>[] = [];
    for (let ty = chunk.startY; ty <= chunk.endY; ty++) {
      for (let tx = chunk.startX; tx <= chunk.endX; tx++) {
        const col = tx - chunk.startX;
        const row = ty - chunk.startY;
        const url = `https://nrbe.map.naver.net/styles/satellite/${version}/${zoom}/${tx}/${ty}@2x.png?mt=bg`;

        promises.push(new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            ctx.drawImage(img, col * tileSize, row * tileSize, tileSize, tileSize);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        }));
      }
    }

    await Promise.all(promises);

    // 지리적 범위 계산
    const nw = tileToLatLng(chunk.startX, chunk.startY, zoom);
    const se = tileToLatLng(chunk.endX + 1, chunk.endY + 1, zoom);

    try {
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      results.push({
        imageBase64,
        bounds: { north: nw.lat, south: se.lat, east: se.lng, west: nw.lng },
        centerLat: (nw.lat + se.lat) / 2,
        centerLon: (nw.lng + se.lng) / 2,
        pixelWidth: canvas.width,
        pixelHeight: canvas.height,
      });
    } catch (e) {
      console.warn(`⚠️ 청크 ${i + 1} Canvas 캡처 실패:`, e);
    }
  }

  return results;
}
