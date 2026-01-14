/**
 * Context Panel - 上下文管理面板
 *
 * 显示当前对话加载的所有文件，支持管理上下文
 */

import React, { useState, useEffect } from 'react'
import { FileText, Image, Folder, X, Trash2, Settings, AlertTriangle } from 'lucide-react'
import { useContextStore } from '../../stores/contextStore'
import type { FileContext } from '../../stores/contextStore'

/**
 * 文件图标组件
 */
const FileIcon: React.FC<{ type: FileContext['type'] }> = ({ type }) => {
  const iconClass = "w-4 h-4"
  
  switch (type) {
    case 'directory':
      return <Folder className={`${iconClass} text-blue-500`} />
    case 'image':
      return <Image className={`${iconClass} text-green-500`} />
    case 'code':
      return <FileText className={`${iconClass} text-purple-500`} />
    default:
      return <FileText className={`${iconClass} text-gray-500`} />
  }
}

/**
 * 上下文统计组件
 */
const ContextStats: React.FC = () => {
  const { stats, maxTokens } = useContextStore()
  const usageRate = (stats.totalTokens / maxTokens) * 100
  
  return (
    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Token 使用情况</span>
        <span className="text-xs text-gray-500">
          {stats.totalTokens.toLocaleString()} / {maxTokens.toLocaleString()}
        </span>
      </div>
      
      {/* 进度条 */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div 
          className={`h-2 rounded-full transition-all ${
            usageRate > 90 ? 'bg-red-500' : 
            usageRate > 70 ? 'bg-yellow-500' : 
            'bg-green-500'
          }`}
          style={{ width: `${Math.min(usageRate, 100)}%` }}
        />
      </div>
      
      {/* 文件统计 */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center">
          <div className="font-medium">{stats.fileCount}</div>
          <div className="text-gray-500">文件</div>
        </div>
        <div className="text-center">
          <div className="font-medium">{stats.dirCount}</div>
          <div className="text-gray-500">目录</div>
        </div>
        <div className="text-center">
          <div className="font-medium">{stats.imageCount}</div>
          <div className="text-gray-500">图片</div>
        </div>
      </div>
    </div>
  )
}

/**
 * 文件列表项组件
 */
const FileItem: React.FC<{ 
  file: FileContext
  onToggle: (path: string) => void
  onRemove: (path: string) => void
}> = ({ file, onToggle, onRemove }) => {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`
    }
    return tokens.toString()
  }

  return (
    <div 
      className={`flex items-center justify-between p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 ${
        !file.active ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center space-x-2 flex-1 min-w-0">
        <input
          type="checkbox"
          checked={file.active}
          onChange={() => onToggle(file.path)}
          className="rounded border-gray-300"
        />
        <FileIcon type={file.type} />
        <span 
          className="text-sm truncate cursor-pointer"
          title={file.path}
        >
          {file.path.split('/').pop() || file.path}
        </span>
      </div>
      
      <div className="flex items-center space-x-2 text-xs text-gray-500">
        {file.size > 0 && (
          <span>{formatFileSize(file.size)}</span>
        )}
        <span>{formatTokens(file.tokenEstimate)} tokens</span>
        <button
          onClick={() => onRemove(file.path)}
          className="p-1 hover:bg-red-100 rounded"
          title="移除文件"
        >
          <X className="w-3 h-3 text-red-500" />
        </button>
      </div>
    </div>
  )
}

/**
 * 设置面板组件
 */
const SettingsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { maxTokens, setMaxTokens, clearContext } = useContextStore()
  const [tempMaxTokens, setTempMaxTokens] = useState(maxTokens.toString())

  const handleSave = () => {
    const value = parseInt(tempMaxTokens)
    if (!isNaN(value) && value > 0) {
      setMaxTokens(value)
    }
    onClose()
  }

  const handleClearAll = () => {
    if (confirm('确定要清空所有上下文吗？')) {
      clearContext()
      onClose()
    }
  }

  return (
    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
      <h3 className="font-medium mb-3">上下文设置</h3>
      
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          最大 Token 限制
        </label>
        <input
          type="number"
          value={tempMaxTokens}
          onChange={(e) => setTempMaxTokens(e.target.value)}
          className="w-full px-3 py-2 border rounded-md"
          min="1000"
          step="1000"
        />
      </div>

      <div className="flex space-x-2">
        <button
          onClick={handleSave}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          保存
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1 border rounded hover:bg-gray-100"
        >
          取消
        </button>
      </div>

      <div className="mt-4 pt-4 border-t">
        <button
          onClick={handleClearAll}
          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 flex items-center space-x-1"
        >
          <Trash2 className="w-4 h-4" />
          <span>清空所有</span>
        </button>
      </div>
    </div>
  )
}

/**
 * 主上下文面板组件
 */
export const ContextPanel: React.FC = () => {
  const { 
    files, 
    stats, 
    isExpanded, 
    setExpanded, 
    toggleFile, 
    removeFile,
    updateStats 
  } = useContextStore()
  
  const [showSettings, setShowSettings] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // 过滤文件
  const filteredFiles = files.filter(file => 
    file.path.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 检查是否超出限制
  const isOverLimit = stats.totalTokens > 90000 // 假设限制是 100k

  useEffect(() => {
    updateStats()
  }, [files, updateStats])

  if (!isExpanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 p-3 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 z-50"
        title="打开上下文管理"
      >
        <FileText className="w-5 h-5" />
        {files.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {files.length}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50">
      {/* 头部 */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <h2 className="font-medium">上下文管理</h2>
          {isOverLimit && (
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
          )}
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1 hover:bg-gray-100 rounded"
            title="设置"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="p-1 hover:bg-gray-100 rounded"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 统计信息 */}
      <ContextStats />

      {/* 设置面板 */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* 搜索框 */}
      {files.length > 0 && (
        <div className="p-2 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            placeholder="搜索文件..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-2 py-1 text-sm border rounded"
          />
        </div>
      )}

      {/* 文件列表 */}
      <div className="max-h-64 overflow-y-auto">
        {filteredFiles.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            {files.length === 0 ? '暂无上下文文件' : '没有匹配的文件'}
          </div>
        ) : (
          filteredFiles.map((file) => (
            <FileItem
              key={file.path}
              file={file}
              onToggle={toggleFile}
              onRemove={removeFile}
            />
          ))
        )}
      </div>

      {/* 底部操作 */}
      {files.length > 0 && (
        <div className="p-2 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 text-center">
            最后更新: {new Date(stats.lastUpdated).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  )
}