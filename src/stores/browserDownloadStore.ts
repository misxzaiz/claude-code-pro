/**
 * BrowserDownloadStore - 内置浏览器下载记录管理
 *
 * 消费 `browser://download-started` / `browser://download-finished` 两个事件，
 * 维护下载历史。内存为主，persist 只留最近 100 条。
 *
 * 能力边界：后端 `DownloadEvent` 只上报状态枚举（IN_PROGRESS/COMPLETED/...），
 * 不上传已下载字节数 → 不可做进度条，只能两段式（downloading → completed/failed）。
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── 类型定义 ───────────────────────────────────────

export type DownloadStatus = 'downloading' | 'completed' | 'failed'

export interface BrowserDownloadItem {
  /** 生成 id，label+url+createdAt 去重 */
  id: string
  /** webview label，如 "browser-<tabId>" */
  label: string
  /** 关联标签页 id（可能为空） */
  tabId: string | null
  /** 源 URL */
  url: string
  /** 展示用文件名 */
  filename: string
  /** 计划落盘路径（Requested 时已知） */
  destination: string
  /** 实际落盘路径（Finished 时回填，失败时为空） */
  path: string | null
  status: DownloadStatus
  /** 完成后 stat 得到的大小（字节），未完成为 null */
  size: number | null
  createdAt: number
  finishedAt: number | null
  /** 失败原因（可选） */
  error: string | null
}

interface BrowserDownloadState {
  items: BrowserDownloadItem[]
}

interface BrowserDownloadActions {
  /** 处理 download-started 事件：新建或更新记录 */
  addOrUpdateFromStarted: (payload: BrowserDownloadStartedPayload) => void
  /** 处理 download-finished 事件：更新状态、回填路径 */
  addOrUpdateFromFinished: (payload: BrowserDownloadFinishedPayload) => void
  /** 删除单条记录 */
  remove: (id: string) => void
  /** 清空已完成/失败的记录 */
  clearCompleted: () => void
}

export interface BrowserDownloadStartedPayload {
  label: string
  url: string
  destination: string
  tabId?: string | null
}

export interface BrowserDownloadFinishedPayload {
  label: string
  url: string
  path: string
  success: boolean
  tabId?: string | null
}

export type BrowserDownloadStore = BrowserDownloadState & BrowserDownloadActions

// ─── 工具函数 ───────────────────────────────────────

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `dl-${Date.now()}-${idCounter}-${Math.random().toString(36).slice(2, 6)}`
}

/** 从 URL 提取展示用文件名（与后端 extract_filename_from_url 同口径） */
function extractFilename(url: string): string {
  try {
    // blob: / data: 无 path
    if (url.startsWith('blob:') || url.startsWith('data:')) return ''
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    const last = segs[segs.length - 1]
    return last ? decodeURIComponent(last) : ''
  } catch {
    return ''
  }
}

/** 从路径提取文件名（ Finished.path 是绝对路径） */
function basenameFromPath(p: string): string {
  if (!p) return ''
  const norm = p.replace(/\\/g, '/')
  const segs = norm.split('/').filter(Boolean)
  return segs[segs.length - 1] || ''
}

const MAX_ITEMS = 100

// ─── Store 实现 ─────────────────────────────────────

export const useBrowserDownloadStore = create<BrowserDownloadStore>()(
  persist(
    (set, get) => ({
      items: [],

      addOrUpdateFromStarted: ({ label, url, destination, tabId }) => {
        const filename = extractFilename(url) || basenameFromPath(destination) || '未命名下载'
        // 同一 label + url 视为同一次下载（去重）：更新而非新增
        const existing = get().items.find(
          (i) => i.label === label && i.url === url && i.status === 'downloading'
        )
        if (existing) {
          set((s) => ({
            items: s.items.map((i) =>
              i.id === existing.id
                ? { ...i, destination, filename, status: 'downloading' as const }
                : i
            ),
          }))
          return
        }
        const item: BrowserDownloadItem = {
          id: nextId(),
          label,
          tabId: tabId ?? null,
          url,
          filename,
          destination,
          path: null,
          status: 'downloading',
          size: null,
          createdAt: Date.now(),
          finishedAt: null,
          error: null,
        }
        set((s) => ({ items: [item, ...s.items].slice(0, MAX_ITEMS) }))
      },

      addOrUpdateFromFinished: ({ label, url, path, success }) => {
        // 找到对应的 downloading 记录（优先最近一条）
        const existing = get().items.find(
          (i) => i.label === label && i.url === url && i.status === 'downloading'
        )
        if (existing) {
          set((s) => ({
            items: s.items.map((i) =>
              i.id === existing.id
                ? {
                    ...i,
                    status: success ? 'completed' : 'failed',
                    path: path || null,
                    finishedAt: Date.now(),
                    error: success ? null : '下载失败',
                    // 若 Finished 带回了不同文件名，更新展示
                    filename: success && path ? basenameFromPath(path) || i.filename : i.filename,
                  }
                : i
            ),
          }))
          return
        }
        // 没找到对应记录（可能是重载前的残留事件）：直接新建一条终态记录
        const filename = basenameFromPath(path) || extractFilename(url) || '未命名下载'
        const item: BrowserDownloadItem = {
          id: nextId(),
          label,
          tabId: null,
          url,
          filename,
          destination: path || '',
          path: path || null,
          status: success ? 'completed' : 'failed',
          size: null,
          createdAt: Date.now(),
          finishedAt: Date.now(),
          error: success ? null : '下载失败',
        }
        set((s) => ({ items: [item, ...s.items].slice(0, MAX_ITEMS) }))
      },

      remove: (id) => {
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
      },

      clearCompleted: () => {
        set((s) => ({
          items: s.items.filter((i) => i.status === 'downloading'),
        }))
      },
    }),
    {
      name: 'polaris-browser-downloads',
      // 只持久化 items，actions 不持久化
      partialize: (s) => ({ items: s.items }) as BrowserDownloadStore,
    }
  )
)

// ─── 派生 selector（避免组件订阅整个 items） ──────────────────────────

/** 进行中数量，供 BottomStatusBar 指示器使用 */
export const selectActiveCount = (s: BrowserDownloadStore): number =>
  s.items.filter((i) => i.status === 'downloading').length

/** 全部数量 */
export const selectTotalCount = (s: BrowserDownloadStore): number => s.items.length
