/**
 * 위성 타일 캡처 유틸리티
 *
 * [목적] 서비스 면적의 위성 이미지를 타일별로 가져와서
 * AI 분석에 사용할 수 있도록 base64 인코딩된 이미지로 변환
 *
 * [전략] zoom 19 고정밀 모드
 * - 1타일 = 약 75m × 75m
 * - 3×3 묶음 = 약 225m × 225m (AI 분석 단위)
 * - 각 청크에 지리적 좌표 범위 첨부 → AI가 lat/lng으로 경로 반환 가능
 */
import type { LatLng } from '@/types/osm';

const VWORLD_API_KEY = import.meta.env.VITE_VWORLD_API_KEY;
const ZOOM = 19; // 고정밀 모드

// ============================================
// 타일 좌표 변환 (Slippy Map Tilenames)
// ============================================

/** WGS84 좌표 → 타일 번호 (zoom level 기반) */
function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

/** 타일 번호 → 타일의 북서(NW) 꼭짓점 좌표 */
function tileToLatLng(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const n = Math.pow(2, zoom);
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

// ============================================
// 위성 타일 청크 생성
// ============================================

/** AI 분석 단위: 여러 타일을 묶은 청크 */
export interface SatelliteChunk {
  /** 청크 인덱스 */
  index: number;
  /** 지리적 범위 (AI에게 전달) */
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  /** 포함된 타일 목록 */
  tiles: { x: number; y: number; url: string }[];
  /** 청크 크기 (타일 수) */
  cols: number;
  rows: number;
  /** base64 인코딩된 합성 이미지 (캡처 후 채워짐) */
  imageBase64?: string;
}

/**
 * 서비스 면적을 AI 분석용 위성 타일 청크로 분할
 *
 * @param polygon 서비스 면적 꼭짓점
 * @param chunkSize 청크당 타일 수 (기본 3 = 3×3)
 * @returns 청크 배열 (각 청크에 타일 URL과 좌표 범위 포함)
 */
export function createSatelliteChunks(
  polygon: LatLng[],
  chunkSize = 3
): SatelliteChunk[] {
  // polygon의 bounding box 계산
  const lats = polygon.map((p) => p.lat);
  const lngs = polygon.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // bounding box → 타일 범위
  const topLeft = latLngToTile(maxLat, minLng, ZOOM);
  const bottomRight = latLngToTile(minLat, maxLng, ZOOM);

  const tileMinX = topLeft.x;
  const tileMaxX = bottomRight.x;
  const tileMinY = topLeft.y;
  const tileMaxY = bottomRight.y;

  const chunks: SatelliteChunk[] = [];
  let chunkIdx = 0;

  // chunkSize × chunkSize 단위로 묶기
  for (let startY = tileMinY; startY <= tileMaxY; startY += chunkSize) {
    for (let startX = tileMinX; startX <= tileMaxX; startX += chunkSize) {
      const endX = Math.min(startX + chunkSize - 1, tileMaxX);
      const endY = Math.min(startY + chunkSize - 1, tileMaxY);

      const tiles: { x: number; y: number; url: string }[] = [];
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          tiles.push({
            x,
            y,
            url: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Satellite/${ZOOM}/${y}/${x}.jpeg`,
          });
        }
      }

      // 청크의 지리적 범위 계산
      const nw = tileToLatLng(startX, startY, ZOOM);
      const se = tileToLatLng(endX + 1, endY + 1, ZOOM);

      chunks.push({
        index: chunkIdx++,
        bounds: {
          north: nw.lat,
          south: se.lat,
          east: se.lng,
          west: nw.lng,
        },
        tiles,
        cols: endX - startX + 1,
        rows: endY - startY + 1,
      });
    }
  }

  return chunks;
}

/**
 * 청크의 타일들을 하나의 이미지로 합성하여 base64 반환
 * Canvas API를 사용하여 타일을 스티칭
 */
export async function stitchChunkToBase64(chunk: SatelliteChunk): Promise<string> {
  const tileSize = 256;
  const width = chunk.cols * tileSize;
  const height = chunk.rows * tileSize;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // 배경을 회색으로 (로드 실패 타일 대비)
  ctx.fillStyle = '#cccccc';
  ctx.fillRect(0, 0, width, height);

  // 타일 로드 및 그리기
  const loadPromises = chunk.tiles.map((tile, idx) => {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const col = idx % chunk.cols;
        const row = Math.floor(idx / chunk.cols);
        ctx.drawImage(img, col * tileSize, row * tileSize, tileSize, tileSize);
        resolve();
      };
      img.onerror = () => {
        console.warn(`⚠️ 타일 로드 실패: ${tile.url}`);
        resolve(); // 실패해도 계속 진행
      };
      img.src = tile.url;
    });
  });

  await Promise.all(loadPromises);

  // Canvas → base64 JPEG (품질 0.85로 크기 최적화)
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

/**
 * 격자 오버레이가 포함된 위성 이미지 생성
 *
 * [격자 분류 방식]
 * - 위성 이미지 위에 GRID_SIZE × GRID_SIZE 격자를 그림
 * - 각 셀에 "A1", "A2" ... "T20" 같은 라벨을 부여
 * - Claude에게 이 이미지를 보내고 각 셀의 지표 유형을 분류하게 함
 *
 * @param chunk 위성 청크
 * @param gridSize 격자 크기 (기본 15×15)
 * @returns base64 이미지 + 격자 메타데이터
 */
export const GRID_SIZE = 15; // 15×15 격자 → 셀당 약 15m (225m / 15)

export interface GridMetadata {
  /** 격자 크기 (rows × cols) */
  rows: number;
  cols: number;
  /** 각 셀의 지리적 중심 좌표 */
  cells: {
    label: string;      // "A1", "B3" 등
    row: number;
    col: number;
    centerLat: number;
    centerLon: number;
    /** 셀의 지리적 범위 */
    north: number;
    south: number;
    east: number;
    west: number;
  }[];
}

/** 행 라벨 생성 (A~Z, 그 이후 AA, AB, ...) */
function rowLabel(row: number): string {
  if (row < 26) return String.fromCharCode(65 + row);
  return String.fromCharCode(65 + Math.floor(row / 26) - 1) + String.fromCharCode(65 + (row % 26));
}

/**
 * 격자가 오버레이된 위성 이미지 + 격자 메타데이터 반환
 */
export async function stitchChunkWithGrid(
  chunk: SatelliteChunk,
  gridSize = GRID_SIZE
): Promise<{ imageBase64: string; grid: GridMetadata }> {
  const tileSize = 256;
  const width = chunk.cols * tileSize;
  const height = chunk.rows * tileSize;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // 배경
  ctx.fillStyle = '#cccccc';
  ctx.fillRect(0, 0, width, height);

  // 타일 로드
  const loadPromises = chunk.tiles.map((tile, idx) => {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const col = idx % chunk.cols;
        const row = Math.floor(idx / chunk.cols);
        ctx.drawImage(img, col * tileSize, row * tileSize, tileSize, tileSize);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = tile.url;
    });
  });
  await Promise.all(loadPromises);

  // === 격자 오버레이 그리기 ===
  const cellW = width / gridSize;
  const cellH = height / gridSize;

  // 격자 선 (반투명 노란색)
  ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridSize; i++) {
    // 수직선
    ctx.beginPath();
    ctx.moveTo(i * cellW, 0);
    ctx.lineTo(i * cellW, height);
    ctx.stroke();
    // 수평선
    ctx.beginPath();
    ctx.moveTo(0, i * cellH);
    ctx.lineTo(width, i * cellH);
    ctx.stroke();
  }

  // 셀 라벨 (좌상단에 작은 텍스트)
  ctx.font = `${Math.max(8, Math.floor(cellW / 5))}px Arial`;
  ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
  ctx.textBaseline = 'top';

  const cells: GridMetadata['cells'] = [];
  const { north, south, east, west } = chunk.bounds;
  const latStep = (north - south) / gridSize;
  const lonStep = (east - west) / gridSize;

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const label = `${rowLabel(r)}${c + 1}`;

      // 라벨 그리기
      ctx.fillText(label, c * cellW + 2, r * cellH + 1);

      // 셀 지리적 범위 계산
      const cellNorth = north - r * latStep;
      const cellSouth = north - (r + 1) * latStep;
      const cellWest = west + c * lonStep;
      const cellEast = west + (c + 1) * lonStep;

      cells.push({
        label,
        row: r,
        col: c,
        centerLat: (cellNorth + cellSouth) / 2,
        centerLon: (cellWest + cellEast) / 2,
        north: cellNorth,
        south: cellSouth,
        east: cellEast,
        west: cellWest,
      });
    }
  }

  const imageBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

  return {
    imageBase64,
    grid: { rows: gridSize, cols: gridSize, cells },
  };
}
