/**
 * TabContextMenu - Tab 右键菜单组件
 */

import { useEffect, useRef } from 'react'

interface TabContextMenuProps {
  visible: boolean
  x: number
  y: number
  onClose: () => void
  onCloseTab: () => void
  onCloseOthers: (tabId: string) => void
  onCloseAll: () => void
  tabId: string
}

export function TabContextMenu({
  visible,
  x,
  y,
  onClose,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
  tabId,
}: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    if (!visible) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [visible, onClose])

  if (!visible) return null

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[150px] bg-background-elevated border border-border rounded-md shadow-lg py-1"
      style={{ left: `${x}px`, top: `${y}px` }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        onClick={() => {
          onCloseTab()
          onClose()
        }}
        className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-background-hover transition-colors"
      >
        关闭
      </button>
      <button
        onClick={() => {
          onCloseOthers(tabId)
          onClose()
        }}
        className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-background-hover transition-colors"
      >
        关闭其他
      </button>
      <div className="my-1 border-t border-border-subtle" />
      <button
        onClick={() => {
          onCloseAll()
          onClose()
        }}
        className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-background-hover transition-colors"
      >
        关闭所有
      </button>
    </div>
  )
}
