/**
 * ActivityBar - 左侧 Activity Bar 组件
 *
 * 固定在左侧的图标栏,始终可见,用于切换面板
 * 参考 VSCode 的 Activity Bar 设计
 */

import { Files, GitPullRequest, Settings } from 'lucide-react'
import { useViewStore } from '@/stores/viewStore'
import { ActivityBarIcon } from './ActivityBarIcon'

interface ActivityBarProps {
  className?: string
  /** 可选: 打开设置的回调 */
  onOpenSettings?: () => void
}

export function ActivityBar({ className, onOpenSettings }: ActivityBarProps) {
  const leftPanelType = useViewStore((state) => state.leftPanelType)
  const switchToLeftPanel = useViewStore((state) => state.switchToLeftPanel)

  // 定义面板按钮
  const panelButtons = [
    {
      id: 'files' as const,
      icon: Files,
      label: '文件浏览器',
    },
    {
      id: 'git' as const,
      icon: GitPullRequest,
      label: 'Git 面板',
    },
  ]

  return (
    <div
      className={`flex flex-col items-center shrink-0 w-12 py-2 bg-background-elevated border-r border-border ${className || ''}`}
    >
      {/* 面板切换按钮组 */}
      {panelButtons.map((btn) => (
        <ActivityBarIcon
          key={btn.id}
          icon={btn.icon}
          label={btn.label}
          active={leftPanelType === btn.id}
          onClick={() => switchToLeftPanel(btn.id)}
        />
      ))}

      {/* 底部分隔 */}
      <div className="flex-1" />

      {/* 底部按钮: 设置 */}
      <ActivityBarIcon
        icon={Settings}
        label="设置"
        active={false}
        onClick={onOpenSettings || (() => {})}
      />
    </div>
  )
}
