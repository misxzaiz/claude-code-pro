/**
 * Context Store - 上下文管理
 *
 * 管理当前对话的上下文信息，包括引用的文件、Token 使用等
 */

import { create } from 'zustand'

/**
 * 文件上下文信息
 */
export interface FileContext {
  /** 文件路径 */
  path: string
  /** 文件大小（字节） */
  size: number
  /** 估算 Token 数 */
  tokenEstimate: number
  /** 添加时间 */
  addedAt: string
  /** 是否在当前上下文中 */
  active: boolean
  /** 文件类型 */
  type: 'file' | 'directory' | 'image' | 'code'
}

/**
 * 上下文统计
 */
export interface ContextStats {
  /** 总 Token 数 */
  totalTokens: number
  /** 文件数量 */
  fileCount: number
  /** 目录数量 */
  dirCount: number
  /** 图片数量 */
  imageCount: number
  /** 最后更新时间 */
  lastUpdated: string
}

/**
 * 上下文状态
 */
interface ContextState {
  /** 上下文文件列表 */
  files: FileContext[]
  /** 上下文统计 */
  stats: ContextStats
  /** 是否展开 */
  isExpanded: boolean
  /** 最大 Token 限制 */
  maxTokens: number

  /** 添加文件到上下文 */
  addFile: (file: Omit<FileContext, 'addedAt'>) => void
  /** 移除文件 */
  removeFile: (path: string) => void
  /** 切换文件激活状态 */
  toggleFile: (path: string) => void
  /** 清空上下文 */
  clearContext: () => void
  /** 更新统计 */
  updateStats: () => void
  /** 设置展开状态 */
  setExpanded: (expanded: boolean) => void
  /** 设置最大 Token 限制 */
  setMaxTokens: (max: number) => void
  /** 估算文件 Token 数 */
  estimateTokens: (content: string, type: FileContext['type']) => number
}

const TOKEN_RATES = {
  file: 0.25,      // 普通文件，每4字符约1 Token
  code: 0.3,       // 代码文件，每3.3字符约1 Token
  image: 85,       // 图片，固定85 Token
  directory: 5,    // 目录，固定5 Token
}

export const useContextStore = create<ContextState>((set, get) => ({
  files: [],
  stats: {
    totalTokens: 0,
    fileCount: 0,
    dirCount: 0,
    imageCount: 0,
    lastUpdated: new Date().toISOString(),
  },
  isExpanded: false,
  maxTokens: 100000, // 默认 100k Token 限制

  addFile: (file) => {
    set((state) => {
      const existingIndex = state.files.findIndex(f => f.path === file.path)
      
      if (existingIndex >= 0) {
        // 更新现有文件
        const updatedFiles = [...state.files]
        updatedFiles[existingIndex] = {
          ...file,
          addedAt: new Date().toISOString(),
          active: true,
        }
        return { files: updatedFiles }
      } else {
        // 添加新文件
        return {
          files: [...state.files, {
            ...file,
            addedAt: new Date().toISOString(),
            active: true,
          }]
        }
      }
    })
    
    get().updateStats()
  },

  removeFile: (path) => {
    set((state) => ({
      files: state.files.filter(f => f.path !== path)
    }))
    get().updateStats()
  },

  toggleFile: (path) => {
    set((state) => ({
      files: state.files.map(f => 
        f.path === path ? { ...f, active: !f.active } : f
      )
    }))
    get().updateStats()
  },

  clearContext: () => {
    set({
      files: [],
      stats: {
        totalTokens: 0,
        fileCount: 0,
        dirCount: 0,
        imageCount: 0,
        lastUpdated: new Date().toISOString(),
      }
    })
  },

  updateStats: () => {
    const { files } = get()
    const activeFiles = files.filter(f => f.active)
    
    const stats: ContextStats = {
      totalTokens: activeFiles.reduce((sum, f) => sum + f.tokenEstimate, 0),
      fileCount: activeFiles.filter(f => f.type === 'file' || f.type === 'code').length,
      dirCount: activeFiles.filter(f => f.type === 'directory').length,
      imageCount: activeFiles.filter(f => f.type === 'image').length,
      lastUpdated: new Date().toISOString(),
    }

    set({ stats })
  },

  setExpanded: (expanded) => {
    set({ isExpanded: expanded })
  },

  setMaxTokens: (max) => {
    set({ maxTokens: Math.max(1000, max) })
  },

  estimateTokens: (content, type) => {
    const rate = TOKEN_RATES[type] || TOKEN_RATES.file
    
    if (type === 'image' || type === 'directory') {
      return rate
    }
    
    // 对于文本内容，按字符数估算
    return Math.ceil(content.length * rate)
  },
}))

/**
 * 上下文管理器
 */
export class ContextManager {
  private store = useContextStore.getState()

  /**
   * 从工具调用中提取文件引用
   */
  extractFilesFromToolCalls(toolCalls: any[]): void {
    for (const tool of toolCalls) {
      if (tool.name === 'read_file' && tool.args?.path) {
        this.addFileFromPath(tool.args.path, 'file')
      } else if (tool.name === 'list_directory' && tool.args?.path) {
        this.addFileFromPath(tool.args.path, 'directory')
      } else if (tool.name === 'image_read' && tool.args?.image_input) {
        this.addFileFromPath(tool.args.image_input, 'image')
      }
    }
  }

  /**
   * 从路径添加文件
   */
  private async addFileFromPath(path: string, type: FileContext['type']): Promise<void> {
    // 这里应该调用实际的文件系统 API 获取文件信息
    // 暂时使用模拟数据
    const file: FileContext = {
      path,
      size: 0, // 需要实际获取
      tokenEstimate: type === 'directory' ? 5 : type === 'image' ? 85 : 100,
      type,
      active: true,
      addedAt: new Date().toISOString(),
    }

    this.store.addFile(file)
  }

  /**
   * 检查是否超出 Token 限制
   */
  isOverTokenLimit(): boolean {
    const { stats, maxTokens } = useContextStore.getState()
    return stats.totalTokens > maxTokens
  }

  /**
   * 获取 Token 使用率
   */
  getTokenUsageRate(): number {
    const { stats, maxTokens } = useContextStore.getState()
    return stats.totalTokens / maxTokens
  }

  /**
   * 自动清理旧文件以保持在限制内
   */
  autoCleanup(): void {
    const { files, maxTokens } = useContextStore.getState()
    const activeFiles = files.filter(f => f.active)
    
    if (activeFiles.length === 0) return

    // 按添加时间排序，优先保留新文件
    const sortedFiles = [...activeFiles].sort((a, b) => 
      new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
    )

    let totalTokens = 0
    const toKeep: string[] = []

    for (const file of sortedFiles) {
      if (totalTokens + file.tokenEstimate <= maxTokens) {
        toKeep.push(file.path)
        totalTokens += file.tokenEstimate
      } else {
        break
      }
    }

    // 更新文件状态
    const store = useContextStore.getState()
    store.files.forEach(file => {
      if (file.active && !toKeep.includes(file.path)) {
        store.toggleFile(file.path)
      }
    })

    store.updateStats()
  }
}

/**
 * 全局上下文管理器
 */
let globalContextManager: ContextManager | null = null

export function getContextManager(): ContextManager {
  if (!globalContextManager) {
    globalContextManager = new ContextManager()
  }
  return globalContextManager
}