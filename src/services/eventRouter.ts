/**
 * 事件路由器
 *
 * 根据 contextId 将 chat-event 路由到正确的处理器
 * 解决多个监听者同时监听 chat-event 导致的会话混乱问题
 */

import { listen, UnlistenFn } from '@tauri-apps/api/event'

export type ContextId = 'main' | 'git-commit' | string

export interface RoutedEvent {
  contextId: ContextId
  payload: unknown
}

export type EventHandler = (payload: unknown) => void

export class EventRouter {
  private handlers: Map<ContextId, Set<EventHandler>> = new Map()
  private unlisten: UnlistenFn | null = null
  private initialized = false
  private initPromise: Promise<void> | null = null

  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this.doInitialize()
    return this.initPromise
  }

  private async doInitialize(): Promise<void> {
    this.unlisten = await listen<string>('chat-event', (event) => {
      try {
        const rawData = JSON.parse(event.payload)

        let routedEvent: RoutedEvent

        if (rawData.contextId !== undefined && rawData.payload !== undefined) {
          routedEvent = {
            contextId: rawData.contextId,
            payload: rawData.payload
          }
        } else {
          routedEvent = {
            contextId: 'main',
            payload: rawData
          }
        }

        this.dispatch(routedEvent)
      } catch (e) {
        console.error('[EventRouter] Failed to parse event:', e)
      }
    })

    this.initialized = true
  }

  register(contextId: ContextId, handler: EventHandler): () => void {
    if (!this.handlers.has(contextId)) {
      this.handlers.set(contextId, new Set())
    }
    this.handlers.get(contextId)!.add(handler)

    return () => {
      this.handlers.get(contextId)?.delete(handler)
    }
  }

  private dispatch(event: RoutedEvent): void {
    const handlers = this.handlers.get(event.contextId)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event.payload)
        } catch (e) {
          console.error(`[EventRouter] Handler error for ${event.contextId}:`, e)
        }
      })
    }

    const wildcardHandlers = this.handlers.get('*')
    if (wildcardHandlers) {
      wildcardHandlers.forEach(handler => {
        try {
          handler(event)
        } catch (e) {
          console.error('[EventRouter] Wildcard handler error:', e)
        }
      })
    }
  }

  destroy(): void {
    if (this.unlisten) {
      this.unlisten()
      this.unlisten = null
    }
    this.handlers.clear()
    this.initialized = false
    this.initPromise = null
  }

  isInitialized(): boolean {
    return this.initialized
  }
}

let routerInstance: EventRouter | null = null
let globalInitPromise: Promise<void> | null = null

export function getEventRouter(): EventRouter {
  if (!routerInstance) {
    routerInstance = new EventRouter()
  }
  return routerInstance
}

export async function ensureEventRouterInitialized(): Promise<EventRouter> {
  const router = getEventRouter()
  await router.initialize()
  return router
}

export function createContextId(prefix: string = 'ctx'): ContextId {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
