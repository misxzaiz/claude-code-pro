/**
 * TemplateIcon - 模板图标组件
 *
 * 使用 Lucide 图标替换模板 emoji
 */

import { Sparkles, Bug, Eye, Wrench, FileText } from 'lucide-react'

interface TemplateIconProps {
  icon?: string
  size?: number
  className?: string
}

export function TemplateIcon({ icon, size = 16, className = '' }: TemplateIconProps) {
  const iconMap: Record<string, React.ReactNode> = {
    '✨': <Sparkles size={size} className={`text-yellow-500 ${className}`} />,
    '🐛': <Bug size={size} className={`text-red-500 ${className}`} />,
    '👀': <Eye size={size} className={`text-purple-500 ${className}`} />,
    '🔧': <Wrench size={size} className={`text-blue-500 ${className}`} />,
    '📝': <FileText size={size} className={`text-gray-500 ${className}`} />,
    '📋': <FileText size={size} className={`text-blue-500 ${className}`} />,
  }

  return iconMap[icon || ''] || iconMap['📋']
}
