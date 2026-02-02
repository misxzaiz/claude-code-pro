/**
 * 记忆面板组件
 * 显示记忆统计和热门记忆
 *
 * @author Polaris Team
 * @since 2026-02-03
 */

import { useState, useEffect } from 'react'
import {
  BarChart3,
  TrendingUp,
  Clock,
  Search,
  Download,
  Trash2,
  Brain,
} from 'lucide-react'
import { getLongTermMemoryService } from '@/services/memory'
import type { LongTermMemory, KnowledgeType } from '@/services/memory/types'

interface MemoryPanelProps {
  workspacePath?: string
  onSearchClick?: () => void
  onMemoryClick?: (memory: LongTermMemory) => void
}

interface MemoryStats {
  total: number
  byType: Record<KnowledgeType, number>
  topMemories: LongTermMemory[]
}

export function MemoryPanel({ workspacePath, onSearchClick, onMemoryClick }: MemoryPanelProps) {
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTab, setSelectedTab] = useState<'overview' | 'top' | 'recent'>('overview')

  const memoryService = getLongTermMemoryService()

  useEffect(() => {
    loadStats()
  }, [workspacePath])

  const loadStats = async () => {
    setLoading(true)
    try {
      const data = await memoryService.getStats(workspacePath)
      setStats(data)
    } catch (error) {
      console.error('[MemoryPanel] 加载统计失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    try {
      const memories = await memoryService.getAll({ workspacePath })
      const dataStr = JSON.stringify(memories, null, 2)
      const blob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `memories-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[MemoryPanel] 导出失败:', error)
    }
  }

  const handleClear = async () => {
    if (!confirm('确定要清空所有记忆吗？此操作不可恢复！')) return

    // TODO: 实现清空功能
    console.log('[MemoryPanel] 清空记忆')
  }

  const getTypeLabel = (type: KnowledgeType): string => {
    const labels: Record<KnowledgeType, string> = {
      project_context: '项目',
      key_decision: '决策',
      user_preference: '偏好',
      faq: 'FAQ',
      code_pattern: '代码',
    }
    return labels[type] || type
  }

  const getTypeIcon = (type: KnowledgeType): string => {
    const icons: Record<KnowledgeType, string> = {
      project_context: '📁',
      key_decision: '💭',
      user_preference: '⚙️',
      faq: '❓',
      code_pattern: '💻',
    }
    return icons[type] || '📝'
  }

  const getTypeColor = (type: KnowledgeType): string => {
    const colors: Record<KnowledgeType, string> = {
      project_context: 'bg-blue-500',
      key_decision: 'bg-purple-500',
      user_preference: 'bg-green-500',
      faq: 'bg-orange-500',
      code_pattern: 'bg-pink-500',
    }
    return colors[type] || 'bg-gray-500'
  }

  const formatValue = (value: any): string => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return formatValue(parsed)
      } catch {
        return value
      }
    }
    if (typeof value === 'object') {
      if (value.path) return `📄 ${value.path}`
      if (value.question) return `❓ ${value.question}`
      if (value.decision) return `💭 ${value.decision}`
      if (value.pattern) return `💻 ${value.pattern.substring(0, 30)}...`
      if (value.engine) return `🔧 ${value.engine}`
      return JSON.stringify(value)
    }
    return String(value)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white text-gray-500">
        <Brain className="w-12 h-12 mb-3" />
        <p className="text-lg font-medium">无法加载统计信息</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          记忆统计
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onSearchClick}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="搜索"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={handleExport}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="导出"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleClear}
            className="p-2 hover:bg-red-100 rounded-lg transition-colors text-gray-600 hover:text-red-600"
            title="清空"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 总览卡片 */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <span className="text-2xl font-bold text-gray-900">{stats.total}</span>
          <span className="text-sm text-gray-600">条记忆</span>
        </div>

        {/* 类型分布 */}
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(stats.byType).map(([type, count]) => (
            <div
              key={type}
              className="flex flex-col items-center p-2 bg-gray-50 rounded-lg"
            >
              <span className="text-lg mb-1">{getTypeIcon(type as KnowledgeType)}</span>
              <span className="text-xs text-gray-600 mb-1">{getTypeLabel(type as KnowledgeType)}</span>
              <span className="text-sm font-semibold text-gray-900">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 标签切换 */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setSelectedTab('overview')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            selectedTab === 'overview'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          总览
        </button>
        <button
          onClick={() => setSelectedTab('top')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            selectedTab === 'top'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          热门
        </button>
        <button
          onClick={() => setSelectedTab('recent')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            selectedTab === 'recent'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          最近
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedTab === 'overview' && (
          <div className="space-y-4">
            {/* 热门记忆 Top 3 */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <TrendingUp className="w-4 h-4" />
                热门记忆
              </h4>
              <div className="space-y-2">
                {stats.topMemories.slice(0, 3).map((memory, index) => (
                  <div
                    key={memory.id}
                    onClick={() => onMemoryClick?.(memory)}
                    className="p-3 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-lg font-bold text-gray-400">#{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 mb-1 truncate">
                          {formatValue(memory.value)}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {memory.hitCount} 次
                          </span>
                          <span>{getTypeIcon(memory.type)} {getTypeLabel(memory.type)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 类型分布图 */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">类型分布</h4>
              <div className="space-y-2">
                {Object.entries(stats.byType)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => {
                    const percentage = (count / stats.total) * 100
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>
                            {getTypeIcon(type as KnowledgeType)} {getTypeLabel(type as KnowledgeType)}
                          </span>
                          <span>
                            {count} ({percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getTypeColor(type as KnowledgeType)} transition-all duration-300`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'top' && (
          <div className="space-y-2">
            {stats.topMemories.map((memory, index) => (
              <div
                key={memory.id}
                onClick={() => onMemoryClick?.(memory)}
                className="p-3 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm font-bold text-gray-400">#{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 mb-1 truncate">
                      {formatValue(memory.value)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {memory.hitCount} 次
                      </span>
                      <span>{getTypeIcon(memory.type)} {getTypeLabel(memory.type)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedTab === 'recent' && (
          <div>
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Clock className="w-12 h-12 mb-3" />
              <p className="text-lg font-medium">最近添加</p>
              <p className="text-sm">此功能正在开发中</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
