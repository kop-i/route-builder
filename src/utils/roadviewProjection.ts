/**
 * 로드뷰 좌표 투영 유틸리티
 *
 * [원리]
 * 카메라 위치(lat, lon)와 방향(heading)을 기준으로
 * 주변 좌표를 로드뷰 화면의 2D 위치(x, y)로 변환
 *
 * 수평: 카메라 heading 기준 ±FOV/2 범위의 좌표를 화면 너비에 매핑
 * 수직: 거리에 따라 — 가까울수록 화면 아래, 멀수록 위
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** 두 좌표 사이의 거리(m)와 방위각(°) 계산 */
function distanceAndBearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): { distance: number; bearing: number } {
  const R = 6371000;
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const y = Math.sin(dLon) * Math.cos(lat2 * DEG_TO_RAD);
  const x = Math.cos(lat1 * DEG_TO_RAD) * Math.sin(lat2 * DEG_TO_RAD) -
    Math.sin(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * RAD_TO_DEG + 360) % 360;

  return { distance, bearing };
}

/** 투영 결과 */
export interface ProjectedPoint {
  x: number;       // 화면 x (0~1, 좌→우)
  y: number;       // 화면 y (0~1, 상→하)
  distance: number; // 카메라에서의 거리(m)
  visible: boolean; // 화면 안에 보이는지
  nodeId?: number;
}

/**
 * 주변 좌표들을 로드뷰 화면 위치로 투영
 *
 * @param cameraLat 카메라 위도
 * @param cameraLon 카메라 경도
 * @param cameraHeading 카메라 방향 (0=북, 90=동)
 * @param fov 시야각 (기본 100°)
 * @param points 투영할 좌표 배열
 * @param maxDistance 최대 표시 거리(m, 기본 50)
 */
export function projectPointsToRoadview(
  cameraLat: number,
  cameraLon: number,
  cameraHeading: number,
  fov: number,
  points: { lat: number; lon: number; nodeId?: number }[],
  maxDistance = 50,
): ProjectedPoint[] {
  const halfFov = fov / 2;

  return points.map((point) => {
    const { distance, bearing } = distanceAndBearing(
      cameraLat, cameraLon, point.lat, point.lon
    );

    // 카메라 heading 기준 상대 각도 (-180 ~ +180)
    let relAngle = bearing - cameraHeading;
    if (relAngle > 180) relAngle -= 360;
    if (relAngle < -180) relAngle += 360;

    // 화면 x: 상대 각도를 FOV 범위에 매핑 (0~1)
    const x = 0.5 + (relAngle / fov);

    // 화면 y: 거리에 따라 — 가까울수록 아래(0.8), 멀수록 위(0.3)
    // 로그 스케일로 매핑
    const normalizedDist = Math.min(distance / maxDistance, 1);
    const y = 0.8 - normalizedDist * 0.5; // 0.3(멀리) ~ 0.8(가까이)

    const visible = Math.abs(relAngle) <= halfFov && distance <= maxDistance;

    return {
      x,
      y,
      distance,
      visible,
      nodeId: point.nodeId,
    };
  });
}
