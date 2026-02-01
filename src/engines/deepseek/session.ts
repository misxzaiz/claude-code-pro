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
import { PromptBuilder, IntentDetector } from './core'

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

  /** 提示词构建器 */
  private promptBuilder: PromptBuilder

  /** 意图检测器 */
  private intentDetector: IntentDetector

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

    // 初始化核心组件
    this.promptBuilder = new PromptBuilder({
      workspaceDir: config.workspaceDir,
      verbose: config.verbose
    })
    this.intentDetector = new IntentDetector()

    // 初始化系统消息（使用精简版本）
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

    // 🔄 渐进式提示词：根据意图动态构建系统提示词
    const userMessage = task.input.prompt
    const fullSystemPrompt = await this.buildFullSystemPrompt(userMessage)

    // 更新系统消息
    this.messages[0] = {
      role: 'system',
      content: fullSystemPrompt,
    }

    // 添加用户消息到历史
    this.addUserMessage(userMessage)

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
        this.emit({
          type: 'assistant_message',
          content: textContent,
          isDelta: true,
        })
      }

      // 步骤 4: 提取工具调用
      const toolCalls = this.extractToolCalls(message)

      if (toolCalls.length === 0) {
        // 没有工具调用，正常退出循环
        console.log('[DeepSeekSession] No tool calls, exiting loop')
        break
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
    // if (iteration >= this.MAX_TOOL_ITERATIONS) {
    //   console.warn('[DeepSeekSession] Reached max tool iterations')
    //   this.emit({
    //     type: 'progress',
    //     message: '达到最大工具调用次数，可能会影响任务完成',
    //   })
    // }

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

      // 区分不同类型的错误
      if (error instanceof DOMException && error.name === 'AbortError') {
        // 用户主动取消或超时
        console.log('[DeepSeekSession] Request aborted by user or timeout')

        // 不发送错误事件，因为这是正常操作
        return null
      }

      // 其他错误（网络错误、API 错误等）
      console.error('[DeepSeekSession] API call failed:', errorMsg)

      this.emit({
        type: 'error',
        error: errorMsg,
      })

      return null
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
      const toolResult = await this.toolCallManager.executeTool(name, args)

      console.log(`[DeepSeekSession] Tool ${name} completed`, {
        success: toolResult.success,
        hasData: !!toolResult.data,
      })

      // 格式化工具结果为字符串
      let resultText: string
      if (toolResult.success) {
        if (typeof toolResult.data === 'string') {
          resultText = toolResult.data
        } else if (toolResult.data !== undefined) {
          resultText = JSON.stringify(toolResult.data)
        } else {
          resultText = '操作成功'
        }
      } else {
        resultText = toolResult.error || '操作失败'
      }

      // 发送工具调用结束事件
      this.emit({
        type: 'tool_call_end',
        callId: id,
        tool: name,
        result: resultText,
        success: toolResult.success,
      })

      // 将工具结果添加到消息历史
      this.addToolMessage(id, resultText)

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
   *
   * 使用精简的核心提示词，完整的系统提示词将在执行任务时根据意图动态构建
   */
  private initializeSystemMessage(): void {
    console.log(`[DeepSeekSession] initializeSystemMessage - Session ${this.id}:`, {
      workspaceDir: this.config.workspaceDir,
    })

    // 使用精简的核心提示词
    const corePrompt = this.promptBuilder.buildCore()

    this.messages = [{
      role: 'system',
      content: corePrompt,
    }]

    console.log(`[DeepSeekSession] ✅ Core prompt initialized (${this.estimateTokens(corePrompt)} tokens)`)
  }

  /**
   * 构建完整的系统提示词（渐进式）
   *
   * 根据用户意图动态加载相关上下文
   *
   * @param userMessage - 用户消息
   * @returns 完整的系统提示词
   */
  private async buildFullSystemPrompt(userMessage: string): Promise<string> {
    // 1. 检测意图
    const intent = this.intentDetector.detect(userMessage)

    console.log('[DeepSeekSession] Intent detected:', {
      type: intent.type,
      requiresTools: intent.requiresTools,
      complexity: intent.complexity,
    })

    // 2. 构建渐进式提示词
    const fullPrompt = await this.promptBuilder.build(intent)

    // 3. 记录 Token 使用
    const tokens = this.estimateTokens(fullPrompt)
    console.log(`[DeepSeekSession] Full system prompt size: ${tokens} tokens`)

    return fullPrompt
  }

  /**
   * 构建系统提示词（旧版，保留用于兼容）
   *
   * @deprecated 使用 buildFullSystemPrompt 替代
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
    console.log(`[DeepSeekSession] buildSystemPrompt - workspaceDir:`, {
      hasWorkspaceDir: !!this.config.workspaceDir,
      workspaceDir: this.config.workspaceDir,
      sessionId: this.id,
    })

    if (this.config.workspaceDir) {
      lines.push(
        '## 📁 工作区信息',
        '',
        `当前工作区: \`${this.config.workspaceDir}\` (仅供内部参考，不要在回复中引用此绝对路径)`,
        '',
        '### ⚠️ 路径使用规则',
        '',
        '**重要**：所有文件操作必须使用相对路径，从工作区根目录开始计算。',
        '',
        '✅ **正确示例**：',
        '```',
        "read_file(path='src/App.tsx')",
        "write_file(path='utils/helper.js', content='...')",
        "list_files(path='components', recursive=true)",
        "bash(command='npm test')  // 自动在工作区中执行",
        '```',
        '',
        '❌ **错误示例（不要这样）**：',
        '```',
        "read_file(path='C:\\\\Users\\\\...\\\\src\\\\App.tsx')  // 绝对路径",
        "read_file(path='/home/user/project/src/App.tsx')  // 绝对路径",
        '```',
        ''
      )
      console.log(`[DeepSeekSession] ✅ 工作区信息已添加到系统提示词: ${this.config.workspaceDir}`)
    } else {
      console.warn(`[DeepSeekSession] ⚠️ workspaceDir 为空，系统提示词中不包含工作区信息`)
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
  private estimateTokens(message: DeepSeekMessage): number
  private estimateTokens(content: string): number
  private estimateTokens(input: DeepSeekMessage | string): number {
    const content = typeof input === 'string' ? input : (input.content || '')

    if (!content) return 0

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

    console.log(`[DeepSeekSession] trimMessagesToFitBudget - Session ${this.id}:`, {
      originalMessageCount: this.messages.length,
      maxTokens,
      workspaceDir: this.config.workspaceDir,
    })

    // 倒序遍历，优先保留最近的消息（包括系统消息）
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i]

      // 如果是系统消息，动态更新它以确保包含最新的工作区信息
      if (msg.role === 'system') {
        const updatedSystemMessage = this.buildSystemPrompt()
        const tokens = this.estimateTokens({ ...msg, content: updatedSystemMessage })

        console.log(`[DeepSeekSession] 🔁 动态更新系统消息:`, {
          hasWorkspaceInfo: updatedSystemMessage.includes('当前工作区'),
          workspaceDir: this.config.workspaceDir,
          tokens,
        })

        result.unshift({
          ...msg,
          content: updatedSystemMessage,
        })
        usedTokens += tokens
        continue
      }

      const tokens = this.estimateTokens(msg)

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

    // ✅ 关键修复：确保至少有系统消息
    if (result.length === 0) {
      console.error(`[DeepSeekSession] ❌ 裁剪后消息为空！原始消息数: ${this.messages.length}，强制添加系统消息`)
      result.push({
        role: 'system',
        content: this.buildSystemPrompt(),
      })
    }

    // ✅ 确保 system 消息在第一位
    if (result.length > 0 && result[0].role !== 'system') {
      console.warn(`[DeepSeekSession] ⚠️ 系统消息不在第一位，重新排列`)
      const systemMsg = result.find(msg => msg.role === 'system')
      const filtered = result.filter(msg => msg.role !== 'system')
      if (systemMsg) {
        result.length = 0
        result.push(systemMsg, ...filtered)
      }
    }

    console.log(`[DeepSeekSession] ✅ 裁剪完成: ${this.messages.length} → ${result.length} 条消息，使用 ${usedTokens} tokens`)

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
