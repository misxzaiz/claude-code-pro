/**
 * DeepSeek Session
 *
 * DeepSeek 会话实现，负责：
 * - 对话历史管理（上下文记忆）
 * - 工具调用循环
 * - 流式响应处理
 * - 与 Tauri 后端的工具执行桥接
 *
 * @author Polaris Team
 * @since 2025-01-24
 */

import type { AISessionConfig } from '../../ai-runtime'
import type { AITask, AIEvent } from '../../ai-runtime'
import { BaseSession } from '../../ai-runtime/base'
import { createEventIterable } from '../../ai-runtime/base'
import { ToolCallManager } from './tool-manager'
import { generateToolSchemas } from './tools'
import { tokenTracker } from '../../ai-runtime/token-manager'

/**
 * DeepSeek API 消息格式
 */
interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  tool_calls?: Array<{
    id: string
    type: string
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
}

/**
 * DeepSeek API 响应格式
 */
interface DeepSeekResponse {
  id: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string | null
      tool_calls: Array<{
        id: string
        type: string
        function: {
          name: string
          arguments: string
        }
      }> | null
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * DeepSeek 会话配置
 */
export interface DeepSeekSessionConfig extends AISessionConfig {
  /** API Key */
  apiKey: string
  /** API Base URL */
  apiBase: string
  /** 模型名称 */
  model: string
  /** 温度参数 */
  temperature: number
  /** 最大 Token 数 */
  maxTokens: number
  /** 工作区路径 */
  workspaceDir?: string
  /** 超时时间 */
  timeout: number
}

/**
 * 工具调用信息
 */
interface ToolCall {
  id: string
  name: string
  arguments: Record<string, any>
}

/**
 * DeepSeek Session 实现
 *
 * 核心流程：
 * 1. 接收用户消息
 * 2. 调用 DeepSeek API
 * 3. 检查是否有工具调用
 * 4. 如果有工具调用，执行工具并获取结果
 * 5. 将工具结果添加到对话历史
 * 6. 重复步骤 2-5，直到没有工具调用
 * 7. 返回最终响应
 */
export class DeepSeekSession extends BaseSession {
  /** 会话配置 */
  protected config: DeepSeekSessionConfig

  /** 对话历史 */
  private messages: DeepSeekMessage[] = []

  /** 工具调用管理器 */
  private toolCallManager: ToolCallManager

  /** 当前任务 ID */
  private currentTaskId: string | null = null

  /** 最大工具调用迭代次数 (防止无限循环) */
  private readonly MAX_TOOL_ITERATIONS = 10

  /**
   * 构造函数
   *
   * @param id - 会话 ID
   * @param config - 会话配置
   */
  constructor(id: string, config: DeepSeekSessionConfig) {
    super({ id, config })
    this.config = config
    this.toolCallManager = new ToolCallManager(id, config)

    // 初始化系统消息
    this.initializeSystemMessage()

    console.log(`[DeepSeekSession] Session ${id} created`)
  }

  /**
   * 执行任务
   *
   * @param task - AI 任务
   * @returns 事件流
   */
  protected async executeTask(task: AITask): Promise<AsyncIterable<AIEvent>> {
    this.currentTaskId = task.id

    // 添加用户消息到历史
    this.addUserMessage(task.input.prompt)

    // 先创建事件迭代器，注册监听器
    // 这样 runToolLoop() 中发送的事件才能被捕获
    const eventIterable = createEventIterable(
      this.eventEmitter,
      (event) => event.type === 'session_end' || event.type === 'error'
    )

    // 在后台运行工具循环（不等待）
    // 这样事件发送时，监听器已经注册好了
    this.runToolLoop().catch(error => {
      console.error('[DeepSeekSession] Tool loop failed:', error)
      this.emit({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    })

    // 立即返回事件迭代器
    return eventIterable
  }

  /**
   * 工具调用循环 (核心逻辑)
   *
   * 循环执行以下步骤：
   * 1. 调用 DeepSeek API
   * 2. 解析响应内容
   * 3. 检查是否有工具调用
   * 4. 如果有，执行工具并获取结果
   * 5. 将工具结果添加到历史
   * 6. 重复直到没有工具调用或达到最大迭代次数
   */
  private async runToolLoop(): Promise<void> {
    let iteration = 0
    let lastToolCall = '' // 记录上一次的工具调用
    let repeatCount = 0 // 重复调用计数

    while (iteration < this.MAX_TOOL_ITERATIONS) {
      iteration++

      console.log(`[DeepSeekSession] Tool loop iteration ${iteration}`)

      // 步骤 1: 调用 DeepSeek API
      const response = await this.callDeepSeekAPI()

      if (!response) {
        // API 调用失败，退出循环
        console.error('[DeepSeekSession] API call failed, exiting loop')
        break
      }

      // 步骤 2: 解析响应
      const message = response.choices[0].message

      // 步骤 3: 处理文本内容
      const textContent = message.content || ''
      if (textContent) {
        // 模拟流式输出（逐字符发送）
        await this.streamTextContent(textContent)
      }

      // 步骤 4: 提取工具调用
      const toolCalls = this.extractToolCalls(message)

      if (toolCalls.length === 0) {
        // 没有工具调用，正常退出循环
        console.log('[DeepSeekSession] No tool calls, exiting loop')
        break
      }

      // 智能检测：检查是否陷入重复工具调用循环
      const currentToolCall = toolCalls[toolCalls.length - 1].name
      if (currentToolCall === lastToolCall) {
        repeatCount++
        if (repeatCount >= 3) {
          console.warn(`[DeepSeekSession] 检测到重复工具调用 (${currentToolCall})，退出循环`)
          this.emit({
            type: 'progress',
            message: `检测到重复操作，已完成任务`,
          })
          break
        }
      } else {
        repeatCount = 0
        lastToolCall = currentToolCall
      }

      // 步骤 5: 执行所有工具调用
      for (const toolCall of toolCalls) {
        await this.executeToolCall(toolCall)
      }

      // 步骤 6: 工具结果已添加到消息历史，继续下一轮
      console.log(`[DeepSeekSession] Tool calls completed, continuing to next iteration`)

      // 发送进度事件
      this.emit({
        type: 'progress',
        message: `正在处理工具调用结果... (${iteration}/${this.MAX_TOOL_ITERATIONS})`,
      })
    }

    // 检查是否达到最大迭代次数
    if (iteration >= this.MAX_TOOL_ITERATIONS) {
      console.warn('[DeepSeekSession] Reached max tool iterations')
      this.emit({
        type: 'progress',
        message: '达到最大工具调用次数，可能会影响任务完成',
      })
    }

    // 发送会话结束事件
    this.emit({
      type: 'session_end',
      sessionId: this.id,
    })
  }

  /**
   * 调用 DeepSeek API
   *
   * @returns API 响应，失败返回 null
   */
  private async callDeepSeekAPI(): Promise<DeepSeekResponse | null> {
    try {
      // 生成工具 Schema
      const tools = generateToolSchemas()

      // 裁剪消息历史以适应 token 预算
      const trimmedMessages = this.trimMessagesToFitBudget()

      // 构建请求
      const requestBody = {
        model: this.config.model,
        messages: trimmedMessages, // 使用裁剪后的消息
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: false, // 工具调用需要完整响应
        tools,
      }

      console.log('[DeepSeekSession] Calling API', {
        model: this.config.model,
        messageCount: trimmedMessages.length,
        originalCount: this.messages.length,
        trimmed: this.messages.length !== trimmedMessages.length,
      })

      // 发送请求
      const response = await fetch(`${this.config.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeout),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`DeepSeek API error (${response.status}): ${errorText}`)
      }

      const data: DeepSeekResponse = await response.json()

      // 记录 token 使用
      if (data.usage) {
        tokenTracker.recordUsage(
          this.id,
          this.config.model,
          data.usage.prompt_tokens,
          data.usage.completion_tokens
        )

        console.log('[DeepSeekSession] Token usage', {
          prompt: data.usage.prompt_tokens,
          completion: data.usage.completion_tokens,
          total: data.usage.total_tokens,
          estimatedCost: tokenTracker.getSessionUsage(this.id)?.estimatedCost,
        })
      }

      console.log('[DeepSeekSession] API response received', {
        finishReason: data.choices[0].finish_reason,
        usage: data.usage,
      })

      // 添加助手消息到历史
      this.messages.push({
        role: 'assistant',
        content: data.choices[0].message.content || undefined,
        tool_calls: data.choices[0].message.tool_calls || undefined,
      })

      return data

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('[DeepSeekSession] API call failed:', errorMsg)

      this.emit({
        type: 'error',
        error: errorMsg,
      })

      return null
    }
  }

  /**
   * 流式发送文本内容
   *
   * @param content - 文本内容
   */
  private async streamTextContent(content: string): Promise<void> {
    // 逐字符发送（模拟流式输出）
    for (const char of content) {
      this.emit({
        type: 'assistant_message',
        content: char,
        isDelta: true,
      })

      // 小延迟，避免事件过多
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }

  /**
   * 提取工具调用
   *
   * @param message - API 返回的消息
   * @returns 工具调用列表
   */
  private extractToolCalls(message: DeepSeekResponse['choices'][0]['message']): ToolCall[] {
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return []
    }

    return message.tool_calls.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    }))
  }

  /**
   * 执行工具调用
   *
   * @param toolCall - 工具调用信息
   */
  private async executeToolCall(toolCall: ToolCall): Promise<void> {
    const { id, name, arguments: args } = toolCall

    console.log(`[DeepSeekSession] Executing tool: ${name}`, args)

    // 发送工具调用开始事件
    this.emit({
      type: 'tool_call_start',
      callId: id,  // 添加 callId 以便追踪工具调用
      tool: name,
      args,
    })

    try {
      // 执行工具
      const result = await this.toolCallManager.executeTool(name, args)

      console.log(`[DeepSeekSession] Tool ${name} completed`, {
        resultLength: JSON.stringify(result).length,
      })

      // 发送工具调用结束事件
      this.emit({
        type: 'tool_call_end',
        callId: id,  // 添加 callId 以匹配 tool_call_start
        tool: name,
        result,
        success: true,
      })

      // 将工具结果添加到消息历史
      this.addToolMessage(id, result)

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[DeepSeekSession] Tool ${name} failed:`, errorMsg)

      // 发送工具调用失败事件
      this.emit({
        type: 'tool_call_end',
        callId: id,
        tool: name,
        result: errorMsg,
        success: false,
      })

      // 将错误作为工具结果添加到历史
      this.addToolMessage(id, {
        error: errorMsg,
        success: false,
      })
    }
  }

  /**
   * 添加用户消息
   *
   * @param content - 消息内容
   */
  private addUserMessage(content: string): void {
    this.messages.push({
      role: 'user',
      content,
    })
  }

  /**
   * 添加工具消息 (工具执行结果)
   *
   * @param toolCallId - 工具调用 ID
   * @param result - 执行结果
   */
  private addToolMessage(toolCallId: string, result: any): void {
    this.messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      // 移除格式化以节省 token（可节省 30-50% 的工具结果 token）
      content: typeof result === 'string' ? result : JSON.stringify(result),
    })
  }

  /**
   * 初始化系统消息
   */
  private initializeSystemMessage(): void {
    this.messages = [{
      role: 'system',
      content: this.buildSystemPrompt(),
    }]
  }

  /**
   * 构建系统提示词
   *
   * @returns 系统提示词
   */
  private buildSystemPrompt(): string {
    const lines: string[] = [
      '# Polaris - 智能编程助手',
      '',
      '你是一个专业的编程助手，帮助用户完成各种编程任务。',
      '',
      '## 核心能力',
      '',
      '- **代码分析**: 理解和解释代码逻辑',
      '- **代码生成**: 根据需求生成高质量代码',
      '- **代码重构**: 优化和改进现有代码',
      '- **文件操作**: 读取、编辑、创建文件',
      '- **Git 操作**: 查看状态、diff、提交等',
      '- **待办管理**: 管理开发任务',
      '',
      '## 工作原则',
      '',
      '1. **理解优先**: 在执行操作前，先充分理解用户需求',
      '2. **精确操作**: 使用工具时确保参数正确',
      '3. **代码质量**: 遵循最佳实践和项目风格',
      '4. **清晰解释**: 提供详细的解释和建议',
      '',
    ]

    // 添加工作区信息
    if (this.config.workspaceDir) {
      lines.push(
        '## 工作区信息',
        '',
        `当前工作区: \`${this.config.workspaceDir}\``,
        ''
      )
    }

    lines.push(
      '## 工具使用说明',
      '',
      '- 使用 `bash` 工具执行命令行操作',
      '- 使用 `read_file` 读取文件内容',
      '- 使用 `write_file` 创建新文件',
      '- 使用 `edit_file` 编辑现有文件（精确替换）',
      '- 使用 `git_status` 和 `git_diff` 查看 Git 状态',
      '- 使用 `todo_*` 工具管理待办事项',
      '',
      '现在开始工作吧！'
    )

    return lines.join('\n')
  }

  /**
   * 估算消息的 token 数量
   *
   * 使用简化算法：中文约 2 字符/token，英文约 4 字符/token
   *
   * @param message - 要估算的消息
   * @returns 估算的 token 数量
   */
  private estimateTokens(message: DeepSeekMessage): number {
    if (!message.content) return 0

    const content = String(message.content)
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length
    const otherChars = content.length - chineseChars

    // 中文约 2 字符/token，英文约 4 字符/token
    return Math.ceil(chineseChars / 2 + otherChars / 4)
  }

  /**
   * 裁剪消息历史以适应 token 预算
   *
   * DeepSeek 支持 128K tokens，预留 28K 给输出，最多使用 100K
   *
   * @returns 裁剪后的消息列表
   */
  private trimMessagesToFitBudget(): DeepSeekMessage[] {
    const maxTokens = 100000 // 预留 28K 给输出
    let usedTokens = 0
    const result: DeepSeekMessage[] = []

    // 倒序遍历，优先保留最近的消息（包括系统消息）
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i]
      const tokens = this.estimateTokens(msg)

      // 系统消息必须保留
      if (msg.role === 'system') {
        result.unshift(msg)
        usedTokens += tokens
        continue
      }

      // 检查是否超出预算
      if (usedTokens + tokens <= maxTokens) {
        result.unshift(msg)
        usedTokens += tokens
      } else if (result.length === 1) {
        // 至少保留系统消息和一条用户消息
        result.unshift(msg)
        break
      } else {
        // 已经超出预算，停止添加
        console.log(`[DeepSeekSession] Trimmed ${this.messages.length - result.length} messages to fit token budget`)
        break
      }
    }

    return result
  }

  /**
   * 中断任务
   *
   * @param taskId - 任务 ID (可选)
   */
  protected abortTask(taskId?: string): void {
    if (taskId && taskId !== this.currentTaskId) {
      return
    }

    console.log(`[DeepSeekSession] Aborting task: ${this.currentTaskId}`)
    this._status = 'idle'
    this.currentTaskId = null
  }

  /**
   * 释放资源
   */
  protected disposeResources(): void {
    console.log(`[DeepSeekSession] Disposing session: ${this.id}`)
    this.messages = []
    this.currentTaskId = null
  }

  /**
   * 继续会话 (多轮对话)
   *
   * @param prompt - 用户输入
   */
  async continue(prompt: string): Promise<void> {
    if (this.isDisposed) {
      throw new Error('[DeepSeekSession] Session has been disposed')
    }

    console.log(`[DeepSeekSession] Continuing session with prompt: ${prompt}`)

    // 添加用户消息
    this.addUserMessage(prompt)

    // 发送用户消息事件
    this.emit({
      type: 'user_message',
      content: prompt,
    })

    // 更新状态
    this._status = 'running'

    // 运行工具调用循环
    await this.runToolLoop()
  }

  /**
   * 获取对话历史
   *
   * @returns 对话历史 (只读)
   */
  getMessages(): Readonly<DeepSeekMessage[]> {
    return [...this.messages]
  }

  /**
   * 清空对话历史 (保留系统消息)
   */
  clearHistory(): void {
    this.initializeSystemMessage()
    console.log(`[DeepSeekSession] History cleared for session: ${this.id}`)
  }
}
