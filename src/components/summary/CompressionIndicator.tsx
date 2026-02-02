/**
 * 压缩状态指示器组件
 *
 * @author Polaris Team
 * @since 2026-02-02
 */

import React from 'react'
import { useEventChatStore } from '@/stores/eventChatStore'

/**
 * 压缩状态指示器
 */
export const CompressionIndicator: React.FC = () => {
  const { compressionResult, isCompressing, compressConversation, shouldCompressConversation } = useEventChatStore()

  if (isCompressing) {
    return (
      <div style={{
        padding: '12px 16px',
        background: '#e3f2fd',
        border: '1px solid #2196f3',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        color: '#1976d2'
      }}>
        <div className="spinner" style={{
          width: '16px',
          height: '16px',
          border: '2px solid #2196f3',
          borderTop: '2px solid transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <span>正在压缩对话历史...</span>
      </div>
    )
  }

  if (compressionResult && compressionResult.success) {
    return (
      <div style={{
        padding: '12px 16px',
        background: '#e8f5e9',
        border: '1px solid #4caf50',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        color: '#2e7d32'
      }}>
        <span style={{ fontSize: '18px' }}>✓</span>
        <span>
          已归档 {compressionResult.archivedCount} 条消息
          （压缩 {(compressionResult.compressionRatio * 100).toFixed(0)}%）
        </span>
        <span style={{ fontSize: '12px', color: '#666' }}>
          节省 {compressionResult.beforeTokens - compressionResult.afterTokens} tokens
        </span>
      </div>
    )
  }

  if (compressionResult && !compressionResult.success) {
    return (
      <div style={{
        padding: '12px 16px',
        background: '#ffebee',
        border: '1px solid #f44336',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        color: '#c62828'
      }}>
        <span style={{ fontSize: '18px' }}>✕</span>
        <span>压缩失败: {compressionResult.error}</span>
      </div>
    )
  }

  if (shouldCompressConversation()) {
    return (
      <div style={{
        padding: '12px 16px',
        background: '#fff3e0',
        border: '1px solid #ff9800',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        color: '#ef6c00'
      }}>
        <span style={{ fontSize: '18px' }}>⚠</span>
        <span>对话历史较长，建议压缩以提升性能</span>
        <button
          onClick={() => compressConversation()}
          style={{
            padding: '6px 12px',
            background: '#ff9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500
          }}
        >
          立即压缩
        </button>
      </div>
    )
  }

  return null
}

export default CompressionIndicator
