/**
 * 压缩配置状态管理
 *
 * @author Polaris Team
 * @since 2026-02-02
 */

import { create } from 'zustand'
import type { CompressionConfig } from '@/services/memory/types'
import { DEFAULT_COMPRESSION_CONFIG } from '@/services/memory/types'

/**
 * 压缩配置状态
 */
interface CompressionState {
  /** 压缩配置 */
  compressionConfig: CompressionConfig

  /** 更新压缩配置 */
  updateCompressionConfig: (config: Partial<CompressionConfig>) => void

  /** 重置为默认配置 */
  resetCompressionConfig: () => void

  /** 从 localStorage 加载配置 */
  loadFromStorage: () => void

  /** 保存配置到 localStorage */
  saveToStorage: () => void
}

/**
 * 压缩配置 Store
 */
export const useCompressionStore = create<CompressionState>((set, get) => ({
  // 初始化配置
  compressionConfig: {
    ...DEFAULT_COMPRESSION_CONFIG,
    // TODO: 从用户配置或系统配置选择默认模型
    summaryModel: 'deepseek',
  },

  /**
   * 更新压缩配置
   */
  updateCompressionConfig: (config: Partial<CompressionConfig>) => {
    set(state => ({
      compressionConfig: {
        ...state.compressionConfig,
        ...config,
      },
    }))

    // 自动保存到 localStorage
    get().saveToStorage()

    console.log('[CompressionStore] 配置已更新:', config)
  },

  /**
   * 重置为默认配置
   */
  resetCompressionConfig: () => {
    set({ compressionConfig: DEFAULT_COMPRESSION_CONFIG })
    get().saveToStorage()
    console.log('[CompressionStore] 配置已重置为默认值')
  },

  /**
   * 从 localStorage 加载配置
   */
  loadFromStorage: () => {
    try {
      const saved = localStorage.getItem('compressionConfig')
      if (saved) {
        const config = JSON.parse(saved) as CompressionConfig
        set({ compressionConfig: config })
        console.log('[CompressionStore] 从 localStorage 加载配置')
      }
    } catch (error) {
      console.warn('[CompressionStore] 加载配置失败:', error)
      // 使用默认配置
      set({ compressionConfig: DEFAULT_COMPRESSION_CONFIG })
    }
  },

  /**
   * 保存配置到 localStorage
   */
  saveToStorage: () => {
    try {
      localStorage.setItem('compressionConfig', JSON.stringify(get().compressionConfig))
    } catch (error) {
      console.warn('[CompressionStore] 保存配置失败:', error)
    }
  },
}))

// 初始化时从 localStorage 加载配置
if (typeof window !== 'undefined') {
  useCompressionStore.getState().loadFromStorage()
}
