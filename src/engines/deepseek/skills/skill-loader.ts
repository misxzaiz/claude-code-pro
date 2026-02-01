/**
 * Skill Loader - SKILL.md 加载器
 *
 * 基于 Claude Skills 规范，实现三层渐进式加载：
 * - Level 1: Metadata (name + description) - 总是加载
 * - Level 2: Body (instructions) - 按需加载
 * - Level 3: Resources (scripts, references, assets) - 按需加载
 *
 * @author Polaris Team
 * @since 2025-02-01
 */

import { invoke } from '@tauri-apps/api/core'
import { LRUCache } from '../../../utils/lru-cache'

/**
 * Skill 数据结构
 */
export interface Skill {
  // Level 1: Metadata (总是加载)
  id: string                    // skill-id (目录名)
  name: string                  // from YAML frontmatter
  description: string           // from YAML frontmatter (包含触发条件)
  scope: 'global' | 'project'   // 全局 vs 项目
  dirPath: string               // Skill 目录路径

  // Level 2: Body (按需加载)
  instructions?: string         // SKILL.md body (除去 frontmatter)

  // Level 3: Resources (按需加载)
  resources?: {
    scripts?: string[]          // scripts/*.py, *.sh
    references?: string[]       // references/*.md
    assets?: string[]           // assets/*
  }

  // 元数据
  loadedAt?: Date               // Metadata 加载时间
  bodyLoadedAt?: Date           // Body 加载时间
  useCount?: number             // 使用次数
  lastUsed?: Date               // 最后使用时间
}

/**
 * Skill Loader 配置
 */
export interface SkillLoaderConfig {
  /** 工作区目录 */
  workspaceDir?: string
  /** 是否启用详细日志 */
  verbose?: boolean
}

/**
 * YAML Frontmatter
 */
interface SkillFrontmatter {
  name: string
  description: string
  license?: string
}

/**
 * 路径拼接工具函数 (替代 Node.js path.join)
 */
function joinPath(...segments: string[]): string {
  return segments.join('/').replace(/\/+/g, '/')
}

/**
 * Skill Loader
 *
 * 负责扫描和加载 Skills
 */
export class SkillLoader {
  private config: SkillLoaderConfig
  private skills: Map<string, Skill> = new Map()
  private bodyCache: LRUCache<string, string>  // Body 缓存

  constructor(config?: SkillLoaderConfig) {
    this.config = config || {}
    // 初始化 LRU 缓存（最多缓存 10 个 Skill Body）
    this.bodyCache = new LRUCache<string, string>({
      maxSize: 10,
      verbose: config?.verbose || false,
    })
  }

  /**
   * 加载所有 Skills (仅 Level 1: Metadata)
   * 优先级：项目 Skills > 全局 Skills
   */
  async loadAllSkills(): Promise<Skill[]> {
    const skills: Skill[] = []

    // 1. 加载全局 Skills (~/.claude/skills)
    const globalSkills = await this.loadGlobalSkills()
    skills.push(...globalSkills)

    // 2. 加载项目 Skills (./skills)
    if (this.config.workspaceDir) {
      const projectSkills = await this.loadProjectSkills()
      skills.push(...projectSkills)
    }

    // 3. 存储到缓存
    skills.forEach(skill => {
      this.skills.set(skill.id, skill)
    })

    if (this.config.verbose) {
      console.log(`[SkillLoader] Loaded ${skills.length} skills:`, skills.map(s => s.id))
    }

    return skills
  }

  /**
   * 加载 Skill 的 Level 2: Body（带缓存）
   */
  async loadSkillBody(skill: Skill): Promise<void> {
    if (skill.instructions) {
      // 已加载，跳过
      return
    }

    const cacheKey = skill.id

    // 检查缓存
    const cachedBody = this.bodyCache.get(cacheKey)
    if (cachedBody !== undefined) {
      skill.instructions = cachedBody
      skill.bodyLoadedAt = new Date()

      if (this.config.verbose) {
        console.log(`[SkillLoader] ✓ Cache hit for skill: ${skill.id}`)
      }
      return
    }

    // 缓存未命中，加载文件
    const skillMdPath = joinPath(skill.dirPath, 'SKILL.md')

    try {
      const content = await invoke<string>('read_file', { path: skillMdPath })
      const { body } = this.parseSkillMd(content)

      // 存入缓存
      this.bodyCache.set(cacheKey, body)

      skill.instructions = body
      skill.bodyLoadedAt = new Date()

      if (this.config.verbose) {
        console.log(`[SkillLoader] ✓ Loaded body for skill: ${skill.id} (cache miss)`)
      }
    } catch (error) {
      console.error(`[SkillLoader] Failed to load body for skill ${skill.id}:`, error)
    }
  }

  /**
   * 加载 Skill 的 Level 3: Resources
   */
  async loadSkillResources(skill: Skill): Promise<void> {
    if (skill.resources) {
      // 已加载，跳过
      return
    }

    const resources: NonNullable<Skill['resources']> = {}

    // 扫描 scripts/
    const scriptsDir = joinPath(skill.dirPath, 'scripts')
    if (await this.dirExists(scriptsDir)) {
      resources.scripts = await this.listFiles(scriptsDir)
    }

    // 扫描 references/
    const referencesDir = joinPath(skill.dirPath, 'references')
    if (await this.dirExists(referencesDir)) {
      resources.references = await this.listFiles(referencesDir)
    }

    // 扫描 assets/
    const assetsDir = joinPath(skill.dirPath, 'assets')
    if (await this.dirExists(assetsDir)) {
      resources.assets = await this.listFiles(assetsDir)
    }

    skill.resources = resources

    if (this.config.verbose) {
      console.log(`[SkillLoader] Loaded resources for skill: ${skill.id}`, resources)
    }
  }

  /**
   * 获取 Skill
   */
  getSkill(id: string): Skill | undefined {
    return this.skills.get(id)
  }

  /**
   * 获取所有 Skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values())
  }

  /**
   * 加载全局 Skills (~/.claude/skills)
   */
  private async loadGlobalSkills(): Promise<Skill[]> {
    const homeDir = process.env.HOME || process.env.USERPROFILE || ''
    const globalSkillsDir = joinPath(homeDir, '.claude', 'skills')

    if (!await this.dirExists(globalSkillsDir)) {
      return []
    }

    return this.loadSkillsFromDir(globalSkillsDir, 'global')
  }

  /**
   * 加载项目 Skills (./skills)
   */
  private async loadProjectSkills(): Promise<Skill[]> {
    if (!this.config.workspaceDir) {
      return []
    }

    const projectSkillsDir = joinPath(this.config.workspaceDir, 'skills')

    if (!await this.dirExists(projectSkillsDir)) {
      return []
    }

    return this.loadSkillsFromDir(projectSkillsDir, 'project')
  }

  /**
   * 从目录加载 Skills
   */
  private async loadSkillsFromDir(
    skillsDir: string,
    scope: 'global' | 'project'
  ): Promise<Skill[]> {
    const skills: Skill[] = []

    try {
      // 使用 Tauri 的 read_directory 命令
      const entries = await invoke<any[]>('read_directory', { path: skillsDir })

      for (const entry of entries) {
        if (!entry.is_dir) continue

        const skillDir = joinPath(skillsDir, entry.name)
        const skillMdPath = joinPath(skillDir, 'SKILL.md')

        // 检查 SKILL.md 是否存在
        if (!await this.fileExists(skillMdPath)) {
          continue
        }

        // 读取 SKILL.md
        const content = await invoke<string>('read_file', { path: skillMdPath })
        const { frontmatter } = this.parseSkillMd(content)

        // 创建 Skill 对象
        const skill: Skill = {
          id: entry.name,
          name: frontmatter.name,
          description: frontmatter.description,
          scope,
          dirPath: skillDir,
          loadedAt: new Date(),
        }

        skills.push(skill)
      }
    } catch (error) {
      console.error(`[SkillLoader] Failed to load skills from ${skillsDir}:`, error)
    }

    return skills
  }

  /**
   * 解析 SKILL.md 文件
   */
  private parseSkillMd(content: string): {
    frontmatter: SkillFrontmatter
    body: string
  } {
    // 提取 YAML frontmatter (在 --- 之间)
    const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/)

    if (!frontmatterMatch) {
      throw new Error('Invalid SKILL.md: missing YAML frontmatter')
    }

    const frontmatterText = frontmatterMatch[1]
    const body = content.substring(frontmatterMatch[0].length).trim()

    // 解析 YAML frontmatter (简化版，手动提取)
    const nameMatch = frontmatterText.match(/name:\s*(.+)/)
    const descriptionMatch = frontmatterText.match(/description:\s*(.+)/)

    const name = nameMatch ? nameMatch[1].trim() : ''
    const description = descriptionMatch ? descriptionMatch[1].trim() : ''

    return {
      frontmatter: { name, description },
      body,
    }
  }

  /**
   * 检查目录是否存在
   */
  private async dirExists(dirPath: string): Promise<boolean> {
    try {
      const exists = await invoke<boolean>('path_exists', { path: dirPath })
      if (!exists) return false

      // 使用 read_directory 检查是否是目录
      await invoke<any[]>('read_directory', { path: dirPath })
      return true // 如果能读取目录内容，说明是目录
    } catch {
      return false
    }
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      return await invoke<boolean>('path_exists', { path: filePath })
    } catch {
      return false
    }
  }

  /**
   * 列出目录中的文件
   */
  private async listFiles(dirPath: string): Promise<string[]> {
    const files: string[] = []

    try {
      const entries = await invoke<any[]>('read_directory', { path: dirPath })

      for (const entry of entries) {
        if (!entry.is_dir) {
          files.push(entry.name)
        }
      }
    } catch (error) {
      console.error(`[SkillLoader] Failed to list files in ${dirPath}:`, error)
    }

    return files
  }
}
