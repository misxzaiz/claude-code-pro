/**
 * 记忆搜索组件
 * 支持关键词搜索和高亮显示
 *
 * @author Polaris Team
 * @since 2026-02-03
 */

import { useState, useCallback, useEffect } from 'react'
import { Search, X, Clock, TrendingUp, Star } from 'lucide-react'
import { getMemoryRetrieval } from '@/services/memory'
import type { LongTermMemory } from '@/services/memory/types'

/**
 * 自定义 debounce hook
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

interface MemorySearchProps {
  workspacePath?: string
  onResultClick?: (memory: LongTermMemory) => void
}

export function MemorySearch({ workspacePath, onResultClick }: MemorySearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LongTermMemory[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(true)
  const [totalHits, setTotalHits] = useState(0)

  const retrieval = getMemoryRetrieval()
  const debouncedQuery = useDebounce(query, 300)

  // 加载搜索历史
  useEffect(() => {
    try {
      const saved = localStorage.getItem('memory-search-history')
      if (saved) {
        setSearchHistory(JSON.parse(saved))
      }
    } catch (error) {
      console.error('[MemorySearch] 加载历史失败:', error)
    }
  }, [])

  // 保存搜索历史
  const saveToHistory = useCallback(
    (q: string) => {
      if (!q.trim()) return

      const newHistory = [q, ...searchHistory.filter((h) => h !== q)].slice(0, 10)
      setSearchHistory(newHistory)

      try {
        localStorage.setItem('memory-search-history', JSON.stringify(newHistory))
      } catch (error) {
        console.error('[MemorySearch] 保存历史失败:', error)
      }
    },
    [searchHistory]
  )

  // 执行搜索
  useEffect(() => {
    const doSearch = async () => {
      if (!debouncedQuery.trim()) {
        setResults([])
        setTotalHits(0)
        setShowHistory(true)
        return
      }

      setIsSearching(true)
      setShowHistory(false)

      try {
        const { memories, totalHits: hits } = await retrieval.semanticSearch(
          debouncedQuery,
          workspacePath,
          20
        )

        setResults(memories)
        setTotalHits(hits)
      } catch (error) {
        console.error('[MemorySearch] 搜索失败:', error)
        setResults([])
        setTotalHits(0)
      } finally {
        setIsSearching(false)
      }
    }

    doSearch()
  }, [debouncedQuery, workspacePath, retrieval])

  const handleSearch = () => {
    if (query.trim()) {
      saveToHistory(query)
    }
  }

  const clearHistory = () => {
    setSearchHistory([])
    try {
      localStorage.removeItem('memory-search-history')
    } catch (error) {
      console.error('[MemorySearch] 清除历史失败:', error)
    }
  }

  const getTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      project_context: '📁 项目',
      key_decision: '💭 决策',
      user_preference: '⚙️ 偏好',
      faq: '❓ FAQ',
      code_pattern: '💻 代码',
    }
    return labels[type] || type
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
      return JSON.stringify(value)
    }
    return String(value)
  }

  // 高亮关键词
  const highlightKeywords = (text: string, query: string): React.ReactElement => {
    if (!query.trim()) return <>{text}</>

    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))

    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark
              key={i}
              className="bg-yellow-200 text-yellow-900 rounded px-0.5"
            >
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 搜索框 */}
      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch()
              }
            }}
            placeholder="搜索记忆..."
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setResults([])
                setShowHistory(true)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 搜索结果 */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">搜索中...</div>
          </div>
        ) : query && results.length > 0 ? (
          <div className="p-4">
            <div className="text-sm text-gray-600 mb-3">
              找到 <span className="font-semibold text-blue-600">{totalHits}</span> 个相关记忆
            </div>

            <div className="space-y-3">
              {results.map((memory, index) => (
                <div
                  key={memory.id}
                  onClick={() => onResultClick?.(memory)}
                  className="p-3 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* 相关性指示 */}
                    <div className="flex-shrink-0">
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3 h-3 ${
                              i < 5 - index / 4
                                ? 'text-yellow-400 fill-yellow-400'
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* 类型 */}
                      <div className="text-xs text-gray-500 mb-1">
                        {getTypeLabel(memory.type)}
                      </div>

                      {/* Key */}
                      <div className="text-sm font-medium text-gray-900 mb-1">
                        {highlightKeywords(memory.key, query)}
                      </div>

                      {/* Value */}
                      <div className="text-sm text-gray-600 mb-2 line-clamp-2">
                        {highlightKeywords(formatValue(memory.value), query)}
                      </div>

                      {/* 统计 */}
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          命中 {memory.hitCount} 次
                        </span>
                        {memory.lastHitAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(memory.lastHitAt).toLocaleDateString('zh-CN')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : query && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Search className="w-12 h-12 mb-3" />
            <p className="text-lg font-medium">未找到相关记忆</p>
            <p className="text-sm">尝试使用其他关键词搜索</p>
          </div>
        ) : showHistory && searchHistory.length > 0 ? (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">搜索历史</span>
              <button
                onClick={clearHistory}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                清除
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {searchHistory.map((item, index) => (
                <button
                  key={index}
                  onClick={() => setQuery(item)}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition-colors"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Search className="w-12 h-12 mb-3" />
            <p className="text-lg font-medium">搜索记忆</p>
            <p className="text-sm">输入关键词开始搜索</p>
          </div>
        )}
      </div>
    </div>
  )
}
