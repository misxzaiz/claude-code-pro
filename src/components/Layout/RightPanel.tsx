/**
 * RightPanel - 右侧 AI 对话面板组件
 */

import { ReactNode } from 'react'
import { useViewStore } from '@/stores/viewStore'
import { ResizeHandle } from '../Common'

interface RightPanelProps {
  children: ReactNode
}

/**
 * 右侧面板组件
 */
export function RightPanel({ children }: RightPanelProps) {
  const minWidth = useViewStore((state) => state.rightPanelWidth)
  const setWidth = useViewStore((state) => state.setRightPanelWidth)

  // 拖拽处理 - 调整最小宽度
  const handleResize = (delta: number) => {
    const newMinWidth = Math.max(300, Math.min(800, minWidth + delta))
    setWidth(newMinWidth)
  }

  return (
    <>
      {/* 拖拽手柄 */}
      <ResizeHandle direction="horizontal" position="left" onDrag={handleResize} />

      {/* 面板容器 - 使用 flex-1 占满剩余空间,minWidth 保证最小宽度 */}
      <aside
        className="flex flex-col bg-background-elevated border-l border-border shrink-0 flex-1"
        style={{ minWidth: `${minWidth}px` }}
      >
        {/* 内容区域 */}
        {children}
      </aside>
    </>
  )
}
