/**
 * RightPanel - 右侧 AI 对话面板组件
 */

import { ReactNode } from 'react'
import { MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react'
import { useViewStore } from '@/stores/viewStore'
import { StatusIndicator, ResizeHandle } from '../Common'

interface RightPanelProps {
  children: ReactNode
}

/**
 * 右侧面板头部
 */
function RightPanelHeader({
  onToggle,
  isCollapsed,
}: {
  onToggle: () => void
  isCollapsed: boolean
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-background-elevated border-b border-border-subtle shrink-0">
      <div className="flex items-center gap-2">
        <MessageSquare size={16} className="text-primary" />
        <span className="text-sm font-medium text-text-primary">AI 对话</span>
      </div>

      {/* 状态指示器 - 可以从 props 或 store 获取 */}
      <div className="flex items-center gap-2">
        <StatusIndicator status="online" label="Claude" />

        <button
          onClick={onToggle}
          className="p-1 text-text-tertiary hover:text-text-primary hover:bg-background-surface rounded transition-all"
          title={isCollapsed ? '展开' : '折叠'}
        >
          {isCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>
    </div>
  )
}

/**
 * 右侧面板组件
 */
export function RightPanel({ children }: RightPanelProps) {
  const width = useViewStore((state) => state.rightPanelWidth)
  const collapsed = useViewStore((state) => state.rightPanelCollapsed)
  const setWidth = useViewStore((state) => state.setRightPanelWidth)
  const toggle = useViewStore((state) => state.toggleRightPanel)

  // 拖拽处理
  const handleResize = (delta: number) => {
    const newWidth = Math.max(300, Math.min(800, width + delta))
    setWidth(newWidth)
  }

  // 如果折叠,只显示一个窄条
  if (collapsed) {
    return (
      <aside className="flex flex-col bg-background-elevated border-l border-border shrink-0 w-12 relative hover:w-16 transition-all duration-200 group">
        {/* 折叠状态下的内容 */}
        <button
          onClick={toggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-text-tertiary hover:text-text-primary hover:bg-background-surface rounded transition-all"
          title="展开 AI 面板"
        >
          <ChevronLeft size={16} />
        </button>
      </aside>
    )
  }

  return (
    <>
      {/* 拖拽手柄 */}
      <ResizeHandle direction="horizontal" position="left" onDrag={handleResize} />

      {/* 面板容器 */}
      <aside
        className="flex flex-col bg-background-elevated border-l border-border shrink-0"
        style={{ width: `${width}px` }}
      >
        {/* 头部 */}
        <RightPanelHeader onToggle={toggle} isCollapsed={collapsed} />

        {/* 内容区域 */}
        <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
      </aside>
    </>
  )
}
