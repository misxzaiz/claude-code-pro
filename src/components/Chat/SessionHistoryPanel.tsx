/**
 * 会话历史面板
 *
 * 显示所有历史会话（localStorage + IFlow），支持恢复和删除
 */

import { useState, useEffect } from 'react'
import { useEventChatStore, type UnifiedHistoryItem } from '../../stores/eventChatStore'
import { getIFlowHistoryService } from '../../services/iflowHistoryService'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { Clock, MessageSquare, Trash2, RotateCcw, HardDrive, Zap, Loader2 } from 'lucide-react'

interface SessionHistoryPanelProps {
  onClose?: () => void
}

export function SessionHistoryPanel({ onClose }: SessionHistoryPanelProps) {
  const [history, setHistory] = useState<UnifiedHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'claude-code' | 'iflow'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const currentWorkspace = useWorkspaceStore(state => state.getCurrentWorkspace())

  // 加载历史会话
  useEffect(() => {
    loadHistory()
  }, [currentWorkspace])

  const loadHistory = async () => {
    setLoading(true)
    try {
      const items = await useEventChatStore.getState().getUnifiedHistory()
      setHistory(items)
    } catch (e) {
      console.error('[SessionHistoryPanel] 加载历史失败:', e)
    } finally {
      setLoading(false)
    }
  }

  // 恢复会话
  const handleRestore = async (sessionId: string, engineId: 'claude-code' | 'iflow') => {
    setRestoring(sessionId)
    try {
      const success = await useEventChatStore.getState().restoreFromHistory(sessionId, engineId)
      if (success) {
        console.log('[SessionHistoryPanel] 会话已恢复:', sessionId)
        onClose?.()
      } else {
        console.error('[SessionHistoryPanel] 恢复会话失败')
      }
    } catch (e) {
      console.error('[SessionHistoryPanel] 恢复会话出错:', e)
    } finally {
      setRestoring(null)
    }
  }

  // 删除会话
  const handleDelete = (sessionId: string, source: 'local' | 'iflow') => {
    useEventChatStore.getState().deleteHistorySession(sessionId, source)
    setHistory(prev => prev.filter(h => h.id !== sessionId))
  }

  // 格式化时间
  const formatTime = (timestamp: string) => {
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

  // 获取引擎名称
  const getEngineName = (engineId: 'claude-code' | 'iflow') => {
    return engineId === 'claude-code' ? 'Claude Code' : 'IFlow'
  }

  // 获取引擎颜色
  const getEngineColor = (engineId: 'claude-code' | 'iflow') => {
    return engineId === 'claude-code' ? 'text-blue-500' : 'text-purple-500'
  }

  // 过滤历史
  const filteredHistory = history.filter(item => {
    if (filter !== 'all' && item.engineId !== filter) return false
    if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    return true
  })

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <p className="mt-4 text-gray-500">加载历史会话...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold">会话历史</h2>
        <div className="flex items-center gap-2">
          {/* 引擎筛选 */}
          <div className="flex items-center gap-1 text-sm">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-1 rounded ${
                filter === 'all'
                  ? 'bg-gray-200 dark:bg-gray-600'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setFilter('claude-code')}
              className={`px-2 py-1 rounded ${
                filter === 'claude-code'
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              Claude Code
            </button>
            <button
              onClick={() => setFilter('iflow')}
              className={`px-2 py-1 rounded ${
                filter === 'iflow'
                  ? 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              IFlow
            </button>
          </div>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          placeholder="搜索会话..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600"
        />
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto">
        {filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-gray-400">
            <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
            <p>暂无历史会话</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredHistory.map((item) => {
              const isRestoring = restoring === item.id
              const canDelete = item.source === 'local'

              return (
                <li
                  key={item.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {/* 引擎标识 */}
                  <div className={`mt-1 ${getEngineColor(item.engineId)}`}>
                    {item.engineId === 'claude-code' ? (
                      <HardDrive className="w-5 h-5" />
                    ) : (
                      <Zap className="w-5 h-5" />
                    )}
                  </div>

                  {/* 会话信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{item.title}</h3>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        item.engineId === 'claude-code'
                          ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
                          : 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300'
                      }`}>
                        {getEngineName(item.engineId)}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {item.messageCount} 条消息
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(item.timestamp)}
                      </span>
                      {item.fileSize && (
                        <span>{getIFlowHistoryService().formatFileSize(item.fileSize)}</span>
                      )}
                      {(item.inputTokens || item.outputTokens) && (
                        <span>
                          {((item.inputTokens || 0) + (item.outputTokens || 0)).toLocaleString()} Tokens
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleRestore(item.id, item.engineId)}
                      disabled={isRestoring}
                      className={`p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 ${
                        isRestoring ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      title="恢复会话"
                    >
                      {isRestoring ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(item.id, item.source)}
                        className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900 text-red-500"
                        title="删除会话"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 底部提示 */}
      <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
        <p>• Claude Code 会话保存在本地，可删除</p>
        <p>• IFlow 会话从 CLI 读取，无法删除</p>
      </div>
    </div>
  )
}
