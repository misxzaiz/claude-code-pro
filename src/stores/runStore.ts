/**
 * Run Store
 *
 * 管理 Agent 执行状态
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AgentRun,
  RunSummary,
  RunStatus,
  CreateRunParams,
  RunSnapshot,
} from '../core/models'
import type { AIEvent } from '../ai-runtime/event'

/**
 * Run Store 状态
 */
interface RunState {
  /** 所有 Run 的简略信息（完整事件存 IndexedDB） */
  runs: Record<string, RunSummary>

  /** 当前正在执行的 Run ID */
  activeRunId: string | null

  /** 加载状态 */
  isLoading: boolean

  /** 错误信息 */
  error: string | null
}

/**
 * Run Store 操作
 */
interface RunActions {
  /** 获取所有 Run */
  getAllRuns: () => RunSummary[]

  /** 获取单个 Run 简略信息 */
  getRunSummary: (id: string) => RunSummary | undefined

  /** 获取任务的 Runs */
  getRunsByTask: (taskId: string) => RunSummary[]

  /** 创建 Run */
  createRun: (params: CreateRunParams) => AgentRun

  /** 更新 Run 状态 */
  updateRunStatus: (id: string, status: RunStatus, error?: string) => void

  /** 添加事件到 Run（用于构建快照） */
  addEventToRun: (runId: string, event: AIEvent) => void

  /** 完成 Run（生成快照） */
  completeRun: (runId: string, snapshot: RunSnapshot) => void

  /** 中断 Run */
  abortRun: (id: string) => void

  /** 删除 Run */
  deleteRun: (id: string) => void

  /** 按状态获取 Run */
  getRunsByStatus: (status: RunStatus) => RunSummary[]

  /** 获取完整 Run（从 IndexedDB 加载事件） */
  loadFullRun: (id: string) => Promise<AgentRun | null>

  /** 设置活跃 Run */
  setActiveRun: (id: string | null) => void

  /** 清空所有 Run */
  clearRuns: () => void

  /** 设置加载状态 */
  setLoading: (loading: boolean) => void

  /** 设置错误信息 */
  setError: (error: string | null) => void
}

/**
 * Run Store 类型
 */
export type RunStore = RunState & RunActions

/**
 * 临时存储正在执行的 Run 的事件（内存中）
 */
const activeRunEvents = new Map<string, AIEvent[]>()

/**
 * 创建 Run Store
 */
export const useRunStore = create<RunStore>()(
  persist(
    (set, get) => ({
      // ========== 状态 ==========

      runs: {},
      activeRunId: null,
      isLoading: false,
      error: null,

      // ========== 操作 ==========

      getAllRuns: () => {
        return Object.values(get().runs).sort(
          (a, b) => b.startedAt - a.startedAt
        )
      },

      getRunSummary: (id: string) => {
        return get().runs[id]
      },

      getRunsByTask: (taskId: string) => {
        return Object.values(get().runs)
          .filter(run => run.taskId === taskId)
          .sort((a, b) => a.sequence - b.sequence)
      },

      createRun: (params: CreateRunParams) => {
        const now = Date.now()
        const run: AgentRun = {
          id: crypto.randomUUID(),
          taskId: params.taskId,
          sequence: params.sequence,
          agentType: params.agentType,
          status: 'pending',
          context: params.context,
          startedAt: now,
        }

        // 创建简略信息用于存储
        const summary: RunSummary = {
          id: run.id,
          taskId: run.taskId,
          sequence: run.sequence,
          agentType: run.agentType,
          status: run.status,
          startedAt: run.startedAt,
          summary: {
            messageCount: 0,
            toolCallCount: 0,
            fileChangeCount: 0,
            duration: 0,
          },
          hasError: false,
        }

        set(state => ({
          runs: { ...state.runs, [run.id]: summary },
        }))

        // 初始化事件存储
        activeRunEvents.set(run.id, [])

        return run
      },

      updateRunStatus: (id: string, status: RunStatus, error?: string) => {
        const run = get().runs[id]
        if (!run) {
          return
        }

        const updatedRun: RunSummary = {
          ...run,
          status,
          endedAt: status === 'completed' || status === 'failed' || status === 'cancelled'
            ? Date.now()
            : run.endedAt,
          hasError: status === 'failed' || !!error,
        }

        // 更新执行时长
        if (updatedRun.endedAt) {
          updatedRun.summary.duration = updatedRun.endedAt - updatedRun.startedAt
        }

        set(state => ({
          runs: { ...state.runs, [id]: updatedRun },
        }))
      },

      addEventToRun: (runId: string, event: AIEvent) => {
        const events = activeRunEvents.get(runId)
        if (!events) {
          return
        }

        events.push(event)

        // 更新简略统计
        const run = get().runs[runId]
        if (!run) {
          return
        }

        const summary = { ...run.summary }

        // 根据事件类型更新统计
        switch (event.type) {
          case 'user_message':
          case 'assistant_message':
            summary.messageCount++
            break
          case 'tool_call_start':
            summary.toolCallCount++
            break
        }

        set(state => ({
          runs: {
            ...state.runs,
            [runId]: { ...run, summary },
          },
        }))
      },

      completeRun: (runId: string, snapshot: RunSnapshot) => {
        const run = get().runs[runId]
        if (!run) {
          return
        }

        const events = activeRunEvents.get(runId)
        const endedAt = Date.now()

        // 更新简略信息
        const updatedRun: RunSummary = {
          ...run,
          status: 'completed',
          endedAt,
          summary: {
            messageCount: snapshot.messages.length,
            toolCallCount: snapshot.toolCalls.length,
            fileChangeCount: snapshot.fileChanges?.length || 0,
            duration: endedAt - run.startedAt,
          },
          hasError: false,
        }

        set(state => ({
          runs: { ...state.runs, [runId]: updatedRun },
        }))

        // 保存完整事件到 IndexedDB
        if (events) {
          saveRunEventsToIndexedDB(runId, events)
          activeRunEvents.delete(runId)
        }

        // 保存快照到 IndexedDB
        saveRunSnapshotToIndexedDB(runId, snapshot)
      },

      abortRun: (id: string) => {
        get().updateRunStatus(id, 'cancelled')
        activeRunEvents.delete(id)
      },

      deleteRun: (id: string) => {
        set(state => {
          const newRuns = { ...state.runs }
          delete newRuns[id]
          return { runs: newRuns }
        })

        if (get().activeRunId === id) {
          set({ activeRunId: null })
        }

        activeRunEvents.delete(id)
      },

      getRunsByStatus: (status: RunStatus) => {
        return Object.values(get().runs)
          .filter(run => run.status === status)
          .sort((a, b) => b.startedAt - a.startedAt)
      },

      loadFullRun: async (id: string) => {
        const summary = get().runs[id]
        if (!summary) {
          return null
        }

        // 从 IndexedDB 加载完整事件
        const events = await loadRunEventsFromIndexedDB(id)
        const snapshot = await loadRunSnapshotFromIndexedDB(id)

        const fullRun: AgentRun = {
          id: summary.id,
          taskId: summary.taskId,
          sequence: summary.sequence,
          agentType: summary.agentType,
          status: summary.status,
          context: {} as any, // 需要从其他地方恢复
          snapshot,
          events,
          startedAt: summary.startedAt,
          endedAt: summary.endedAt,
        }

        return fullRun
      },

      setActiveRun: (id: string | null) => {
        set({ activeRunId: id })
      },

      clearRuns: () => {
        set({ runs: {}, activeRunId: null })
        activeRunEvents.clear()
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      setError: (error: string | null) => {
        set({ error })
      },
    }),
    {
      name: 'polaris-runs',
      partialize: (state) => ({
        runs: state.runs,
        activeRunId: state.activeRunId,
      }),
    }
  )
)

// ========== IndexedDB 工具函数 ==========

/**
 * 保存 Run 事件到 IndexedDB
 */
async function saveRunEventsToIndexedDB(runId: string, events: AIEvent[]): Promise<void> {
  try {
    const db = await getIndexedDB()
    const tx = db.transaction(['run_events'], 'readwrite')
    const store = tx.objectStore('run_events')

    await new Promise<void>((resolve, reject) => {
      const request = store.put({ runId, events })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.error('[RunStore] Failed to save events to IndexedDB:', error)
  }
}

/**
 * 从 IndexedDB 加载 Run 事件
 */
async function loadRunEventsFromIndexedDB(runId: string): Promise<AIEvent[]> {
  try {
    const db = await getIndexedDB()
    const tx = db.transaction(['run_events'], 'readonly')
    const store = tx.objectStore('run_events')

    const result = await new Promise<any>((resolve, reject) => {
      const request = store.get(runId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    return result?.events || []
  } catch (error) {
    console.error('[RunStore] Failed to load events from IndexedDB:', error)
    return []
  }
}

/**
 * 保存 Run 快照到 IndexedDB
 */
async function saveRunSnapshotToIndexedDB(runId: string, snapshot: RunSnapshot): Promise<void> {
  try {
    const db = await getIndexedDB()
    const tx = db.transaction(['run_snapshots'], 'readwrite')
    const store = tx.objectStore('run_snapshots')

    await new Promise<void>((resolve, reject) => {
      const request = store.put({ runId, snapshot })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.error('[RunStore] Failed to save snapshot to IndexedDB:', error)
  }
}

/**
 * 从 IndexedDB 加载 Run 快照
 */
async function loadRunSnapshotFromIndexedDB(runId: string): Promise<RunSnapshot | undefined> {
  try {
    const db = await getIndexedDB()
    const tx = db.transaction(['run_snapshots'], 'readonly')
    const store = tx.objectStore('run_snapshots')

    const result = await new Promise<any>((resolve, reject) => {
      const request = store.get(runId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    return result?.snapshot
  } catch (error) {
    console.error('[RunStore] Failed to load snapshot from IndexedDB:', error)
    return undefined
  }
}

/**
 * 获取 IndexedDB 实例
 */
let dbPromise: Promise<IDBDatabase> | null = null

function getIndexedDB(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('PolarisRuns', 1)

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'))
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // 创建 run_events 存储
      if (!db.objectStoreNames.contains('run_events')) {
        db.createObjectStore('run_events', { keyPath: 'runId' })
      }

      // 创建 run_snapshots 存储
      if (!db.objectStoreNames.contains('run_snapshots')) {
        db.createObjectStore('run_snapshots', { keyPath: 'runId' })
      }
    }
  })

  return dbPromise
}
