/**
 * 自动迭代执行引擎
 * 负责管理迭代的循环执行和状态转换
 */

import type { StreamEvent } from '../types';
import type { IterationPhase } from '../types/iteration';
import {
  generatePlanningPrompt,
  generateExecutingPrompt,
  generateReviewingPrompt,
  generateFixingPrompt,
  generateValidatingPrompt,
  generateNextIterationPrompt,
  ResponseParser,
} from './iterationPrompts';

/** 迭代引擎配置 */
interface IterationRunnerConfig {
  // 回调函数
  onPhaseChange: (phase: IterationPhase) => void;
  onSendMessage: (message: string) => Promise<void>;
  onAddTimelineEvent: (event: { phase: IterationPhase; message: string; details?: string }) => void;
  onLog: (message: string) => void;
  // 状态获取
  getIsPaused: () => boolean;
  getIsRunning: () => boolean;
  getConversationId: () => string | null;
  setConversationId: (id: string | null) => void;
  getConfig: () => { mode: string; maxIterations: number; autoRunTests: boolean; autoRunBuild: boolean } | null;
}

/** 迭代引擎状态 */
interface RunnerState {
  phase: IterationPhase;
  currentIteration: number;
  currentStepIndex: number;
  planSteps: Array<{ description: string; status: string }>;
  currentIssues: Array<{ severity: string; description: string }>;
  conversationId: string | null;
  lastResponse: string;
  isWaitingForResponse: boolean;
}

/**
 * 迭代执行引擎类
 */
export class IterationRunner {
  private config: IterationRunnerConfig;
  private state: RunnerState;
  private responseBuffer: string = '';

  constructor(config: IterationRunnerConfig) {
    this.config = config;
    this.state = {
      phase: 'idle',
      currentIteration: 1,
      currentStepIndex: 0,
      planSteps: [],
      currentIssues: [],
      conversationId: null,
      lastResponse: '',
      isWaitingForResponse: false,
    };
  }

  /**
   * 启动迭代循环
   */
  async start(description: string, mode: string, maxIterations: number) {
    this.config.onLog(`[IterationRunner] 开始自动迭代: ${description}`);

    // 开始规划阶段
    this.state.phase = 'planning';
    this.state.currentIteration = 1;
    this.config.onPhaseChange('planning');

    const planningPrompt = generatePlanningPrompt({
      mode: mode as any,
      description,
      maxIterations,
      autoRunTests: true,
      autoRunBuild: true,
      pauseAfterEachRound: false,
    });

    await this.config.onSendMessage(planningPrompt);
    this.state.isWaitingForResponse = true;

    this.config.onAddTimelineEvent({
      phase: 'planning',
      message: '正在分析项目并制定计划...',
    });
  }

  /**
   * 处理流式事件
   */
  async handleStreamEvent(event: StreamEvent): Promise<void> {
    // 更新 conversationId
    if (event.type === 'system' && event.session_id) {
      this.state.conversationId = event.session_id;
      this.config.setConversationId(event.session_id);
      this.config.onLog(`[IterationRunner] 收到会话ID: ${event.session_id}`);
    }

    // 处理用户消息（工具结果）
    if (event.type === 'user') {
      const toolResults = event.message.content.filter(item => item.type === 'tool_result');
      for (const result of toolResults) {
        this.config.onLog(`[IterationRunner] 工具结果: ${result.tool_use_id}`);
      }
    }

    // 处理助手消息
    if (event.type === 'assistant') {
      const textContent = event.message.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('');

      if (textContent) {
        this.responseBuffer += textContent;
      }
    }

    // 处理文本增量
    if (event.type === 'text_delta') {
      this.responseBuffer += event.text;
    }

    // 会话结束
    if (event.type === 'result' || event.type === 'session_end') {
      this.state.isWaitingForResponse = false;
      this.state.lastResponse = this.responseBuffer;
      await this.processResponse();
      this.responseBuffer = '';
    }

    // 错误
    if (event.type === 'error') {
      this.config.onLog(`[IterationRunner] 错误: ${event.error}`);
      this.state.phase = 'failed';
      this.config.onPhaseChange('failed');
      this.config.onAddTimelineEvent({
        phase: 'failed',
        message: '发生错误',
        details: event.error,
      });
    }
  }

  /**
   * 处理 AI 响应并决定下一步
   */
  private async processResponse(): Promise<void> {
    const response = this.state.lastResponse;
    const config = this.config.getConfig();

    if (!config) {
      this.config.onLog('[IterationRunner] 配置未找到，停止迭代');
      this.stop();
      return;
    }

    // 检查是否暂停
    if (this.config.getIsPaused()) {
      this.config.onLog('[IterationRunner] 迭代已暂停');
      this.state.phase = 'paused';
      this.config.onPhaseChange('paused');
      return;
    }

    // 检查是否继续运行
    if (!this.config.getIsRunning()) {
      this.config.onLog('[IterationRunner] 迭代已停止');
      this.stop();
      return;
    }

    // 根据当前阶段处理响应
    switch (this.state.phase) {
      case 'planning':
        await this.processPlanningResponse(response);
        break;

      case 'executing':
        await this.processExecutingResponse(response);
        break;

      case 'reviewing':
        await this.processReviewingResponse(response);
        break;

      case 'fixing':
        await this.processFixingResponse(response);
        break;

      case 'validating':
        await this.processValidatingResponse(response);
        break;

      default:
        this.config.onLog(`[IterationRunner] 未知阶段: ${this.state.phase}`);
    }
  }

  /**
   * 处理规划阶段响应
   */
  private async processPlanningResponse(response: string): Promise<void> {
    this.config.onLog('[IterationRunner] 处理规划响应');

    const { steps } = ResponseParser.parsePlanSteps(response);

    if (steps.length > 0) {
      this.state.planSteps = steps.map((desc, i) => ({
        description: desc,
        status: i === 0 ? 'in_progress' : 'pending',
      }));

      this.config.onAddTimelineEvent({
        phase: 'planning',
        message: '规划完成',
        details: `共 ${steps.length} 个步骤`,
      });

      // 检查是否完成
      if (ResponseParser.isIterationComplete(response)) {
        this.completeIteration();
        return;
      }

      // 进入执行阶段
      await this.goToExecutingPhase();
    } else {
      // 没有解析到步骤，可能需要更多信息
      this.config.onAddTimelineEvent({
        phase: 'planning',
        message: '规划未完成，继续对话...',
      });
      await this.continueChat('请继续完成规划，确保输出 <steps> 标签包含所有实现步骤。');
    }
  }

  /**
   * 处理执行阶段响应
   */
  private async processExecutingResponse(response: string): Promise<void> {
    this.config.onLog('[IterationRunner] 处理执行响应');

    const currentStep = this.state.planSteps[this.state.currentStepIndex];
    if (currentStep) {
      currentStep.status = 'completed';
    }

    this.config.onAddTimelineEvent({
      phase: 'executing',
      message: `步骤 ${this.state.currentStepIndex + 1} 完成`,
      details: currentStep?.description,
    });

    // 检查是否完成
    if (ResponseParser.isIterationComplete(response)) {
      this.completeIteration();
      return;
    }

    // 进入审查阶段
    await this.goToReviewingPhase();
  }

  /**
   * 处理审查阶段响应
   */
  private async processReviewingResponse(response: string): Promise<void> {
    this.config.onLog('[IterationRunner] 处理审查响应');

    const issues = ResponseParser.parseIssues(response);

    if (issues.length > 0) {
      this.state.currentIssues = issues;
      this.config.onAddTimelineEvent({
        phase: 'reviewing',
        message: `发现 ${issues.length} 个问题`,
        details: issues.map(i => `[${i.severity}] ${i.description}`).join('\n'),
      });

      // 进入修复阶段
      await this.goToFixingPhase(issues);
    } else {
      this.config.onAddTimelineEvent({
        phase: 'reviewing',
        message: '代码审查通过，没有发现问题',
      });

      // 进入验证阶段
      await this.goToValidatingPhase();
    }
  }

  /**
   * 处理修复阶段响应
   */
  private async processFixingResponse(response: string): Promise<void> {
    this.config.onLog('[IterationRunner] 处理修复响应');

    const { fixedCount, changes } = ResponseParser.parseFixSummary(response);

    this.config.onAddTimelineEvent({
      phase: 'fixing',
      message: `修复了 ${fixedCount} 个问题`,
      details: changes || '修复完成',
    });

    // 修复后重新审查
    await this.goToReviewingPhase();
  }

  /**
   * 处理验证阶段响应
   */
  private async processValidatingResponse(response: string): Promise<void> {
    this.config.onLog('[IterationRunner] 处理验证响应');

    const { passed, errors } = ResponseParser.parseValidationResult(response);

    if (passed) {
      this.config.onAddTimelineEvent({
        phase: 'validating',
        message: '验证通过',
      });

      // 检查是否有下一步
      if (this.state.currentStepIndex < this.state.planSteps.length - 1) {
        // 继续下一步
        this.state.currentStepIndex++;
        await this.goToExecutingPhase();
      } else {
        // 所有步骤完成
        await this.completeIteration();
      }
    } else {
      this.config.onAddTimelineEvent({
        phase: 'validating',
        message: '验证失败',
        details: errors?.join('\n') || '验证过程中发现问题',
      });

      // 验证失败，需要修复
      await this.goToFixingPhase([{
        severity: 'high',
        description: '验证失败：' + (errors?.join('; ') || '测试或构建未通过'),
      }]);
    }
  }

  /**
   * 进入执行阶段
   */
  private async goToExecutingPhase(): Promise<void> {
    const config = this.config.getConfig();
    const currentStep = this.state.planSteps[this.state.currentStepIndex];

    if (!currentStep || !config) {
      this.config.onLog('[IterationRunner] 无更多步骤或配置缺失');
      await this.completeIteration();
      return;
    }

    this.state.phase = 'executing';
    this.config.onPhaseChange('executing');
    currentStep.status = 'in_progress';

    const prompt = generateExecutingPrompt(
      config as any,
      currentStep.description,
      this.state.currentStepIndex + 1
    );

    this.config.onAddTimelineEvent({
      phase: 'executing',
      message: `开始执行步骤 ${this.state.currentStepIndex + 1}`,
      details: currentStep.description,
    });

    await this.continueChat(prompt);
  }

  /**
   * 进入审查阶段
   */
  private async goToReviewingPhase(): Promise<void> {
    const config = this.config.getConfig();

    this.state.phase = 'reviewing';
    this.config.onPhaseChange('reviewing');

    const prompt = generateReviewingPrompt(config as any);

    this.config.onAddTimelineEvent({
      phase: 'reviewing',
      message: '正在审查代码...',
    });

    await this.continueChat(prompt);
  }

  /**
   * 进入修复阶段
   */
  private async goToFixingPhase(issues: any[]): Promise<void> {
    this.state.phase = 'fixing';
    this.config.onPhaseChange('fixing');

    const prompt = generateFixingPrompt(issues);

    this.config.onAddTimelineEvent({
      phase: 'fixing',
      message: '正在修复问题...',
    });

    await this.continueChat(prompt);
  }

  /**
   * 进入验证阶段
   */
  private async goToValidatingPhase(): Promise<void> {
    const config = this.config.getConfig();

    this.state.phase = 'validating';
    this.config.onPhaseChange('validating');

    const prompt = generateValidatingPrompt(config as any);

    this.config.onAddTimelineEvent({
      phase: 'validating',
      message: '正在验证...',
    });

    await this.continueChat(prompt);
  }

  /**
   * 完成迭代
   */
  private async completeIteration(): Promise<void> {
    const config = this.config.getConfig();

    if (!config) {
      this.stop();
      return;
    }

    // 检查是否达到最大迭代次数
    if (this.state.currentIteration >= config.maxIterations) {
      this.config.onLog('[IterationRunner] 达到最大迭代次数');
      this.stop(true);
      return;
    }

    // 进入下一轮迭代
    this.state.currentIteration++;
    this.state.currentStepIndex = 0;

    this.config.onAddTimelineEvent({
      phase: 'idle',
      message: `开始第 ${this.state.currentIteration} 轮迭代`,
    });

    const prompt = generateNextIterationPrompt(
      config as any,
      this.state.currentIteration - 1,
      this.state.planSteps.map(s => s.description).join('\n')
    );

    await this.continueChat(prompt);
  }

  /**
   * 继续对话
   */
  private async continueChat(message: string): Promise<void> {
    this.state.isWaitingForResponse = true;
    await this.config.onSendMessage(message);
  }

  /**
   * 停止迭代
   */
  stop(completed = false): void {
    this.state.phase = completed ? 'completed' : 'idle';
    this.config.onPhaseChange(this.state.phase);
    this.config.onLog(`[IterationRunner] 迭代${completed ? '完成' : '停止'}`);

    if (completed) {
      this.config.onAddTimelineEvent({
        phase: 'completed',
        message: '自动迭代完成',
        details: `共完成 ${this.state.currentIteration} 轮迭代`,
      });
    }
  }

  /**
   * 暂停迭代
   */
  pause(): void {
    if (this.state.phase !== 'idle' && this.state.phase !== 'completed' && this.state.phase !== 'failed') {
      this.state.phase = 'paused';
      this.config.onPhaseChange('paused');
      this.config.onLog('[IterationRunner] 迭代已暂停');
    }
  }

  /**
   * 恢复迭代
   */
  async resume(): Promise<void> {
    if (this.state.phase === 'paused') {
      this.config.onLog('[IterationRunner] 恢复迭代');

      // 根据当前步骤恢复到适当的阶段
      if (this.state.currentStepIndex === 0) {
        await this.goToReviewingPhase();
      } else {
        await this.goToExecutingPhase();
      }
    }
  }

  /**
   * 获取当前状态
   */
  getState(): RunnerState {
    return { ...this.state };
  }
}

/**
 * 创建迭代运行器的工厂函数
 */
export function createIterationRunner(config: IterationRunnerConfig): IterationRunner {
  return new IterationRunner(config);
}
