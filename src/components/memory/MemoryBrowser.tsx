/**
 * 记忆浏览器组件
 * 显示所有长期记忆，支持过滤和排序
 *
 * @author Polaris Team
 * @since 2026-02-03
 */

import { useState, useEffect } from 'react'
import { RefreshCw, Trash2, FileText, Clock, TrendingUp } from 'lucide-react'
import { getLongTermMemoryService } from '@/services/memory'
import type { LongTermMemory, KnowledgeType } from '@/services/memory/types'

interface MemoryBrowserProps {
  workspacePath?: string
  onMemoryClick?: (memory: LongTermMemory) => void
}

export function MemoryBrowser({ workspacePath, onMemoryClick }: MemoryBrowserProps) {
  const [memories, setMemories] = useState<LongTermMemory[]>([])
  const [filter, setFilter] = useState<KnowledgeType | 'all'>('all')
  const [sortBy, setSortBy] = useState<'hit_count' | 'created_at' | 'last_hit_at'>('hit_count')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [loading, setLoading] = useState(true)
  const [_page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  const memoryService = getLongTermMemoryService()

  useEffect(() => {
    loadMemories()
  }, [filter, sortBy, sortOrder, workspacePath])

  const loadMemories = async () => {
    setLoading(true)
    try {
      let loaded: LongTermMemory[]

      if (filter === 'all') {
        loaded = await memoryService.getAll({
          workspacePath,
          limit: 50,
        })
      } else {
        loaded = await memoryService.getByType(filter, workspacePath, 50)
      }

      // 排序
      loaded = sortMemories(loaded)

      setMemories(loaded)
      setHasMore(loaded.length >= 50)
    } catch (error) {
      console.error('[MemoryBrowser] 加载记忆失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const sortMemories = (list: LongTermMemory[]): LongTermMemory[] => {
    return [...list].sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'hit_count':
          comparison = a.hitCount - b.hitCount
          break
        case 'created_at':
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'last_hit_at':
          if (!a.lastHitAt && !b.lastHitAt) comparison = 0
          else if (!a.lastHitAt) comparison = 1
          else if (!b.lastHitAt) comparison = -1
          else
            comparison =
              new Date(a.lastHitAt).getTime() - new Date(b.lastHitAt).getTime()
          break
      }

      return sortOrder === 'desc' ? -comparison : comparison
    })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条记忆吗？')) return

    try {
      await memoryService.deleteMemory(id)
      setMemories((prev) => prev.filter((m) => m.id !== id))
    } catch (error) {
      console.error('[MemoryBrowser] 删除记忆失败:', error)
    }
  }

  const getTypeLabel = (type: KnowledgeType): string => {
    const labels: Record<KnowledgeType, string> = {
      project_context: '📁 项目',
      key_decision: '💭 决策',
      user_preference: '⚙️ 偏好',
      faq: '❓ FAQ',
      code_pattern: '💻 代码',
    }
    return labels[type] || type
  }

  const getTypeColor = (type: KnowledgeType): string => {
    const colors: Record<KnowledgeType, string> = {
      project_context: 'bg-blue-100 text-blue-800',
      key_decision: 'bg-purple-100 text-purple-800',
      user_preference: 'bg-green-100 text-green-800',
      faq: 'bg-orange-100 text-orange-800',
      code_pattern: 'bg-pink-100 text-pink-800',
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
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
      if (value.pattern) return `💻 ${value.pattern.substring(0, 50)}...`
      if (value.engine) return `🔧 引擎: ${value.engine}`
      if (value.hour) return `⏰ 活跃时段: ${value.hour}:00`
      return JSON.stringify(value, null, 2)
    }
    return String(value)
  }

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins} 分钟前`
    if (diffHours < 24) return `${diffHours} 小时前`
    if (diffDays < 7) return `${diffDays} 天前`

    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">记忆浏览器</h3>
        <button
          onClick={loadMemories}
          disabled={loading}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="刷新"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 过滤器 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        <div className="flex gap-1">
          {(
            ['all', 'project_context', 'key_decision', 'user_preference', 'faq', 'code_pattern'] as const
          ).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type as any)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                filter === type
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {type === 'all' ? '全部' : getTypeLabel(type as any)}
            </button>
          ))}
        </div>
      </div>

      {/* 排序 */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-200 text-sm">
        <span className="text-gray-600">排序:</span>
        <div className="flex gap-2">
          {(
            [
              { key: 'hit_count', label: '命中次数', icon: TrendingUp },
              { key: 'created_at', label: '创建时间', icon: Clock },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                if (sortBy === key) {
                  setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
                } else {
                  setSortBy(key)
                  setSortOrder('desc')
                }
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                sortBy === key
                  ? 'bg-blue-100 text-blue-700'
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
              {sortBy === key && <span>{sortOrder === 'desc' ? '↓' : '↑'}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* 记忆列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">加载中...</div>
          </div>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <FileText className="w-12 h-12 mb-3" />
            <p className="text-lg font-medium">还没有记忆</p>
            <p className="text-sm">开始使用后，AI 会自动提取和保存重要信息</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {memories.map((memory) => (
              <div
                key={memory.id}
                onClick={() => onMemoryClick?.(memory)}
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* 类型标签 */}
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mb-2 ${getTypeColor(
                        memory.type
                      )}`}
                    >
                      {getTypeLabel(memory.type)}
                    </span>

                    {/* Key */}
                    <div className="text-sm font-medium text-gray-900 mb-1">
                      {memory.key}
                    </div>

                    {/* Value */}
                    <div className="text-sm text-gray-600 mb-2 line-clamp-2">
                      {formatValue(memory.value)}
                    </div>

                    {/* 统计信息 */}
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        命中 {memory.hitCount} 次
                      </span>
                      {memory.lastHitAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          最近: {formatTime(memory.lastHitAt)}
                        </span>
                      )}
                      <span>{formatTime(memory.createdAt)}</span>
                    </div>
                  </div>

                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(memory.id)
                    }}
                    className="p-1.5 hover:bg-red-100 rounded-lg transition-colors text-gray-400 hover:text-red-600"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 加载更多 */}
      {hasMore && memories.length > 0 && (
        <div className="p-3 border-t border-gray-200">
          <button
            onClick={() => {
              setPage((prev) => prev + 1)
              // TODO: 实现分页加载
            }}
            className="w-full py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            加载更多
          </button>
        </div>
      )}
    </div>
  )
}
