/**
 * PriorityIcon - 优先级图标组件
 *
 * 使用 Lucide 图标替换 emoji
 */

import { AlertCircle, AlertTriangle, Circle, MinusCircle } from 'lucide-react'
import type { TodoPriority } from '@/types'

interface PriorityIconProps {
  priority: TodoPriority
  size?: number
  className?: string
}

export function PriorityIcon({ priority, size = 14, className = '' }: PriorityIconProps) {
  const iconMap = {
    urgent: (
      <AlertCircle
        size={size}
        className={`text-red-500 ${className}`}
      />
    ),
    high: (
      <AlertTriangle
        size={size}
        className={`text-orange-500 ${className}`}
      />
    ),
    normal: (
      <Circle
        size={size}
        className={`text-green-500 ${className}`}
      />
    ),
    low: (
      <MinusCircle
        size={size}
        className={`text-gray-400 ${className}`}
      />
    ),
  }

  return iconMap[priority] || iconMap.normal
}
