/**
 * LeftPanel - 左侧可切换面板组件
 *
 * 支持在 FileExplorer 和 GitPanel 之间切换
 */

import { ReactNode } from 'react'
import { Files, GitPullRequest, ChevronLeft } from 'lucide-react'
import { useViewStore, LeftPanelType } from '@/stores/viewStore'
import { ResizeHandle } from '../Common'

interface LeftPanelProps {
  children?: ReactNode
  // 可选: 如果不使用 useViewStore,可以传入当前类型
  currentType?: LeftPanelType
  onTypeChange?: (type: LeftPanelType) => void
}

/**
 * 左侧面板切换按钮组件
 */
function PanelSwitcher({
  currentType,
  onTypeChange,
}: {
  currentType: LeftPanelType
  onTypeChange: (type: LeftPanelType) => void
}) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-border-subtle bg-background-surface">
      <button
        onClick={() => onTypeChange('files')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
          currentType === 'files'
            ? 'bg-primary/10 text-primary'
            : 'text-text-secondary hover:text-text-primary hover:bg-background-hover'
        }`}
        title="文件浏览器"
      >
        <Files size={14} />
        <span>文件</span>
      </button>

      <button
        onClick={() => onTypeChange('git')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
          currentType === 'git'
            ? 'bg-primary/10 text-primary'
            : 'text-text-secondary hover:text-text-primary hover:bg-background-hover'
        }`}
        title="Git 面板"
      >
        <GitPullRequest size={14} />
        <span>Git</span>
      </button>
    </div>
  )
}

/**
 * 左侧面板组件
 */
export function LeftPanel({ children, currentType, onTypeChange }: LeftPanelProps) {
  // 如果没有传入,使用 store
  const storeType = useViewStore((state) => state.leftPanelType)
  const storeToggle = useViewStore((state) => state.toggleLeftPanel)
  const width = useViewStore((state) => state.leftPanelWidth)
  const setWidth = useViewStore((state) => state.setLeftPanelWidth)

  const type = currentType ?? storeType
  const handleTypeChange = onTypeChange ?? storeToggle

  // 如果是 'none',不渲染
  if (type === 'none') {
    return null
  }

  // 拖拽处理
  const handleResize = (delta: number) => {
    const newWidth = Math.max(200, Math.min(600, width + delta))
    setWidth(newWidth)
  }

  return (
    <>
      {/* 面板容器 */}
      <aside
        className="flex flex-col bg-background-elevated border-r border-border shrink-0"
        style={{ width: `${width}px` }}
      >
        {/* 面板切换器 */}
        <PanelSwitcher currentType={type} onTypeChange={handleTypeChange} />

        {/* 面板内容 */}
        <div className="flex-1 overflow-hidden">{children}</div>

        {/* 折叠按钮 */}
        <button
          onClick={() => handleTypeChange(type)}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center w-6 h-12 bg-background-elevated border border-border rounded-r-md shadow-md hover:bg-background-hover transition-all z-10"
          title="隐藏面板"
        >
          <ChevronLeft size={14} className="text-text-secondary" />
        </button>
      </aside>

      {/* 拖拽手柄 */}
      <ResizeHandle direction="horizontal" position="right" onDrag={handleResize} />
    </>
  )
}

/**
 * 左侧面板内容包装器 - 根据类型渲染不同内容
 */
export function LeftPanelContent({
  filesContent,
  gitContent,
  currentType,
}: {
  filesContent: ReactNode
  gitContent: ReactNode
  currentType?: LeftPanelType
}) {
  const type = currentType ?? useViewStore((state) => state.leftPanelType)

  if (type === 'files') {
    return <>{filesContent}</>
  } else if (type === 'git') {
    return <>{gitContent}</>
  }

  return null
}
