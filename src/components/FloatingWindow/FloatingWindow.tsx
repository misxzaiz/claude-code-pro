/**
 * 悬浮窗组件
 *
 * 功能：
 * - 显示最后两条消息预览
 * - 提供输入框发送消息
 * - 点击展开按钮切换到主窗口
 * - 可拖拽移动窗口
 */

import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, emit } from '@tauri-apps/api/event'
import './FloatingWindow.css'

// 截断文本到指定长度
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export function FloatingWindow() {
  const [messages, setMessages] = useState<Array<{ id: string; type: string; content: string; timestamp: string }>>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [input, setInput] = useState('')

  // 监听主窗口的消息更新
  useEffect(() => {
    const unlistenPromises = [
      // 监听新消息事件
      listen('chat:new-message', (event: any) => {
        const message = event.payload
        setMessages(prev => {
          const newMessages = [...prev, message]
          // 只保留最后 10 条消息
          return newMessages.slice(-10)
        })
      }),

      // 监听流式状态变化
      listen('chat:streaming_changed', (event: any) => {
        setIsStreaming(event.payload.isStreaming)
      }),
    ]

    return () => {
      Promise.all(unlistenPromises).then(unlisteners => {
        unlisteners.forEach(unlisten => unlisten())
      })
    }
  }, [])

  // 初始化：从 localStorage 读取最新消息
  useEffect(() => {
    const loadMessages = () => {
      try {
        const stored = localStorage.getItem('chat_messages_preview')
        if (stored) {
          const data = JSON.parse(stored)
          setMessages(data.slice(-2)) // 只显示最后两条
        }
      } catch (e) {
        console.error('[FloatingWindow] 加载消息失败:', e)
      }
    }

    loadMessages()

    // 定期同步消息
    const interval = setInterval(loadMessages, 1000)
    return () => clearInterval(interval)
  }, [])

  // 发送消息
  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return

    // 发送到主窗口处理
    emit('floating:send_message', { message: trimmed })

    setInput('')
  }, [input, isStreaming])

  // 切换到主窗口
  const handleExpand = useCallback(async () => {
    await invoke('show_main_window')
  }, [])

  // 键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // 获取最后两条消息用于显示
  const displayMessages = messages.slice(-2)

  return (
    <div className="floating-window">
      {/* 标题栏 - 可拖拽区域 */}
      <div className="floating-header" data-tauri-drag-region>
        <div className="floating-title">
          <span className="floating-title-icon">◉</span>
          <span>Claude Code Pro</span>
        </div>
        <button
          className="floating-expand-btn"
          onClick={handleExpand}
          title="展开主窗口"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>

      {/* 消息预览区域 */}
      <div className="floating-messages">
        {displayMessages.length === 0 ? (
          <div className="floating-empty">
            <span>暂无消息</span>
          </div>
        ) : (
          displayMessages.map(msg => (
            <div key={msg.id} className={`floating-message ${msg.type}`}>
              <span className="message-sender">
                {msg.type === 'user' ? '你' : 'AI'}
              </span>
              <span className="message-content">
                {truncateText(msg.content, 50)}
              </span>
            </div>
          ))
        )}
        {isStreaming && (
          <div className="floating-streaming-indicator">
            <span className="streaming-dot"></span>
            <span>正在回复...</span>
          </div>
        )}
      </div>

      {/* 输入区域 */}
      <div className="floating-input-area">
        <input
          type="text"
          className="floating-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          disabled={isStreaming}
        />
        <button
          className={`floating-send-btn ${input.trim() ? 'active' : ''}`}
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          title="发送"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
