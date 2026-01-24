/**
 * Task Detail
 *
 * 任务详情页，展示任务的完整信息和执行历史
 */

import { useEffect, useState } from 'react'
import { useTaskStore } from '../../stores/taskStore'
import { useRunStore } from '../../stores/runStore'
import { getTaskManager } from '../../core'
import { RunHistory } from './RunHistory'
import { ReviewPanel } from '../ReviewPanel'
import type { Task } from '../../core/models'

interface TaskDetailProps {
  taskId: string
  onBack?: () => void
}

export function TaskDetail({ taskId, onBack }: TaskDetailProps) {
  const { getTask } = useTaskStore()
  const { getRunsByTask } = useRunStore()
  const [task, setTask] = useState<Task | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  useEffect(() => {
    const taskData = getTask(taskId)
    setTask(taskData || null)

    // 默认选中活跃的 Run
    if (taskData?.activeRunId) {
      setSelectedRunId(taskData.activeRunId)
    } else if (taskData?.runIds && taskData.runIds.length > 0) {
      setSelectedRunId(taskData.runIds[taskData.runIds.length - 1])
    }
  }, [taskId, getTask])

  if (!task) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-secondary">
          任务不存在或已被删除
        </div>
      </div>
    )
  }

  const runs = getRunsByTask(taskId)
  const activeRun = selectedRunId ? runs.find(r => r.id === selectedRunId) : null

  const handleRunSelect = (runId: string) => {
    setSelectedRunId(runId)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-background-hover rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{task.title}</h2>
            <p className="text-sm text-text-secondary">{task.description}</p>
          </div>
        </div>

        {/* 状态标签 */}
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            task.status === 'waiting_review' ? 'bg-purple-100 text-purple-700' :
            task.status === 'running' ? 'bg-yellow-100 text-yellow-700' :
            task.status === 'completed' ? 'bg-green-100 text-green-700' :
            task.status === 'failed' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {task.status === 'waiting_review' ? '等待审查' :
             task.status === 'running' ? '执行中' :
             task.status === 'completed' ? '已完成' :
             task.status === 'failed' ? '失败' :
             task.status === 'draft' ? '草稿' : task.status}
          </span>

          {/* 操作按钮 */}
          {task.status === 'draft' || task.status === 'failed' || task.status === 'waiting_review' ? (
            <button
              onClick={() => getTaskManager().startTask(task.id)}
              className="px-4 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors text-sm font-medium"
            >
              {task.runIds.length > 0 ? '重新执行' : '开始执行'}
            </button>
          ) : null}

          {task.status === 'running' && (
            <button
              onClick={() => getTaskManager().cancelTask(task.id)}
              className="px-4 py-1.5 bg-danger text-white rounded-lg hover:bg-danger-hover transition-colors text-sm font-medium"
            >
              取消执行
            </button>
          )}
        </div>
      </div>

      {/* 元信息 */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border-subtle bg-background-elevated text-sm text-text-secondary">
        <span>Agent: {task.agentType === 'claude-code' ? 'Claude Code' : 'IFlow'}</span>
        <span>•</span>
        <span>优先级: {task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : task.priority === 'low' ? '低' : '紧急'}</span>
        <span>•</span>
        <span>执行次数: {task.runIds.length}</span>
        {task.tags && task.tags.length > 0 && (
          <>
            <span>•</span>
            <span>标签: {task.tags.map(t => `#${t}`).join(' ')}</span>
          </>
        )}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：执行历史 */}
        <div className="w-80 border-r border-border-subtle">
          <RunHistory
            runs={runs}
            selectedRunId={selectedRunId}
            onRunSelect={handleRunSelect}
          />
        </div>

        {/* 右侧：详情 */}
        <div className="flex-1 overflow-y-auto">
          {activeRun ? (
            <ReviewPanel
              runId={activeRun.id}
              taskId={task.id}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-text-secondary">
              请选择一个执行记录查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
