/**
 * 自动迭代状态管理
 */

import { create } from 'zustand';
import type {
  IterationStore,
  IterationConfig,
  IterationPhase,
  CodeIssue,
  TimelineEvent,
  PlanStep,
} from '../types/iteration';

/** 本地存储键 */
const STORAGE_KEY = 'iteration_state';
const STORAGE_VERSION = '1';

/** 初始状态 */
const initialState = {
  // 配置
  config: null,

  // 当前状态
  phase: 'idle' as IterationPhase,
  currentIteration: 0,
  maxIterationsReached: false,

  // 计划和执行
  currentPlan: '',
  planSteps: [],
  currentStepIndex: 0,

  // 代码审查
  currentIssues: [],
  totalIssuesFound: 0,
  totalIssuesFixed: 0,

  // 时间线
  timeline: [],

  // 控制标志
  isPaused: false,
  isRunning: false,
  error: null,

  // AI 对话相关
  conversationId: null,
  lastPrompt: '',
  lastResponse: '',
};

export const useIterationStore = create<IterationStore>((set, get) => ({
  ...initialState,

  // 配置和启动
  startIteration: async (config: IterationConfig) => {
    set({
      config,
      phase: 'planning',
      currentIteration: 1,
      maxIterationsReached: false,
      currentPlan: '',
      planSteps: [],
      currentStepIndex: 0,
      currentIssues: [],
      totalIssuesFound: 0,
      totalIssuesFixed: 0,
      timeline: [],
      isPaused: false,
      isRunning: true,
      error: null,
      lastPrompt: '',
      lastResponse: '',
    });

    // 添加初始时间线事件
    get().addTimelineEvent({
      phase: 'planning',
      message: `开始自动迭代: ${config.description}`,
      details: `模式: ${config.mode}, 最大迭代次数: ${config.maxIterations}`,
    });

    // 保存状态
    get().saveToStorage();
  },

  // 控制
  pauseIteration: () => {
    const { phase, isRunning } = get();
    if (isRunning && phase !== 'idle' && phase !== 'completed' && phase !== 'failed') {
      set({ phase: 'paused', isPaused: true });
      get().addTimelineEvent({
        phase: 'paused',
        message: '迭代已暂停',
      });
    }
  },

  resumeIteration: () => {
    const { phase, isPaused, planSteps, currentStepIndex } = get();
    if (phase === 'paused' && isPaused) {
      // 恢复到之前的阶段
      let resumePhase: IterationPhase = 'executing';

      if (currentStepIndex === 0) {
        resumePhase = 'planning';
      } else if (currentStepIndex < planSteps.length) {
        resumePhase = 'executing';
      } else {
        resumePhase = 'reviewing';
      }

      set({ phase: resumePhase, isPaused: false });
      get().addTimelineEvent({
        phase: resumePhase,
        message: '迭代已恢复',
      });
    }
  },

  stopIteration: () => {
    const { phase, isRunning } = get();
    if (isRunning && phase !== 'idle' && phase !== 'completed') {
      set({
        phase: 'completed',
        isRunning: false,
        isPaused: false,
      });
      get().addTimelineEvent({
        phase: 'completed',
        message: '迭代已手动停止',
      });
      get().saveToStorage();
    }
  },

  // 状态更新
  setPhase: (phase: IterationPhase) => {
    set({ phase });
    get().saveToStorage();
  },

  setCurrentIteration: (iteration: number) => {
    set({ currentIteration: iteration });
    get().saveToStorage();
  },

  setCurrentPlan: (plan: string) => {
    set({ currentPlan: plan });
    get().saveToStorage();
  },

  setPlanSteps: (steps: PlanStep[]) => {
    set({ planSteps: steps });
    get().saveToStorage();
  },

  setCurrentStepIndex: (index: number) => {
    set({ currentStepIndex: index });
    get().saveToStorage();
  },

  // 代码审查
  setCurrentIssues: (issues: CodeIssue[]) => {
    const { totalIssuesFound } = get();
    set({
      currentIssues: issues,
      totalIssuesFound: totalIssuesFound + issues.length,
    });
    get().saveToStorage();
  },

  incrementTotalIssuesFound: () => {
    const { totalIssuesFound } = get();
    set({ totalIssuesFound: totalIssuesFound + 1 });
  },

  incrementTotalIssuesFixed: () => {
    const { totalIssuesFixed } = get();
    set({ totalIssuesFixed: totalIssuesFixed + 1 });
    get().saveToStorage();
  },

  // 时间线
  addTimelineEvent: (event) => {
    const newEvent: TimelineEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };
    set((state) => ({
      timeline: [...state.timeline, newEvent].slice(-100), // 只保留最近100条
    }));
    get().saveToStorage();
  },

  clearTimeline: () => {
    set({ timeline: [] });
    get().saveToStorage();
  },

  // AI 对话
  setConversationId: (id) => {
    set({ conversationId: id });
    get().saveToStorage();
  },

  setLastPrompt: (prompt) => {
    set({ lastPrompt: prompt });
  },

  setLastResponse: (response) => {
    set({ lastResponse: response });
    get().saveToStorage();
  },

  // 错误处理
  setError: (error) => {
    set({ error });
    if (error) {
      get().addTimelineEvent({
        phase: 'failed',
        message: '发生错误',
        details: error,
      });
    }
    get().saveToStorage();
  },

  clearError: () => {
    set({ error: null });
  },

  // 重置
  reset: () => {
    set(initialState);
    get().saveToStorage();
  },

  // 本地存储
  saveToStorage: () => {
    try {
      const state = get();
      const data = {
        version: STORAGE_VERSION,
        timestamp: new Date().toISOString(),
        config: state.config,
        phase: state.phase,
        currentIteration: state.currentIteration,
        maxIterationsReached: state.maxIterationsReached,
        currentPlan: state.currentPlan,
        planSteps: state.planSteps,
        currentStepIndex: state.currentStepIndex,
        currentIssues: state.currentIssues,
        totalIssuesFound: state.totalIssuesFound,
        totalIssuesFixed: state.totalIssuesFixed,
        timeline: state.timeline,
        isPaused: state.isPaused,
        isRunning: state.isRunning,
        error: state.error,
        conversationId: state.conversationId,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('[iterationStore] 保存状态失败:', e);
    }
  },

  restoreFromStorage: () => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (!stored) return false;

      const data = JSON.parse(stored);

      // 检查版本
      if (data.version !== STORAGE_VERSION) {
        console.warn('[iterationStore] 存储版本不匹配');
        return false;
      }

      // 检查时间戳（超过24小时则不恢复）
      const storedTime = new Date(data.timestamp).getTime();
      const now = Date.now();
      if (now - storedTime > 24 * 60 * 60 * 1000) {
        console.log('[iterationStore] 存储状态已过期');
        sessionStorage.removeItem(STORAGE_KEY);
        return false;
      }

      // 恢复状态
      set({
        config: data.config,
        phase: data.phase || 'idle',
        currentIteration: data.currentIteration || 0,
        maxIterationsReached: data.maxIterationsReached || false,
        currentPlan: data.currentPlan || '',
        planSteps: data.planSteps || [],
        currentStepIndex: data.currentStepIndex || 0,
        currentIssues: data.currentIssues || [],
        totalIssuesFound: data.totalIssuesFound || 0,
        totalIssuesFixed: data.totalIssuesFixed || 0,
        timeline: data.timeline || [],
        isPaused: data.isPaused || false,
        isRunning: data.isRunning || false,
        error: data.error || null,
        conversationId: data.conversationId || null,
        lastPrompt: '',
        lastResponse: '',
      });

      console.log(`[iterationStore] 已恢复状态，阶段: ${data.phase}`);
      return true;
    } catch (e) {
      console.error('[iterationStore] 恢复状态失败:', e);
      return false;
    }
  },
}));

/** 辅助函数：获取当前步骤 */
export function getCurrentStep(store: IterationStore): PlanStep | null {
  const { planSteps, currentStepIndex } = store;
  if (currentStepIndex >= 0 && currentStepIndex < planSteps.length) {
    return planSteps[currentStepIndex];
  }
  return null;
}

/** 辅助函数：是否有更多步骤 */
export function hasMoreSteps(store: IterationStore): boolean {
  const { planSteps, currentStepIndex } = store;
  return currentStepIndex < planSteps.length - 1;
}

/** 辅助函数：是否达到最大迭代次数 */
export function isMaxIterationsReached(store: IterationStore): boolean {
  const { currentIteration, config } = store;
  return config ? currentIteration >= config.maxIterations : false;
}

/** 辅助函数：是否需要继续执行 */
export function shouldContinue(store: IterationStore): boolean {
  const { phase, isPaused, isRunning } = store;
  return isRunning && !isPaused && phase !== 'completed' && phase !== 'failed' && phase !== 'idle';
}
