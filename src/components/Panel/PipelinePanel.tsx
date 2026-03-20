/**
 * PipelinePanel - 3단계 경로 생성 위저드
 *
 * Step 1: 도로 불러오기 (OSM)
 * Step 2: AI 검증 (위성 + 로드뷰) — Sonnet 모델
 * Step 3: 인도 경로 생성 (폭 계산 + 중앙선)
 *
 * 각 단계에 "뒤로"/"다음" 버튼
 */
import { useCallback } from 'react';
import { usePipelineStore } from '@/stores/pipelineStore';
import { usePathStore } from '@/stores/pathStore';
import { useMapStore } from '@/stores/mapStore';
import { fetchRoadsInArea } from '@/utils/overpass';
import { generatePathsFromOverpass } from '@/utils/pathGenerator';
import { captureNaverSatelliteImages } from '@/utils/naverSatellite';
import { analyzeRoadsOnSatelliteImage, applyAnalysisResults, type RoadForAnalysis, type RoadAnalysisResult } from '@/utils/aiRoadClassifier';

const STEPS = [
  { num: 1, title: '도로 불러오기', desc: 'OSM에서 이면도로, 차도, 건널목을 수집합니다' },
  { num: 2, title: 'AI 종합 분석', desc: '도로 재분류 + 인도 발견 + 건널목 발견 (Sonnet)' },
  { num: 3, title: '인도 경로 생성', desc: 'AI가 발견한 인도를 바탕으로 경로를 생성합니다' },
];

export default function PipelinePanel() {
  const {
    isActive, currentStep, stepStatus, progress,
    nextStep, prevStep, closePipeline, setStepStatus, setProgress,
  } = usePipelineStore();
  const {
    serviceArea, setPathData, clearPathData,
    nodes, ways,
  } = usePathStore();

  // ============================================
  // Step 1: OSM 도로 로드
  // ============================================
  const runStep1 = useCallback(async () => {
    if (!serviceArea) return;
    setStepStatus('step1', 'running');
    clearPathData();

    try {
      setProgress('OSM 도로 다운로드 중...');
      const overpassData = await fetchRoadsInArea(serviceArea.polygon, (done, total) => {
        setProgress(`타일 다운로드 (${done}/${total})`);
      });

      const osmResult = generatePathsFromOverpass(overpassData);

      // 차도도 포함하여 전체 표시
      const allNodes = [...osmResult.nodes];
      const allWays = [...osmResult.ways];
      let nodeId = -300000;
      let wayId = -300000;

      for (const road of osmResult.mainRoads) {
        const nodeRefs: number[] = [];
        for (const c of road.coords) {
          const id = nodeId--;
          allNodes.push({ id, lat: c.lat, lon: c.lon, tags: [{ k: 'plat_node_id', v: String(Math.abs(id)) }] });
          nodeRefs.push(id);
        }
        if (nodeRefs.length >= 2) {
          allWays.push({
            id: wayId--,
            nodeRefs,
            tags: [
              { k: 'plat_way_id', v: String(Math.abs(wayId + 1)) },
              { k: 'road_type', v: 'road' },
              { k: 'highway', v: road.highway },
            ],
          });
        }
      }

      setPathData({ nodes: allNodes, ways: allWays });

      const sideroads = allWays.filter(w => w.tags.some(t => t.k === 'road_type' && t.v === 'sideroad')).length;
      const roads = allWays.filter(w => w.tags.some(t => t.k === 'road_type' && t.v === 'road')).length;
      const crosswalks = allWays.filter(w => w.tags.some(t => t.k === 'road_type' && t.v === 'crosswalk')).length;
      const sidewalks = allWays.filter(w => w.tags.some(t => t.k === 'road_type' && t.v === 'sidewalk')).length;

      setProgress(`이면도로 ${sideroads}, 차도 ${roads}, 건널목 ${crosswalks}, 인도 ${sidewalks}`);
      setStepStatus('step1', 'done');
    } catch (error) {
      setProgress(`오류: ${error instanceof Error ? error.message : String(error)}`);
      setStepStatus('step1', 'error');
    }
  }, [serviceArea, setStepStatus, setProgress, setPathData, clearPathData]);

  // ============================================
  // Step 2: AI 종합 분석 (도로 재분류 + 인도 발견 + 건널목 발견)
  // ============================================
  const runStep2 = useCallback(async () => {
    if (ways.length === 0) return;
    setStepStatus('step2', 'running');

    try {
      setProgress('네이버 위성 캡처 중...');
      const polygon = serviceArea?.polygon;
      if (!polygon) return;

      const satImages = await captureNaverSatelliteImages(polygon, 17, 4, (done, total) => {
        setProgress(`위성 캡처 (${done}/${total})`);
      });

      if (satImages.length === 0) {
        setProgress('⚠️ 위성 캡처 실패. 🛰️ 위성 모드로 먼저 전환 후 재시도하세요!');
        setStepStatus('step2', 'error');
        return;
      }

      const nodeMap = new Map(nodes.map(n => [n.id, { lat: n.lat, lon: n.lon }]));
      const allResults: RoadAnalysisResult[] = [];

      for (let i = 0; i < satImages.length; i++) {
        setProgress(`AI 종합 분석 중 (${i + 1}/${satImages.length}) — Sonnet`);
        const sat = satImages[i];

        const roadsInArea: RoadForAnalysis[] = ways
          .filter(way => {
            const midRef = way.nodeRefs[Math.floor(way.nodeRefs.length / 2)];
            const mid = nodeMap.get(midRef);
            if (!mid) return false;
            return mid.lat >= sat.bounds.south && mid.lat <= sat.bounds.north
              && mid.lon >= sat.bounds.west && mid.lon <= sat.bounds.east;
          })
          .map(way => ({
            wayId: way.id,
            coords: way.nodeRefs.map(ref => nodeMap.get(ref)).filter((c): c is { lat: number; lon: number } => c !== undefined),
            currentType: way.tags.find(t => t.k === 'road_type')?.v || 'sideroad',
          }));

        if (roadsInArea.length === 0) continue;

        try {
          const results = await analyzeRoadsOnSatelliteImage(sat, roadsInArea);
          allResults.push(...results);

          // 실시간 로그
          const reclassified = results.filter(r => {
            const orig = roadsInArea.find(road => road.wayId === r.wayId);
            return orig && orig.currentType !== r.roadType;
          }).length;
          const withSidewalk = results.filter(r => r.sidewalk.left || r.sidewalk.right).length;
          const crosswalks = results.filter(r => r.roadType === 'crosswalk').length;
          console.log(`🤖 청크 ${i + 1}: 분석 ${results.length}개, 재분류 ${reclassified}개, 인도발견 ${withSidewalk}개, 건널목 ${crosswalks}개`);
        } catch (err) {
          console.warn(`⚠️ 청크 ${i + 1} 실패:`, err);
        }

        if (i < satImages.length - 1) await new Promise(r => setTimeout(r, 500));
      }

      if (allResults.length > 0) {
        applyAnalysisResults(ways, allResults);
        setPathData({ nodes: [...nodes], ways: [...ways] });
      }

      // 통계
      const reclassifiedCount = allResults.length;
      const sidewalkFound = allResults.filter(r => r.sidewalk.left || r.sidewalk.right).length;
      const crosswalkFound = allResults.filter(r => r.roadType === 'crosswalk').length;
      const sideroadCount = ways.filter(w => w.tags.some(t => t.k === 'road_type' && t.v === 'sideroad')).length;
      const roadCount = ways.filter(w => w.tags.some(t => t.k === 'road_type' && t.v === 'road')).length;

      setProgress(
        `AI 분석 완료! ${reclassifiedCount}개 도로 분석\n` +
        `이면도로 ${sideroadCount}, 차도 ${roadCount}, 인도 발견 ${sidewalkFound}개, 건널목 ${crosswalkFound}개`
      );
      setStepStatus('step2', 'done');
    } catch (error) {
      setProgress(`오류: ${error instanceof Error ? error.message : String(error)}`);
      setStepStatus('step2', 'error');
    }
  }, [ways, nodes, serviceArea, setStepStatus, setProgress, setPathData]);

  // ============================================
  // Step 3: 인도 경로 생성 (추후 구현)
  // ============================================
  const runStep3 = useCallback(async () => {
    setStepStatus('step3', 'running');
    setProgress('인도 경로 생성 기능은 다음 업데이트에서 추가됩니다. 수동 그리기를 사용해주세요.');
    setStepStatus('step3', 'done');
  }, [setStepStatus, setProgress]);

  if (!isActive) return null;

  const isRunning = Object.values(stepStatus).some(s => s === 'running');

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1001] bg-white border-t shadow-2xl">
      {/* 스텝 인디케이터 */}
      <div className="flex items-center justify-center gap-4 pt-3 pb-2 px-4">
        {STEPS.map(({ num, title }) => {
          const status = stepStatus[`step${num}` as keyof typeof stepStatus];
          const isCurrent = currentStep === num;
          return (
            <div key={num} className="flex items-center gap-2">
              <div className={`
                w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                ${isCurrent ? 'bg-blue-500 text-white' :
                  status === 'done' ? 'bg-green-500 text-white' :
                  status === 'error' ? 'bg-red-500 text-white' :
                  'bg-gray-200 text-gray-500'}
              `}>
                {status === 'done' ? '✓' : status === 'running' ? '⟳' : num}
              </div>
              <span className={`text-xs ${isCurrent ? 'text-gray-800 font-semibold' : 'text-gray-400'}`}>
                {title}
              </span>
              {num < 3 && <span className="text-gray-300 mx-1">→</span>}
            </div>
          );
        })}
      </div>

      {/* 현재 단계 컨텐츠 */}
      <div className="px-6 py-3 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-800">
              Step {currentStep}: {STEPS[currentStep - 1]?.title}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {progress || STEPS[currentStep - 1]?.desc}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* 실행 버튼 */}
            {stepStatus[`step${currentStep}` as keyof typeof stepStatus] !== 'done' && (
              <button
                onClick={currentStep === 1 ? runStep1 : currentStep === 2 ? runStep2 : runStep3}
                disabled={isRunning}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  isRunning
                    ? 'bg-gray-300 text-gray-500 cursor-wait'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {isRunning ? '실행 중...' : `Step ${currentStep} 실행`}
              </button>
            )}

            {/* 뒤로 */}
            <button
              onClick={prevStep}
              disabled={currentStep <= 1 || isRunning}
              className="px-3 py-2 text-xs rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30"
            >
              ← 뒤로
            </button>

            {/* 다음 */}
            <button
              onClick={nextStep}
              disabled={currentStep >= 3 || isRunning || stepStatus[`step${currentStep}` as keyof typeof stepStatus] !== 'done'}
              className="px-3 py-2 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-30"
            >
              다음 →
            </button>

            {/* 닫기 */}
            <button
              onClick={closePipeline}
              className="px-2 py-2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
