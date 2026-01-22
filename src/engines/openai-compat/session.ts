/**
 * OpenAI 兼容引擎 - 会话实现（后端主导模式）
 *
 * 通过 Tauri 后端代理 OpenAI API 请求，避免浏览器 CORS 限制
 */

import type { AISession, AISessionConfig, AITask } from '../../ai-runtime'
import { BaseSession } from '../../ai-runtime/base'
import { createEventIterable } from '../../ai-runtime/base'
import type { OpenAICompatConfig } from './types'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/**
 * OpenAI 兼容会话
 */
export class OpenAICompatSession extends BaseSession {
  readonly engineId: string = 'openai-compat'
  private config: OpenAICompatConfig
  private currentTaskId: string | null = null
  private unlistenFn: UnlistenFn | null = null

  constructor(sessionConfig?: AISessionConfig, config?: OpenAICompatConfig) {
    const sessionId = crypto.randomUUID()
    super({ id: sessionId, config: sessionConfig })
    this.config = config || this.getDefaultConfig()
  }

  /**
   * 执行任务
   */
  protected async executeTask(task: AITask): Promise<AsyncIterable<AIEvent>> {
    this.currentTaskId = task.id

    try {
      // 设置事件监听
      await this.setupEventListener()

      // 获取配置（从 Store 获取最新配置）
      const { useOpenAICompatStore } = await import('../../stores/openaiCompatStore')
      const store = useOpenAICompatStore.getState()
      const engineConfig = (store as any).getEngineConfig()

      if (!engineConfig || !engineConfig.apiKey) {
        throw new Error('OpenAI 配置不完整或 API Key 未设置')
      }

      // 构建请求配置
      const requestConfig = {
        apiKey: engineConfig.apiKey,
        baseURL: engineConfig.baseURL,
        model: engineConfig.model,
        temperature: engineConfig.temperature || 0.7,
        maxTokens: engineConfig.maxTokens || 4096,
        enableTools: engineConfig.enableTools !== false,
      }

      // 调用 Tauri 后端
      const { invoke } = await import('@tauri-apps/api/core')
      const sessionId = await invoke('start_openai_chat', {
        message: task.input.prompt,
        config: requestConfig,
      })

      // 发出会话开始事件
      this.emit({
        type: 'session_start',
        sessionId: this.id,
      })

      return createEventIterable(
        this.eventEmitter,
        (event) => event.type === 'session_end' || event.type === 'error'
      )
    } catch (error) {
      this.emit({
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * 设置事件监听器
   * 监听 Tauri 后端发送的 chat-event
   */
  private async setupEventListener(): Promise<void> {
    // 清除之前的监听器
    if (this.unlistenFn) {
      this.unlistenFn()
      this.unlistenFn = null
    }

    // 监听 Tauri 的 chat-event
    this.unlistenFn = await listen('chat-event', (event) => {
      try {
        const payload = event.payload as {
          type: string
          sessionId: string
          text?: string
          reason?: string
        }

        // 只处理属于当前会话的事件
        if (payload.sessionId !== this.id) {
          return
        }

        // 根据事件类型分发
        switch (payload.type) {
          case 'text_delta':
            if (payload.text) {
              this.emit({
                type: 'token',
                value: payload.text
              })
            }
            break

          case 'session_end':
            this.emit({
              type: 'session_end',
              sessionId: this.id,
              reason: (payload.reason as any) || 'completed'
            })
            break

          case 'error':
            this.emit({
              type: 'error',
              error: payload.text || '未知错误'
            })
            break

          default:
            // 其他事件类型也转发
            if (payload.text) {
              this.emit({
                type: 'progress',
                message: payload.text
              })
            }
        }
      } catch (e) {
        console.error('[OpenAICompatSession] 处理事件失败:', e)
      }
    })
  }

  /**
   * 中断任务
   */
  protected abortTask(taskId?: string): void {
    if (taskId && taskId !== this.currentTaskId) {
      console.warn(`[OpenAICompatSession] 任务 ID 不匹配: ${taskId} != ${this.currentTaskId}`)
      return
    }

    // 调用后端中断命令
    invoke('interrupt_openai_chat', { sessionId: this.id }).catch((e) => {
      console.error('[OpenAICompatSession] 中断失败:', e)
    })

    this.emit({
      type: 'session_end',
      sessionId: this.id,
      reason: 'aborted'
    })

    this.currentTaskId = null
  }

  /**
   * 释放资源
   */
  protected disposeResources(): void {
    if (this.unlistenFn) {
      this.unlistenFn()
      this.unlistenFn = null
    }

    this.currentTaskId = null
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<OpenAICompatConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): OpenAICompatConfig {
    return { ...this.config }
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): OpenAICompatConfig {
    return {
      apiKey: '',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 4096,
      stream: true,
      enableTools: true,
      timeout: 60000,
    }
  }
}

/**
 * 创建 OpenAI 兼容会话
 */
export function createOpenAICompatSession(
  sessionConfig?: AISessionConfig,
  config?: OpenAICompatConfig
): OpenAICompatSession {
  return new OpenAICompatSession(sessionConfig, config)
}
