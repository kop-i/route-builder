/**
 * 네이버 로드뷰(Panorama) 이미지 프로그래밍 캡처
 *
 * [핵심 발견]
 * - Panorama는 img 태그로 렌더링 (canvas 아닌)
 * - panorama.pstatic.net 이미지는 crossOrigin='anonymous' + CORS 통과
 * - Canvas에 그려서 toDataURL() 가능!
 *
 * [방식]
 * 1. 숨겨진 div에 Panorama 인스턴스 생성
 * 2. 로드 완료 대기
 * 3. 내부 img 태그에서 front face URL 추출
 * 4. crossOrigin='anonymous'로 재로드 → Canvas 캡처 → base64
 */

/**
 * 특정 좌표의 로드뷰 이미지를 base64로 캡처
 *
 * @param lat 위도
 * @param lon 경도
 * @param heading 바라보는 방향 (0=북, 90=동, 180=남, 270=서)
 * @returns base64 이미지 (front face, 512x512)
 */
export async function captureRoadviewImage(
  lat: number,
  lon: number,
  heading = 0,
): Promise<string | null> {
  if (!window.naver?.maps?.Panorama) {
    console.warn('⚠️ Panorama API 없음');
    return null;
  }

  // 숨겨진 div 생성
  const panoDiv = document.createElement('div');
  panoDiv.style.cssText = 'width:640px;height:400px;position:absolute;left:-9999px;top:0;';
  document.body.appendChild(panoDiv);

  try {
    // Panorama 생성
    const pano = new naver.maps.Panorama(panoDiv, {
      position: new naver.maps.LatLng(lat, lon),
      pov: { pan: heading, tilt: 0, fov: 100 },
    });

    // 로드 대기 (최대 5초)
    await new Promise<void>((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 5000);
      // init 이벤트 또는 타이머
      naver.maps.Event.addListener(pano, 'init', () => {
        // 이미지 로드까지 추가 대기
        setTimeout(() => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } }, 1500);
      });
    });

    // 내부 img 태그에서 panorama URL 추출
    const imgs = panoDiv.querySelectorAll('img[src*="panorama.pstatic.net"]');
    if (imgs.length === 0) {
      console.warn('⚠️ Panorama 이미지 없음');
      pano.destroy?.();
      return null;
    }

    // front face 이미지 (URL에 /f가 포함된 것)
    const frontImg = Array.from(imgs).find(img =>
      (img as HTMLImageElement).src.includes('/f')
    ) || imgs[0];

    const imgUrl = (frontImg as HTMLImageElement).src;

    // crossOrigin='anonymous'로 재로드하여 Canvas 캡처
    const image = new Image();
    image.crossOrigin = 'anonymous';

    const base64 = await new Promise<string | null>((resolve) => {
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(image, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
        } catch {
          resolve(null);
        }
      };
      image.onerror = () => resolve(null);
      image.src = imgUrl;
    });

    pano.destroy?.();
    return base64;
  } finally {
    document.body.removeChild(panoDiv);
  }
}

/**
 * 도로의 중간점에서 도로 방향을 바라보는 로드뷰를 캡처
 *
 * @param coords 도로 좌표 배열
 * @returns base64 이미지 (or null)
 */
export async function captureRoadviewForRoad(
  coords: { lat: number; lon: number }[],
): Promise<string | null> {
  if (coords.length < 2) return null;

  // 중간점
  const midIdx = Math.floor(coords.length / 2);
  const mid = coords[midIdx];

  // 도로 방향 계산 (중간점에서 다음 점 방향)
  const nextIdx = Math.min(midIdx + 1, coords.length - 1);
  const next = coords[nextIdx];
  const heading = Math.atan2(next.lon - mid.lon, next.lat - mid.lat) * (180 / Math.PI);
  // atan2 결과를 0~360으로 변환
  const normalizedHeading = ((heading % 360) + 360) % 360;

  return captureRoadviewImage(mid.lat, mid.lon, normalizedHeading);
}
