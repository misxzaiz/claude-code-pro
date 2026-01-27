/**
 * 待办模板服务
 *
 * 管理待办模板的创建、应用和持久化
 */

import type { TodoTemplate, TemplateVariableContext, TodoCreateParams } from '@/types'

const STORAGE_KEY = 'polaris_todo_templates'

/**
 * 内置模板列表
 */
const BUILTIN_TEMPLATES: TodoTemplate[] = [
  {
    id: 'builtin-feature-dev',
    name: '功能开发',
    description: '标准的功能开发任务',
    icon: '✨',
    content: '实现 {feature} 功能',
    priority: 'normal',
    tags: ['feature', 'dev'],
    estimatedHours: 4,
    subtasks: [
      { title: '需求分析和技术设计' },
      { title: '编写核心代码逻辑' },
      { title: '编写单元测试' },
      { title: '代码审查和优化' },
    ],
    createdAt: new Date().toISOString(),
    builtin: true,
  },
  {
    id: 'builtin-bug-fix',
    name: 'Bug 修复',
    description: '修复线上或测试环境的问题',
    icon: '🐛',
    content: '修复 {feature} 相关问题',
    priority: 'high',
    tags: ['bug', 'fix'],
    estimatedHours: 2,
    subtasks: [
      { title: '复现和定位问题' },
      { title: '编写修复代码' },
      { title: '添加回归测试' },
      { title: '验证修复效果' },
    ],
    createdAt: new Date().toISOString(),
    builtin: true,
  },
  {
    id: 'builtin-code-review',
    name: '代码审查',
    description: '审查 Pull Request 或代码片段',
    icon: '👀',
    content: '审查 {feature} 的代码',
    priority: 'normal',
    tags: ['review', 'code'],
    estimatedHours: 1,
    subtasks: [
      { title: '检查代码逻辑和实现' },
      { title: '检查测试覆盖率' },
      { title: '检查代码风格和规范' },
      { title: '提供审查意见' },
    ],
    createdAt: new Date().toISOString(),
    builtin: true,
  },
  {
    id: 'builtin-refactor',
    name: '代码重构',
    description: '优化现有代码结构',
    icon: '🔧',
    content: '重构 {feature} 代码',
    priority: 'low',
    tags: ['refactor', 'optimize'],
    estimatedHours: 3,
    subtasks: [
      { title: '分析现有代码问题' },
      { title: '设计重构方案' },
      { title: '执行重构' },
      { title: '验证功能完整性' },
    ],
    createdAt: new Date().toISOString(),
    builtin: true,
  },
  {
    id: 'builtin-documentation',
    name: '文档编写',
    description: '编写或更新项目文档',
    icon: '📝',
    content: '编写 {feature} 文档',
    priority: 'low',
    tags: ['docs', 'writing'],
    estimatedHours: 2,
    subtasks: [
      { title: '整理文档大纲' },
      { title: '编写文档内容' },
      { title: '添加示例代码' },
      { title: '校对和发布' },
    ],
    createdAt: new Date().toISOString(),
    builtin: true,
  },
]

/**
 * 模板存储服务
 */
class TodoTemplateService {
  private templates: TodoTemplate[] = []

  constructor() {
    this.loadTemplates()
  }

  /**
   * 从 localStorage 加载模板
   */
  private loadTemplates(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const customTemplates: TodoTemplate[] = JSON.parse(stored)
        this.templates = [...BUILTIN_TEMPLATES, ...customTemplates]
      } else {
        this.templates = [...BUILTIN_TEMPLATES]
      }
    } catch (error) {
      console.error('[TodoTemplateService] 加载模板失败:', error)
      this.templates = [...BUILTIN_TEMPLATES]
    }
  }

  /**
   * 保存自定义模板到 localStorage
   */
  private saveCustomTemplates(customTemplates: TodoTemplate[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customTemplates))
    } catch (error) {
      console.error('[TodoTemplateService] 保存模板失败:', error)
    }
  }

  /**
   * 获取所有模板
   */
  getAllTemplates(): TodoTemplate[] {
    return [...this.templates]
  }

  /**
   * 获取内置模板
   */
  getBuiltinTemplates(): TodoTemplate[] {
    return this.templates.filter((t) => t.builtin)
  }

  /**
   * 获取自定义模板
   */
  getCustomTemplates(): TodoTemplate[] {
    return this.templates.filter((t) => !t.builtin)
  }

  /**
   * 根据 ID 获取模板
   */
  getTemplateById(id: string): TodoTemplate | undefined {
    return this.templates.find((t) => t.id === id)
  }

  /**
   * 创建自定义模板
   */
  createTemplate(template: Omit<TodoTemplate, 'id' | 'createdAt' | 'builtin'>): TodoTemplate {
    const newTemplate: TodoTemplate = {
      ...template,
      id: `custom-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      builtin: false,
    }

    this.templates.push(newTemplate)
    this.saveCustomTemplates(this.getCustomTemplates())
    return newTemplate
  }

  /**
   * 更新模板
   */
  updateTemplate(id: string, updates: Partial<TodoTemplate>): boolean {
    const index = this.templates.findIndex((t) => t.id === id)
    if (index === -1) return false

    // 不允许修改内置模板
    if (this.templates[index].builtin) {
      console.warn('[TodoTemplateService] 不允许修改内置模板')
      return false
    }

    this.templates[index] = {
      ...this.templates[index],
      ...updates,
      id, // 确保 ID 不被修改
    }

    this.saveCustomTemplates(this.getCustomTemplates())
    return true
  }

  /**
   * 删除模板
   */
  deleteTemplate(id: string): boolean {
    const template = this.templates.find((t) => t.id === id)
    if (!template) return false

    // 不允许删除内置模板
    if (template.builtin) {
      console.warn('[TodoTemplateService] 不允许删除内置模板')
      return false
    }

    this.templates = this.templates.filter((t) => t.id !== id)
    this.saveCustomTemplates(this.getCustomTemplates())
    return true
  }

  /**
   * 应用模板，填充变量并返回创建参数
   */
  applyTemplate(
    templateId: string,
    context: TemplateVariableContext = {}
  ): TodoCreateParams | null {
    const template = this.getTemplateById(templateId)
    if (!template) return null

    // 填充变量
    const content = this.fillVariables(template.content, context)

    // 填充子任务中的变量
    const subtasks = template.subtasks?.map((st) => ({
      title: this.fillVariables(st.title, context),
    }))

    return {
      content,
      description: template.description,
      priority: template.priority,
      tags: template.tags,
      estimatedHours: template.estimatedHours,
      subtasks,
    }
  }

  /**
   * 填充模板中的变量占位符
   */
  private fillVariables(text: string, context: TemplateVariableContext): string {
    let result = text

    // 预定义变量
    const variables: Record<string, string | undefined> = {
      project: context.project,
      feature: context.feature,
      file: context.file,
      component: context.component,
      ...context.custom,
    }

    // 替换所有变量占位符 {变量名}
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'g')
      result = result.replace(regex, value || `{${key}}`)
    })

    return result
  }
}

// 导出单例
export const todoTemplateService = new TodoTemplateService()
