/**
 * 记忆面板包装器
 * 提供 3 个子视图：统计、浏览、搜索
 *
 * @author Polaris Team
 * @since 2026-02-03
 */

import { useState } from 'react'
import { Search, BarChart3, List } from 'lucide-react'
import { MemoryBrowser, MemoryPanel, MemorySearch } from './index'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { LongTermMemory } from '@/services/memory/types'

type MemoryView = 'panel' | 'browser' | 'search'

export function MemoryPanelWrapper() {
  const [view, setView] = useState<MemoryView>('panel')
  const [selectedMemory, setSelectedMemory] = useState<LongTermMemory | null>(null)

  const workspacePath = useWorkspaceStore((state) => state.getCurrentWorkspace()?.path)

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 子标签切换 */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setView('panel')}
          className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            view === 'panel'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          统计
        </button>
        <button
          onClick={() => setView('browser')}
          className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            view === 'browser'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <List className="w-4 h-4" />
          浏览
        </button>
        <button
          onClick={() => setView('search')}
          className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            view === 'search'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Search className="w-4 h-4" />
          搜索
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        {view === 'panel' && (
          <MemoryPanel
            workspacePath={workspacePath}
            onSearchClick={() => setView('search')}
            onMemoryClick={setSelectedMemory}
          />
        )}
        {view === 'browser' && (
          <MemoryBrowser
            workspacePath={workspacePath}
            onMemoryClick={setSelectedMemory}
          />
        )}
        {view === 'search' && (
          <MemorySearch
            workspacePath={workspacePath}
            onResultClick={setSelectedMemory}
          />
        )}
      </div>
    </div>
  )
}
