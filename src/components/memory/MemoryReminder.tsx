/**
 * 记忆提醒横幅组件
 * 主动提醒相关记忆
 *
 * @author Polaris Team
 * @since 2026-02-03
 */

import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Brain, TrendingUp, Clock } from 'lucide-react'
import type { ReminderResult } from '@/services/memory/types'

interface MemoryReminderProps {
  reminder: ReminderResult
  onDismiss?: () => void
  onIgnore?: () => void
  onViewDetails?: (memoryId: string) => void
}

export function MemoryReminder({
  reminder,
  onDismiss,
  onIgnore,
  onViewDetails,
}: MemoryReminderProps) {
  const [visible, setVisible] = useState(true)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    setVisible(true)
  }, [reminder])

  const handleDismiss = () => {
    setExiting(true)
    setTimeout(() => {
      setVisible(false)
      onDismiss?.()
    }, 300)
  }

  const handleIgnore = () => {
    setExiting(true)
    setTimeout(() => {
      setVisible(false)
      onIgnore?.()
    }, 300)
  }

  const handleViewDetails = () => {
    if (reminder.memoryId) {
      onViewDetails?.(reminder.memoryId)
    }
    handleDismiss()
  }

  if (!visible || !reminder.shouldRemind) {
    return null
  }

  return (
    <div
      className={`fixed top-4 right-4 max-w-md w-full bg-white rounded-lg shadow-lg border-l-4 border-blue-500 z-50 transition-all duration-300 ${
        exiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'
      }`}
    >
      <div className="p-4">
        {/* 头部 */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0">
            <Brain className="w-5 h-5 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-gray-900">相关记忆</h4>
            <p className="text-xs text-gray-500">来自长期记忆</p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* 提醒内容 */}
        {reminder.reminder && (
          <div className="mb-3 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-900">{reminder.reminder}</p>
          </div>
        )}

        {/* 统计信息 */}
        {reminder.memoryId && (
          <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              高频使用
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              最近访问
            </span>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <button
            onClick={handleViewDetails}
            className="flex-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            查看详情
          </button>
          <button
            onClick={handleIgnore}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            忽略
          </button>
        </div>
      </div>
    </div>
  )
}

interface MemoryReminderCarouselProps {
  reminders: ReminderResult[]
  onDismiss?: (index: number) => void
  onIgnore?: (index: number) => void
  onViewDetails?: (memoryId: string, index: number) => void
}

export function MemoryReminderCarousel({
  reminders,
  onDismiss,
  onIgnore,
  onViewDetails,
}: MemoryReminderCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (reminders.length > 1) {
      const timer = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % reminders.length)
      }, 5000)

      return () => clearInterval(timer)
    }
  }, [reminders.length])

  if (reminders.length === 0) {
    return null
  }

  const currentReminder = reminders[currentIndex]

  const handleDismiss = () => {
    onDismiss?.(currentIndex)
  }

  const handleIgnore = () => {
    onIgnore?.(currentIndex)
  }

  const handleViewDetails = () => {
    if (currentReminder.memoryId) {
      onViewDetails?.(currentReminder.memoryId, currentIndex)
    }
  }

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + reminders.length) % reminders.length)
  }

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % reminders.length)
  }

  return (
    <div className="fixed top-4 right-4 max-w-md w-full z-50">
      {/* 导航按钮 */}
      {reminders.length > 1 && (
        <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-2">
          <button
            onClick={goToPrev}
            className="p-2 bg-white rounded-lg shadow-md hover:bg-gray-50 transition-colors"
            title="上一个"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToNext}
            className="p-2 bg-white rounded-lg shadow-md hover:bg-gray-50 transition-colors"
            title="下一个"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 指示器 */}
      {reminders.length > 1 && (
        <div className="absolute -bottom-8 left-0 right-0 flex justify-center gap-1">
          {reminders.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentIndex ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      )}

      {/* 当前提醒 */}
      <MemoryReminder
        reminder={currentReminder}
        onDismiss={handleDismiss}
        onIgnore={handleIgnore}
        onViewDetails={handleViewDetails}
      />
    </div>
  )
}
