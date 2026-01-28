/**
 * TodoDetailDialog - 待办详情/编辑弹窗
 *
 * 使用 TodoForm 组件,移除快速操作
 */

import { useState } from 'react'
import { useWorkspaceStore } from '@/stores'
import { TodoForm } from './TodoForm'
import { simpleTodoService } from '@/services/simpleTodoService'
import type { TodoItem } from '@/types'

interface TodoDetailDialogProps {
  todo: TodoItem
  open: boolean
  onClose: () => void
  onUpdate?: () => void
}

export function TodoDetailDialog({ todo, open, onClose, onUpdate }: TodoDetailDialogProps) {
  const workspaces = useWorkspaceStore((state) => state.workspaces)

  // 获取待办所属的工作区
  const todoWorkspace = todo.workspaceId
    ? workspaces.find(w => w.id === todo.workspaceId)
    : null

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <TodoForm
        todo={todo}
        mode="edit"
        onSubmit={async (data) => {
          await simpleTodoService.updateTodo(todo.id, data)
          onUpdate?.()
          onClose()
        }}
        onCancel={onClose}
      />
    </div>
  )
}
