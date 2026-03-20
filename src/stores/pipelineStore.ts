/**
 * 경로 생성 파이프라인 상태 관리
 *
 * [3단계 파이프라인]
 * Step 1: OSM 도로 데이터 불러오기
 * Step 2: AI 검증 (위성 + 로드뷰)
 * Step 3: 인도 폭 계산 + 중앙 경로 생성
 *
 * 각 단계는 독립적으로 실행/취소 가능
 * "뒤로"/"다음" 버튼으로 단계별 진행
 */
import { create } from 'zustand';

export type PipelineStep = 0 | 1 | 2 | 3; // 0 = 시작 전

interface PipelineState {
  /** 현재 단계 (0=시작전, 1=도로로드, 2=AI검증, 3=인도경로) */
  currentStep: PipelineStep;
  /** 파이프라인 활성화 여부 */
  isActive: boolean;
  /** 각 단계 진행 상태 */
  stepStatus: {
    step1: 'idle' | 'running' | 'done' | 'error';
    step2: 'idle' | 'running' | 'done' | 'error';
    step3: 'idle' | 'running' | 'done' | 'error';
  };
  /** 진행 메시지 */
  progress: string;

  // 액션
  startPipeline: () => void;
  closePipeline: () => void;
  goToStep: (step: PipelineStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setStepStatus: (step: 'step1' | 'step2' | 'step3', status: 'idle' | 'running' | 'done' | 'error') => void;
  setProgress: (msg: string) => void;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  currentStep: 0,
  isActive: false,
  stepStatus: { step1: 'idle', step2: 'idle', step3: 'idle' },
  progress: '',

  startPipeline: () => set({
    isActive: true,
    currentStep: 1,
    stepStatus: { step1: 'idle', step2: 'idle', step3: 'idle' },
    progress: '',
  }),

  closePipeline: () => set({
    isActive: false,
    currentStep: 0,
    progress: '',
  }),

  goToStep: (step) => set({ currentStep: step }),

  nextStep: () => {
    const { currentStep } = get();
    if (currentStep < 3) set({ currentStep: (currentStep + 1) as PipelineStep });
  },

  prevStep: () => {
    const { currentStep } = get();
    if (currentStep > 1) set({ currentStep: (currentStep - 1) as PipelineStep });
  },

  setStepStatus: (step, status) => set((s) => ({
    stepStatus: { ...s.stepStatus, [step]: status },
  })),

  setProgress: (msg) => set({ progress: msg }),
}));
