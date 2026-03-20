/**
 * Naver Maps JavaScript API v3 타입 선언
 * - 네이버 지도 API의 TypeScript 타입 정의
 * - 공식 타입이 없으므로 사용하는 기능만 선언
 */

declare namespace naver.maps {
  // ============================================
  // 기본 클래스
  // ============================================

  class Map {
    constructor(el: string | HTMLElement, options?: MapOptions);
    setCenter(center: LatLng): void;
    getCenter(): LatLng;
    setZoom(zoom: number, animate?: boolean): void;
    getZoom(): number;
    getBounds(): LatLngBounds;
    setOptions(options: Partial<MapOptions>): void;
    panTo(latlng: LatLng, transitionOptions?: object): void;
    destroy(): void;
    getElement(): HTMLElement;
    setMapTypeId(mapTypeId: string): void;
    getMapTypeId(): string;
  }

  interface MapOptions {
    center?: LatLng;
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    mapTypeId?: string;
    zoomControl?: boolean;
    zoomControlOptions?: {
      position?: number;
    };
    scaleControl?: boolean;
    mapDataControl?: boolean;
    logoControl?: boolean;
    logoControlOptions?: {
      position?: number;
    };
  }

  class LatLng {
    constructor(lat: number, lng: number);
    lat(): number;
    lng(): number;
    equals(other: LatLng): boolean;
  }

  class LatLngBounds {
    constructor(sw: LatLng, ne: LatLng);
    getSW(): LatLng;
    getNE(): LatLng;
    extend(latlng: LatLng): LatLngBounds;
    hasLatLng(latlng: LatLng): boolean;
  }

  class Point {
    constructor(x: number, y: number);
    x: number;
    y: number;
  }

  class Size {
    constructor(width: number, height: number);
    width: number;
    height: number;
  }

  // ============================================
  // 오버레이 (경로 표시용)
  // ============================================

  class Polyline {
    constructor(options: PolylineOptions);
    setMap(map: Map | null): void;
    getPath(): LatLng[];
    setPath(path: LatLng[]): void;
    setOptions(options: Partial<PolylineOptions>): void;
    setVisible(visible: boolean): void;
  }

  interface PolylineOptions {
    map?: Map;
    path: LatLng[];
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWeight?: number;
    strokeStyle?: string;
    strokeLineCap?: string;
    strokeLineJoin?: string;
    clickable?: boolean;
    zIndex?: number;
  }

  class Polygon {
    constructor(options: PolygonOptions);
    setMap(map: Map | null): void;
    getPaths(): LatLng[][];
    setOptions(options: Partial<PolygonOptions>): void;
  }

  interface PolygonOptions {
    map?: Map;
    paths: LatLng[][];
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWeight?: number;
    fillColor?: string;
    fillOpacity?: number;
    clickable?: boolean;
    zIndex?: number;
  }

  class Marker {
    constructor(options: MarkerOptions);
    setMap(map: Map | null): void;
    getPosition(): LatLng;
    setPosition(position: LatLng): void;
    setIcon(icon: string | ImageIcon | SymbolIcon | HtmlIcon): void;
    setDraggable(draggable: boolean): void;
    setVisible(visible: boolean): void;
  }

  interface MarkerOptions {
    map?: Map;
    position: LatLng;
    icon?: string | ImageIcon | SymbolIcon | HtmlIcon;
    title?: string;
    draggable?: boolean;
    clickable?: boolean;
    zIndex?: number;
  }

  interface ImageIcon {
    url: string;
    size?: Size;
    anchor?: Point;
    origin?: Point;
    scaledSize?: Size;
  }

  interface SymbolIcon {
    path: number[] | string;
    style?: string;
    radius?: number;
    fillColor?: string;
    fillOpacity?: number;
    strokeColor?: string;
    strokeWeight?: number;
    strokeOpacity?: number;
    anchor?: Point;
  }

  interface HtmlIcon {
    content: string | HTMLElement;
    size?: Size;
    anchor?: Point;
  }

  // ============================================
  // 이벤트
  // ============================================

  class Event {
    static addListener(
      target: object,
      type: string,
      handler: (...args: unknown[]) => void
    ): unknown;
    static removeListener(listener: unknown): void;
    static trigger(target: object, type: string, ...args: unknown[]): void;
  }

  // ============================================
  // Panorama (로드뷰)
  // ============================================

  class Panorama {
    constructor(el: string | HTMLElement, options?: PanoramaOptions);
    setPosition(position: LatLng): void;
    getPosition(): LatLng;
    setPov(pov: PanoramaPov): void;
    getPov(): PanoramaPov;
    setVisible(visible: boolean): void;
    destroy(): void;
  }

  interface PanoramaOptions {
    position?: LatLng;
    pov?: PanoramaPov;
    visible?: boolean;
    aroundControl?: boolean;
    zoomControl?: boolean;
  }

  interface PanoramaPov {
    pan?: number;
    tilt?: number;
    fov?: number;
  }

  // ============================================
  // DrawingManager (서비스 면적 그리기용)
  // ============================================

  namespace drawing {
    class DrawingManager {
      constructor(options?: DrawingManagerOptions);
      setMap(map: Map): void;
      setOptions(options: Partial<DrawingManagerOptions>): void;
      getDrawings(): Record<string, unknown[]>;
      toGeoJson(): string;
    }

    interface DrawingManagerOptions {
      map?: Map;
      drawingControl?: unknown[];
      drawingControlOptions?: {
        position?: number;
        style?: number;
      };
      polygonOptions?: Partial<PolygonOptions>;
      polylineOptions?: Partial<PolylineOptions>;
    }
  }

  // ============================================
  // 상수
  // ============================================

  const Position: {
    TOP_LEFT: number;
    TOP_CENTER: number;
    TOP_RIGHT: number;
    LEFT_CENTER: number;
    CENTER: number;
    RIGHT_CENTER: number;
    BOTTOM_LEFT: number;
    BOTTOM_CENTER: number;
    BOTTOM_RIGHT: number;
  };

  const MapTypeId: {
    NORMAL: string;
    TERRAIN: string;
    SATELLITE: string;
    HYBRID: string;
  };
}
