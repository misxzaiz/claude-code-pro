/**
 * Run Manager
 *
 * 管理 Agent 执行的生命周期：创建、执行、完成、中断
 */

import type {
  AgentRun,
  CreateRunParams,
  RunSnapshot,
  RunContext,
  ReviewFeedback,
  Message,
  ToolCall,
  FileChange,
  TokenUsage,
} from '../models'
import type { AIEvent } from '../../ai-runtime/event'
import type { AgentInput } from '../agents/AgentRunner'
import { useRunStore } from '../../stores/runStore'
import { AgentRegistry } from '../agents/AgentRunner'
import { useWorkspaceStore } from '../../stores/workspaceStore'

/**
 * Run Manager
 *
 * 负责 Agent 执行的完整生命周期管理
 */
export class RunManager {
  private runStore = useRunStore.getState()
  private workspaceStore = useWorkspaceStore.getState()
  private activeAbortControllers = new Map<string, AbortController>()
  private runContexts = new Map<string, RunContext>()  // 存储每个 Run 的上下文

  /**
   * 创建新的 Run
   *
   * @param params 创建参数
   * @returns 创建的 Run
   */
  createRun(params: CreateRunParams): AgentRun {
    const run = this.runStore.createRun(params)

    // 存储上下文
    this.runContexts.set(run.id, params.context)

    console.log(`[RunManager] Run created: ${run.id} for task: ${params.taskId}`)
    return run
  }

  /**
   * 执行 Run
   *
   * @param runId Run ID
   */
  async executeRun(runId: string): Promise<void> {
    const runSummary = this.runStore.getRunSummary(runId)
    if (!runSummary) {
      throw new Error(`Run not found: ${runId}`)
    }

    console.log(`[RunManager] Starting run: ${runId}`)

    // 更新状态为 running
    this.runStore.updateRunStatus(runId, 'running')
    this.runStore.setActiveRun(runId)

    // 创建 AbortController
    const abortController = new AbortController()
    this.activeAbortControllers.set(runId, abortController)

    try {
      // 获取 Agent Runner
      const agent = AgentRegistry.get(runSummary.agentType)

      // 检查 Agent 是否可用
      const available = await agent.isAvailable()
      if (!available) {
        throw new Error(`Agent not available: ${runSummary.agentType}`)
      }

      // 获取 Run 上下文
      const context = this.runContexts.get(runId)
      if (!context) {
        throw new Error(`Run context not found: ${runId}`)
      }

      // 构建执行输入
      const input = this.buildAgentInput(context)

      // 执行 Agent 并收集事件
      const events: AIEvent[] = []
      const messages: Message[] = []
      const toolCalls: ToolCall[] = []

      for await (const event of agent.run(input)) {
        // 检查是否被中断
        if (abortController.signal.aborted) {
          throw new Error('Run aborted')
        }

        // 收集事件
        events.push(event)

        // 添加到 Store
        this.runStore.addEventToRun(runId, event)

        // 处理事件（构建消息和工具调用）
        this.processEvent(event, messages, toolCalls)

        // 实时广播事件（供 UI 展示）
        this.broadcastEvent(runId, event)
      }

      // 构建快照
      const snapshot = this.buildSnapshot(events, messages, toolCalls, runSummary.startedAt)

      // 完成 Run
      this.runStore.completeRun(runId, snapshot)

      console.log(`[RunManager] Run completed: ${runId}`)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[RunManager] Run failed: ${runId}`, error)

      this.runStore.updateRunStatus(runId, 'failed', errorMessage)
    } finally {
      // 清理
      this.activeAbortControllers.delete(runId)
      this.runContexts.delete(runId)
    }
  }

  /**
   * 中断 Run
   *
   * @param runId Run ID
   */
  abortRun(runId: string): void {
    const abortController = this.activeAbortControllers.get(runId)
    if (abortController) {
      abortController.abort()
      console.log(`[RunManager] Run aborted: ${runId}`)
    }

    this.runStore.abortRun(runId)
  }

  /**
   * 删除 Run
   *
   * @param runId Run ID
   */
  deleteRun(runId: string): void {
    this.runStore.deleteRun(runId)
    this.runContexts.delete(runId)
    console.log(`[RunManager] Run deleted: ${runId}`)
  }

  /**
   * 构建 Agent 输入
   *
   * @param context Run 上下文
   * @returns Agent 输入
   */
  private buildAgentInput(context: RunContext): AgentInput {
    // 构建 Prompt（包含审查反馈）
    const prompt = this.buildPrompt(context)

    // 获取当前工作区路径
    const currentWorkspace = this.workspaceStore.getCurrentWorkspace()
    const workspacePath = currentWorkspace?.path

    return {
      prompt,
      files: context.files,
      workspacePath,
      options: context.options,
    }
  }

  /**
   * 构建完整的 Prompt
   *
   * @param context Run 上下文
   * @returns 完整 Prompt
   */
  private buildPrompt(context: RunContext): string {
    let prompt = context.userInput

    // 如果有之前的审查反馈，添加到 Prompt 前面
    if (context.previousFeedback && context.previousFeedback.length > 0) {
      const feedbackText = this.feedbackToPrompt(context.previousFeedback)
      prompt = feedbackText + '\n\n' + prompt
    }

    return prompt
  }

  /**
   * 将审查反馈转换为 Prompt
   *
   * @param feedback 反馈列表
   * @returns Prompt 文本
   */
  private feedbackToPrompt(feedback: ReviewFeedback[]): string {
    const sections: string[] = []

    // 按类型分组反馈
    const fixIssues = feedback.filter(f => f.type === 'fix_issue')
    const improvements = feedback.filter(f => f.type === 'improve')
    const retries = feedback.filter(f => f.type === 'retry')
    const changes = feedback.filter(f => f.type === 'change_approach')

    if (fixIssues.length > 0) {
      sections.push('## 需要修复的问题')
      fixIssues.forEach(f => {
        sections.push(f.content)
        if (f.affectedFiles && f.affectedFiles.length > 0) {
          sections.push(`涉及文件：${f.affectedFiles.join(', ')}`)
        }
      })
    }

    if (improvements.length > 0) {
      sections.push('## 改进建议')
      improvements.forEach(f => {
        sections.push(f.content)
        if (f.affectedFiles && f.affectedFiles.length > 0) {
          sections.push(`涉及文件：${f.affectedFiles.join(', ')}`)
        }
      })
    }

    if (retries.length > 0) {
      sections.push('## 请重试')
      retries.forEach(f => {
        sections.push(f.content)
      })
    }

    if (changes.length > 0) {
      sections.push('## 请换一种方法')
      changes.forEach(f => {
        sections.push(f.content)
      })
    }

    if (sections.length === 0) {
      return ''
    }

    return `
<review_feedback>
这是人类对你之前执行的审查反馈，请仔细阅读并相应修改你的方案：

${sections.join('\n\n')}

---

请基于以上反馈重新执行任务，确保：
1. 直接回应反馈中指出的问题
2. 解释你做了哪些调整
3. 如果认为反馈有误，请说明原因
</review_feedback>
`
  }

  /**
   * 处理事件，构建消息和工具调用
   *
   * @param event AI 事件
   * @param messages 消息列表
   * @param toolCalls 工具调用列表
   */
  private processEvent(event: AIEvent, messages: Message[], toolCalls: ToolCall[]): void {
    switch (event.type) {
      case 'user_message':
        messages.push({
          id: crypto.randomUUID(),
          role: 'user',
          content: event.content,
          timestamp: Date.now(),
          files: event.files,
        })
        break

      case 'assistant_message':
        // 查找是否已存在（增量更新）
        const existingMessage = messages.find(m => m.role === 'assistant')
        if (existingMessage && event.isDelta) {
          existingMessage.content += event.content
        } else {
          messages.push({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: event.content,
            timestamp: Date.now(),
          })
        }

        // 处理工具调用
        if (event.toolCalls) {
          event.toolCalls.forEach((tc: any) => {
            const existingCall = toolCalls.find(t => t.id === tc.id)
            if (existingCall) {
              existingCall.status = tc.status
              existingCall.result = tc.result
              if (tc.status === 'completed' || tc.status === 'failed') {
                existingCall.endedAt = Date.now()
              }
            } else {
              toolCalls.push({
                id: tc.id,
                tool: tc.name,
                args: tc.args as Record<string, unknown>,
                status: tc.status,
                startedAt: Date.now(),
              })
            }
          })
        }
        break

      case 'tool_call_start':
        toolCalls.push({
          id: event.callId || crypto.randomUUID(),
          tool: event.tool,
          args: event.args,
          status: 'running',
          startedAt: Date.now(),
        })
        break

      case 'tool_call_end':
        const call = toolCalls.find(t => t.tool === event.tool && t.status === 'running')
        if (call) {
          call.status = event.success ? 'completed' : 'failed'
          call.result = event.result
          call.endedAt = Date.now()
        }
        break
    }
  }

  /**
   * 构建快照
   *
   * @param events 所有事件
   * @param messages 消息列表
   * @param toolCalls 工具调用列表
   * @param startedAt 开始时间
   * @returns 快照
   */
  private buildSnapshot(
    events: AIEvent[],
    messages: Message[],
    toolCalls: ToolCall[],
    startedAt: number
  ): RunSnapshot {
    const endedAt = Date.now()
    const duration = endedAt - startedAt

    // 从事件中提取文件变更
    const fileChanges = this.extractFileChanges(events)

    // 从事件中计算 Token 使用
    const tokenUsage = this.calculateTokenUsage(events)

    return {
      messages,
      toolCalls,
      fileChanges,
      duration,
      tokenUsage,
      generatedAt: endedAt,
    }
  }

  /**
   * 从事件中提取文件变更
   *
   * @param _events 所有事件
   * @returns 文件变更列表
   */
  private extractFileChanges(_events: AIEvent[]): FileChange[] {
    // TODO: 从事件中提取文件变更信息
    // 目前需要根据具体 Agent 的事件格式来实现
    return []
  }

  /**
   * 计算 Token 使用
   *
   * @param _events 所有事件
   * @returns Token 使用统计
   */
  private calculateTokenUsage(_events: AIEvent[]): TokenUsage {
    // TODO: 从事件中计算 Token 使用
    // 目前需要根据具体 Agent 的事件格式来实现
    return {
      input: 0,
      output: 0,
      total: 0,
    }
  }

  /**
   * 广播事件（供 UI 展示）
   *
   * @param runId Run ID
   * @param event AI 事件
   */
  private broadcastEvent(runId: string, event: AIEvent): void {
    // 使用自定义事件广播
    window.dispatchEvent(new CustomEvent('run:event', {
      detail: { runId, event },
    }))
  }

  /**
   * 准备下次执行的上下文（防止上下文膨胀）
   *
   * @param feedback 反馈列表
   * @returns 过滤后的反馈列表
   */
  prepareNextRunContext(feedback: ReviewFeedback[]): ReviewFeedback[] {
    // 只取高优先级和中优先级的反馈
    const activeFeedback = feedback.filter(f => f.priority === 'high' || f.priority === 'medium')

    // 最多保留 3 条反馈
    if (activeFeedback.length > 3) {
      // 优先保留高优先级的
      const highPriority = activeFeedback.filter(f => f.priority === 'high')
      const mediumPriority = activeFeedback.filter(f => f.priority === 'medium')

      return [
        ...highPriority,
        ...mediumPriority.slice(0, 3 - highPriority.length),
      ]
    }

    return activeFeedback
  }
}

/**
 * 单例 Run Manager
 */
let runManagerInstance: RunManager | null = null

/**
 * 获取 Run Manager 单例
 */
export function getRunManager(): RunManager {
  if (!runManagerInstance) {
    runManagerInstance = new RunManager()
  }
  return runManagerInstance
}
