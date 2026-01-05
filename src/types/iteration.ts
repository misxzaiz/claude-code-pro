/**
 * 自动迭代功能相关类型定义
 */

/** 迭代模式 */
export type IterationMode =
  | 'feature'        // 功能增强
  | 'performance'    // 性能优化
  | 'refactoring'    // 代码重构
  | 'bug_fixing'     // Bug 修复
  | 'custom';        // 自定义流程

/** 迭代阶段 */
export type IterationPhase =
  | 'idle'           // 空闲
  | 'planning'       // 规划阶段
  | 'executing'      // 执行阶段
  | 'reviewing'      // 审查阶段
  | 'fixing'         // 修复阶段
  | 'validating'     // 验证阶段
  | 'completed'      // 迭代完成
  | 'failed'         // 迭代失败
  | 'paused';        // 已暂停

/** 问题严重程度 */
export type IssueSeverity = 'high' | 'medium' | 'low';

/** 代码审查发现的问题 */
export interface CodeIssue {
  severity: IssueSeverity;
  description: string;
  location?: string;
  suggestion?: string;
}

/** 迭代时间线事件 */
export interface TimelineEvent {
  id: string;
  timestamp: string;
  phase: IterationPhase;
  message: string;
  details?: string;
}

/** 迭代计划步骤 */
export interface PlanStep {
  stepNumber: number;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
}

/** 迭代配置 */
export interface IterationConfig {
  mode: IterationMode;
  description: string;
  maxIterations: number;
  autoRunTests: boolean;
  autoRunBuild: boolean;
  pauseAfterEachRound: boolean;
}

/** 迭代状态 */
export interface IterationState {
  // 配置
  config: IterationConfig | null;

  // 当前状态
  phase: IterationPhase;
  currentIteration: number;
  maxIterationsReached: boolean;

  // 计划和执行
  currentPlan: string;
  planSteps: PlanStep[];
  currentStepIndex: number;

  // 代码审查
  currentIssues: CodeIssue[];
  totalIssuesFound: number;
  totalIssuesFixed: number;

  // 时间线
  timeline: TimelineEvent[];

  // 控制标志
  isPaused: boolean;
  isRunning: boolean;
  error: string | null;

  // AI 对话相关
  conversationId: string | null;
  lastPrompt: string;
  lastResponse: string;
}

/** 迭代操作 */
export interface IterationActions {
  // 配置和启动
  startIteration: (config: IterationConfig) => Promise<void>;

  // 控制
  pauseIteration: () => void;
  resumeIteration: () => void;
  stopIteration: () => void;

  // 状态更新
  setPhase: (phase: IterationPhase) => void;
  setCurrentIteration: (iteration: number) => void;
  setCurrentPlan: (plan: string) => void;
  setPlanSteps: (steps: PlanStep[]) => void;
  setCurrentStepIndex: (index: number) => void;

  // 代码审查
  setCurrentIssues: (issues: CodeIssue[]) => void;
  incrementTotalIssuesFound: () => void;
  incrementTotalIssuesFixed: () => void;

  // 时间线
  addTimelineEvent: (event: Omit<TimelineEvent, 'id' | 'timestamp'>) => void;
  clearTimeline: () => void;

  // AI 对话
  setConversationId: (id: string | null) => void;
  setLastPrompt: (prompt: string) => void;
  setLastResponse: (response: string) => void;

  // 错误处理
  setError: (error: string | null) => void;
  clearError: () => void;

  // 重置
  reset: () => void;

  // 本地存储
  saveToStorage: () => void;
  restoreFromStorage: () => boolean;
}

/** 完整的 Iteration Store 类型 */
export type IterationStore = IterationState & IterationActions;

/** 迭代模式描述 */
export const ITERATION_MODES: Record<IterationMode, { label: string; description: string; icon: string }> = {
  feature: {
    label: '功能增强',
    description: '自动添加新功能，审查代码，修复问题',
    icon: 'plus-circle',
  },
  performance: {
    label: '性能优化',
    description: '分析和优化代码性能，验证改进效果',
    icon: 'zap',
  },
  refactoring: {
    label: '代码重构',
    description: '改进代码结构和可维护性',
    icon: 'refresh-cw',
  },
  bug_fixing: {
    label: 'Bug 修复',
    description: '自动发现和修复代码问题',
    icon: 'bug',
  },
  custom: {
    label: '自定义流程',
    description: '根据你的描述执行自定义任务',
    icon: 'settings',
  },
};

/** 阶段显示名称 */
export const PHASE_LABELS: Record<IterationPhase, string> = {
  idle: '空闲',
  planning: '正在规划...',
  executing: '正在执行...',
  reviewing: '正在审查代码...',
  fixing: '正在修复问题...',
  validating: '正在验证...',
  completed: '已完成',
  failed: '失败',
  paused: '已暂停',
};
