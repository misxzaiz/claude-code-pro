/**
 * Prompt Builder - 渐进式提示词构建器
 *
 * 基于 Claude Code、Cursor 和 MCP 的最佳实践，实现三层渐进式上下文加载：
 * - Layer 1: 核心提示词 (总是加载, < 150 tokens)
 * - Layer 2: 规则提示词 (从 CLAUDE.md 加载, 按需)
 * - Layer 3: 技能提示词 (从 SKILL.md 加载, 按需)
 *
 * @author Polaris Team
 * @since 2025-02-01
 */

import * as path from 'path'
import { promises as fs } from 'fs'
import { type Intent } from './intent-detector'

/**
 * Prompt Builder 配置
 */
export interface PromptBuilderConfig {
  /** 工作区目录 */
  workspaceDir?: string
  /** 是否启用详细日志 */
  verbose?: boolean
}

/**
 * Prompt Builder
 *
 * 负责构建渐进式的系统提示词，避免一次性加载过多上下文。
 */
export class PromptBuilder {
  private config: PromptBuilderConfig

  constructor(config?: PromptBuilderConfig) {
    this.config = config || {}
  }

  /**
   * 构建 Layer 1: 核心提示词
   *
   * 总是加载，极简设计（< 150 tokens）
   */
  buildCore(): string {
    return `你是 Polaris 编程助手。

核心原则：
1. 简单问题直接回答，不要过度分析
2. 只在必要时使用工具
3. 保持简洁明了
`.trim()
  }

  /**
   * 构建 Layer 2: 规则提示词
   *
   * 从 CLAUDE.md 加载项目级规则（按需）
   */
  async buildRules(): Promise<string> {
    const { workspaceDir } = this.config

    if (!workspaceDir) {
      return this.getDefaultRules()
    }

    const claudeMdPath = path.join(workspaceDir, 'CLAUDE.md')

    try {
      // 检查 CLAUDE.md 是否存在
      const content = await fs.readFile(claudeMdPath, 'utf-8')

      if (this.config.verbose) {
        console.log('[PromptBuilder] Loaded CLAUDE.md from', claudeMdPath)
      }

      return this.processClaudeMd(content)
    } catch (error) {
      // 文件不存在或读取失败，返回默认规则
      if (this.config.verbose) {
        console.log('[PromptBuilder] CLAUDE.md not found, using defaults')
      }

      return this.getDefaultRules()
    }
  }

  /**
   * 构建 Layer 3: 技能提示词
   *
   * 根据意图动态加载相关 Skills（暂未实现，返回空）
   */
  async buildSkills(_intent: Intent): Promise<string> {
    // TODO: Phase 2 实现 Skills 加载
    return ''
  }

  /**
   * 构建完整的系统提示词
   *
   * 根据意图渐进式组合各层
   */
  async build(intent: Intent): Promise<string> {
    const parts: string[] = []

    // Layer 1: 核心提示词（总是加载）
    parts.push(this.buildCore())

    // Layer 2: 规则提示词（按需）
    const rules = await this.buildRules()
    if (rules) {
      parts.push('\n\n## 项目规则\n\n', rules)
    }

    // Layer 3: 技能提示词（按需）
    const skills = await this.buildSkills(intent)
    if (skills) {
      parts.push('\n\n## 特定指导\n\n', skills)
    }

    return parts.join('').trim()
  }

  /**
   * 处理 CLAUDE.md 内容
   *
   * 提取关键部分，保持精简
   */
  private processClaudeMd(content: string): string {
    // 移除空行和多余空白
    const lines = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')

    // 如果内容过长，截取前 1000 字符
    const maxLength = 1000
    if (lines.length > maxLength) {
      return lines.substring(0, maxLength) + '\n\n... (内容已截断)'
    }

    return lines
  }

  /**
   * 获取默认规则
   *
   * 当没有 CLAUDE.md 时使用
   */
  private getDefaultRules(): string {
    return `
## 代码风格

- 遵循现有代码风格
- 添加适当的错误处理
- 编写可测试的代码

## 工作流

- 优先使用相对路径
- 保持改动最小化
- 添加必要的注释
`.trim()
  }

  /**
   * 估算提示词的 token 数量
   *
   * 简化算法：中文约 2 字符/token，英文约 4 字符/token
   */
  estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const otherChars = text.length - chineseChars

    // 中文约 2 字符/token，英文约 4 字符/token
    return Math.ceil(chineseChars / 2 + otherChars / 4)
  }
}
