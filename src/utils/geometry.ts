/**
 * 좌표 기하 유틸리티
 *
 * [핵심 기능] 도로 centerline에서 인도 경로를 offset(평행이동)으로 생성
 *
 * 원리:
 * - 도로의 각 구간(segment)에서 수직 방향을 계산
 * - 수직 방향으로 지정된 거리만큼 이동
 * - 한국 도심 인도 기준 약 2.5m offset
 *
 * 좌표계: WGS84 (위도/경도)
 * - 1도 위도 ≈ 111,000m
 * - 1도 경도 ≈ 111,000m × cos(위도) ≈ 88,000m (서울 기준)
 */

/** 위도/경도 좌표 */
interface Coord {
  lat: number;
  lon: number;
}

/** 서울 위도(37.5°) 기준 미터↔도 변환 상수 */
const LAT_DEG_TO_M = 111_000;
const LON_DEG_TO_M = 111_000 * Math.cos((37.5 * Math.PI) / 180); // ≈ 88,000

/**
 * 두 좌표 사이의 거리 (미터)
 */
export function distanceMeters(a: Coord, b: Coord): number {
  const dlat = (b.lat - a.lat) * LAT_DEG_TO_M;
  const dlon = (b.lon - a.lon) * LON_DEG_TO_M;
  return Math.sqrt(dlat * dlat + dlon * dlon);
}

/**
 * polyline을 왼쪽 또는 오른쪽으로 offsetMeters만큼 평행이동
 *
 * @param coords 원본 polyline 좌표 배열
 * @param offsetMeters 이동 거리 (양수=왼쪽, 음수=오른쪽, 진행 방향 기준)
 * @returns 평행이동된 좌표 배열
 *
 * [알고리즘]
 * 1. 각 segment의 방향 벡터를 구함
 * 2. 방향 벡터를 90° 회전 → 수직 벡터
 * 3. 수직 벡터 방향으로 offsetMeters만큼 이동
 * 4. 꼭짓점은 인접 두 segment의 offset 선분의 교점으로 결정
 *    (단순화: 인접 두 offset의 평균 사용)
 */
export function offsetPolyline(coords: Coord[], offsetMeters: number): Coord[] {
  if (coords.length < 2) return coords;

  // 각 segment의 수직 벡터(단위) 계산
  const normals: { dlat: number; dlon: number }[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];

    // 방향 벡터 (미터 단위로 변환)
    const dx = (b.lon - a.lon) * LON_DEG_TO_M;
    const dy = (b.lat - a.lat) * LAT_DEG_TO_M;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len < 0.01) {
      // 두 점이 거의 같은 위치면 이전 법선 재사용
      normals.push(normals.length > 0 ? normals[normals.length - 1] : { dlat: 0, dlon: 0 });
      continue;
    }

    // 왼쪽 수직 벡터: (-dy, dx) / len
    // 왼쪽 = 진행 방향의 왼쪽 (offset 양수)
    normals.push({
      dlat: -dx / len, // 수직 벡터의 lat 성분
      dlon: dy / len,  // 수직 벡터의 lon 성분
    });
  }

  const result: Coord[] = [];

  for (let i = 0; i < coords.length; i++) {
    let nlat: number;
    let nlon: number;

    if (i === 0) {
      // 첫 번째 점: 첫 segment의 법선 사용
      nlat = normals[0].dlat;
      nlon = normals[0].dlon;
    } else if (i === coords.length - 1) {
      // 마지막 점: 마지막 segment의 법선 사용
      nlat = normals[normals.length - 1].dlat;
      nlon = normals[normals.length - 1].dlon;
    } else {
      // 중간 점: 인접 두 segment 법선의 평균 (부드러운 코너)
      nlat = (normals[i - 1].dlat + normals[i].dlat) / 2;
      nlon = (normals[i - 1].dlon + normals[i].dlon) / 2;
      // 평균 벡터 정규화
      const len = Math.sqrt(nlat * nlat + nlon * nlon);
      if (len > 0.01) {
        nlat /= len;
        nlon /= len;
      }
    }

    // offset 적용 (미터 → 도 변환)
    result.push({
      lat: coords[i].lat + (nlat * offsetMeters) / LAT_DEG_TO_M,
      lon: coords[i].lon + (nlon * offsetMeters) / LON_DEG_TO_M,
    });
  }

  return result;
}

/**
 * 차도 centerline에서 양쪽 인도 경로를 생성
 *
 * @param roadCoords 차도 centerline 좌표
 * @param sidewalkOffset 인도 offset 거리 (기본 2.5m)
 * @returns { left: 좌측 인도, right: 우측 인도 }
 */
export function generateSidewalkPaths(
  roadCoords: Coord[],
  sidewalkOffset = 2.5
): { left: Coord[]; right: Coord[] } {
  return {
    left: offsetPolyline(roadCoords, sidewalkOffset),    // 좌측 인도
    right: offsetPolyline(roadCoords, -sidewalkOffset),   // 우측 인도
  };
}
