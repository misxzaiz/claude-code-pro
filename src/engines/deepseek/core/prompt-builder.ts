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

import { invoke } from '@tauri-apps/api/core'
import { type Intent } from './intent-detector'
import { SkillLoader, SkillMatcher } from '../skills'
import type { Skill } from '../skills/skill-loader'
import { LRUCache } from '../../../utils/lru-cache'
import { getLongTermMemoryService } from '@/services/memory'
import type { LongTermMemory } from '@/services/memory/types'
import { KnowledgeType } from '@/services/memory/types'

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
  private skillLoader?: SkillLoader
  private skillMatcher?: SkillMatcher
  private loadedSkills?: Skill[]
  private systemPromptCache: LRUCache<string, string>  // 系统提示词缓存
  private highFrequencyMemoriesCache: LRUCache<string, LongTermMemory[]>
  private memoriesCacheTimestamp: Map<string, number>
  private cacheExpireTime: number = 5 * 60 * 1000 // 5分钟过期

  constructor(config?: PromptBuilderConfig) {
    this.config = config || {}

    // 初始化系统提示词缓存
    this.systemPromptCache = new LRUCache<string, string>({
      maxSize: 50,  // 最多缓存 50 个不同的系统提示词
      verbose: config?.verbose || false,
    })

    // 高频记忆缓存
    this.highFrequencyMemoriesCache = new LRUCache<string, LongTermMemory[]>({
      maxSize: 10,
      verbose: config?.verbose || false,
    })

    // 缓存时间戳
    this.memoriesCacheTimestamp = new Map<string, number>()

    // 延迟初始化 Skills
    this.initSkills()
  }

  /**
   * 初始化 Skills（延迟加载）
   */
  private async initSkills(): Promise<void> {
    if (this.skillLoader) {
      return // 已初始化
    }

    this.skillLoader = new SkillLoader({
      workspaceDir: this.config.workspaceDir,
      verbose: this.config.verbose,
    })

    this.skillMatcher = new SkillMatcher({
      maxSkills: 2, // 最多加载 2 个 Skills
      verbose: this.config.verbose,
    })

    // 加载所有 Skills（仅 Level 1: Metadata）
    this.loadedSkills = await this.skillLoader.loadAllSkills()
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

    try {
      // 使用 Tauri 命令读取文件
      const claudeMdPath = `${workspaceDir}/CLAUDE.md`
      const content = await invoke<string>('read_file', { path: claudeMdPath })

      if (this.config.verbose) {
        console.log('[PromptBuilder] Loaded CLAUDE.md from', claudeMdPath)
      }

      return this.processClaudeMd(content)
    } catch (error) {
      // 文件不存在或读取失败，返回默认规则
      if (this.config.verbose) {
        console.log('[PromptBuilder] CLAUDE.md not found, using defaults', error)
      }

      return this.getDefaultRules()
    }
  }

  /**
   * 构建 Layer 3: 技能提示词
   *
   * 根据意图动态加载相关 Skills
   */
  async buildSkills(intent: Intent, userMessage: string): Promise<string> {
    // 确保 Skills 已初始化
    await this.initSkills()

    if (!this.loadedSkills || this.loadedSkills.length === 0) {
      return ''
    }

    if (!this.skillMatcher) {
      return ''
    }

    // 匹配相关 Skills
    const matchedSkills = await this.skillMatcher.match(
      this.loadedSkills,
      intent,
      userMessage
    )

    if (matchedSkills.length === 0) {
      return ''
    }

    // 加载 Skills 的 Level 2: Body
    for (const skill of matchedSkills) {
      if (this.skillLoader) {
        await this.skillLoader.loadSkillBody(skill)
      }
    }

    // 组合 Skills 的 instructions
    const skillsInstructions = matchedSkills
      .filter(skill => skill.instructions)
      .map(skill => {
        const header = `## ${skill.name}\n\n${skill.description}\n`
        const body = skill.instructions || ''
        return header + body
      })
      .join('\n\n---\n\n')

    if (this.config.verbose) {
      console.log('[PromptBuilder] Loaded skills:', matchedSkills.map(s => s.id))
    }

    return skillsInstructions
  }

  /**
   * 构建完整的系统提示词（带缓存）
   *
   * 根据意图渐进式组合各层
   */
  async build(intent: Intent, userMessage: string): Promise<string> {
    // 生成缓存键（基于意图类型和工作区哈希）
    const workspaceHash = this.config.workspaceDir
      ? this.simpleHash(this.config.workspaceDir)
      : 'no-workspace'
    const cacheKey = `${intent.type}-${workspaceHash}`

    // 检查缓存
    const cachedPrompt = this.systemPromptCache.get(cacheKey)
    if (cachedPrompt !== undefined) {
      if (this.config.verbose) {
        console.log('[PromptBuilder] ✓ System prompt cache hit')
      }
      return cachedPrompt
    }

    // 缓存未命中，构建提示词
    if (this.config.verbose) {
      console.log('[PromptBuilder] ✗ System prompt cache miss, building...')
    }

    const parts: string[] = []

    // Layer 1: 核心提示词（总是加载）
    parts.push(this.buildCore())

    // Layer 2: 规则提示词（按需）
    const rules = await this.buildRules()
    if (rules) {
      parts.push('\n\n## 项目规则\n\n', rules)
    }

    // Layer 3: 高频记忆（自动注入）
    const memories = await this.loadHighFrequencyMemories()
    if (memories.length > 0) {
      const memoryText = this.formatMemories(memories)
      parts.push('\n\n## 项目记忆\n\n', memoryText)
    }

    // Layer 4: 技能提示词（按需）
    const skills = await this.buildSkills(intent, userMessage)
    if (skills) {
      parts.push('\n\n## 特定指导\n\n', skills)
    }

    const prompt = parts.join('').trim()

    // 存入缓存
    this.systemPromptCache.set(cacheKey, prompt)

    return prompt
  }

  /**
   * 简单字符串哈希（用于缓存键）
   */
  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36)
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

  // ==================== 记忆相关方法 ====================

  /**
   * 获取缓存时间戳
   */
  private getCacheTimestamp(key: string): number {
    return this.memoriesCacheTimestamp.get(key) || 0
  }

  /**
   * 设置缓存时间戳
   */
  private setCacheTimestamp(key: string, timestamp: number): void {
    this.memoriesCacheTimestamp.set(key, timestamp)
  }

  /**
   * 加载高频记忆（项目上下文、关键决策）
   *
   * @returns 高频记忆列表
   */
  private async loadHighFrequencyMemories(): Promise<LongTermMemory[]> {
    const { workspaceDir } = this.config

    if (!workspaceDir) {
      return []
    }

    // 检查缓存
    const cacheKey = `${workspaceDir}-high-freq`
    const cached = this.highFrequencyMemoriesCache.get(cacheKey)

    if (cached && Date.now() - this.getCacheTimestamp(cacheKey) < this.cacheExpireTime) {
      if (this.config.verbose) {
        console.log('[PromptBuilder] ✓ High frequency memories cache hit')
      }
      return cached
    }

    try {
      const memoryService = getLongTermMemoryService()
      await memoryService.init()

      // 加载项目上下文（限制 5 条）
      const projectContext = await memoryService.getByType(
        KnowledgeType.PROJECT_CONTEXT,
        workspaceDir,
        5
      )

      // 加载代码决策（限制 3 条）
      const codeDecisions = await memoryService.getByType(
        KnowledgeType.KEY_DECISION,
        workspaceDir,
        3
      )

      // 合并并按命中次数排序
      const memories = [...projectContext, ...codeDecisions]
        .sort((a, b) => b.hitCount - a.hitCount)
        .slice(0, 8)  // 最多 8 条

      // 存入缓存
      this.highFrequencyMemoriesCache.set(cacheKey, memories)
      this.setCacheTimestamp(cacheKey, Date.now())

      if (this.config.verbose) {
        console.log('[PromptBuilder] Loaded high frequency memories:', memories.length)
      }

      return memories
    } catch (error) {
      console.error('[PromptBuilder] 加载高频记忆失败:', error)
      return []
    }
  }

  /**
   * 格式化记忆为提示词文本
   *
   * @param memories - 记忆列表
   * @returns 格式化的提示词文本
   */
  private formatMemories(memories: LongTermMemory[]): string {
    if (memories.length === 0) {
      return ''
    }

    const sections: string[] = []

    // 按类型分组
    const projectContext = memories.filter(m => m.type === KnowledgeType.PROJECT_CONTEXT)
    const codeDecisions = memories.filter(m => m.type === KnowledgeType.KEY_DECISION)

    // 项目上下文
    if (projectContext.length > 0) {
      sections.push('### 项目结构\n')
      projectContext.forEach(memory => {
        try {
          const value = JSON.parse(memory.value)
          sections.push(`- ${value.path || memory.key}: ${value.description || ''}\n`)
        } catch (e) {
          sections.push(`- ${memory.key}\n`)
        }
      })
    }

    // 代码决策
    if (codeDecisions.length > 0) {
      sections.push('\n### 关键决策\n')
      codeDecisions.forEach(memory => {
        try {
          const value = JSON.parse(memory.value)
          sections.push(`- ${value.decision || memory.key}: ${value.reason || ''}\n`)
        } catch (e) {
          sections.push(`- ${memory.key}\n`)
        }
      })
    }

    return sections.join('').trim()
  }
}
