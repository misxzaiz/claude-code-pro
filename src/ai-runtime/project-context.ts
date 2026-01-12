/**
 * Project Context Analyzer - 项目上下文分析器
 *
 * 自动扫描工作区，提取项目信息，生成上下文。
 * 在 Task 执行前注入到 Task.input.extra 中。
 */

import type { AITask } from './task'

/**
 * 编程语言类型
 */
export type ProgramLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'go'
  | 'rust'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'php'
  | 'ruby'
  | 'unknown'

/**
 * 构建工具类型
 */
export type BuildTool =
  | 'npm'
  | 'yarn'
  | 'pnpm'
  | 'maven'
  | 'gradle'
  | 'make'
  | 'cmake'
  | 'cargo'
  | 'go_modules'
  | 'pip'
  | 'poetry'
  | 'unknown'

/**
 * 包管理器
 */
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry' | 'cargo' | 'go' | 'unknown'

/**
 * 框架类型
 */
export type Framework =
  | 'react'
  | 'vue'
  | 'angular'
  | 'svelte'
  | 'next'
  | 'nuxt'
  | 'express'
  | 'fastify'
  | 'nest'
  | 'spring'
  | 'django'
  | 'flask'
  | 'fastapi'
  | 'unknown'

/**
 * 项目类型
 */
export type ProjectType = 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'desktop' | 'library' | 'unknown'

/**
 * 文件信息
 */
export interface FileInfo {
  /** 文件路径 */
  path: string
  /** 文件大小（字节） */
  size: number
  /** 最后修改时间 */
  mtime?: number
  /** 是否为入口文件 */
  isEntry?: boolean
}

/**
 * 目录信息
 */
export interface DirectoryInfo {
  /** 目录路径 */
  path: string
  /** 子目录列表 */
  children?: DirectoryInfo[]
  /** 文件列表 */
  files?: FileInfo[]
  /** 目录深度 */
  depth: number
}

/**
 * 依赖信息
 */
export interface DependencyInfo {
  /** 名称 */
  name: string
  /** 版本 */
  version: string
  /** 是否为开发依赖 */
  isDev?: boolean
}

/**
 * 项目上下文
 */
export interface ProjectContext {
  /** 项目名称 */
  name: string
  /** 项目根目录 */
  rootDir: string
  /** 项目类型 */
  type: ProjectType
  /** 编程语言 */
  languages: ProgramLanguage[]
  /** 主语言 */
  primaryLanguage: ProgramLanguage
  /** 构建工具 */
  buildTools: BuildTool[]
  /** 包管理器 */
  packageManager: PackageManager
  /** 框架 */
  frameworks: Framework[]
  /** 入口文件列表 */
  entryFiles: string[]
  /** 源码目录 */
  sourceDirs: string[]
  /** 配置文件 */
  configFiles: string[]
  /** 依赖列表 */
  dependencies: DependencyInfo[]
  /** 开发依赖 */
  devDependencies: DependencyInfo[]
  /** 目录结构（简化版） */
  directoryTree?: DirectoryInfo
  /** 扫描时间 */
  scannedAt: number
  /** 额外信息 */
  extra?: Record<string, unknown>
}

/**
 * package.json 结构
 */
interface PackageJson {
  name?: string
  version?: string
  main?: string
  src?: string
  type?: 'module' | 'commonjs'
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

/**
 * 扫描器配置
 */
export interface AnalyzerConfig {
  /** 工作区目录 */
  workspaceDir?: string
  /** 最大扫描深度 */
  maxDepth?: number
  /** 是否扫描 node_modules */
  scanNodeModules?: boolean
  /** 是否扫描隐藏目录 */
  scanHiddenDirs?: boolean
  /** 忽略的目录模式 */
  ignorePatterns?: string[]
}

/**
 * 文件系统接口（抽象，用于解耦具体实现）
 */
export interface FileSystem {
  /** 读取文件 */
  readFile(path: string): Promise<string>
  /** 检查文件是否存在 */
  exists(path: string): Promise<boolean>
  /** 读取目录 */
  readdir(path: string): Promise<string[]>
  /** 获取文件状态 */
  stat(path: string): Promise<{ size: number; mtime: number; isDirectory: boolean }>
}

/**
 * Tauri 文件系统适配器
 */
export class TauriFileSystem implements FileSystem {
  async readFile(path: string): Promise<string> {
    // 使用 Tauri API 读取文件
    // 这里是占位实现，实际使用时需要替换
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('read_file', { path })
  }

  async exists(path: string): Promise<boolean> {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('exists', { path })
  }

  async readdir(path: string): Promise<string[]> {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('read_dir', { path })
  }

  async stat(path: string): Promise<{ size: number; mtime: number; isDirectory: boolean }> {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('file_stat', { path })
  }
}

/**
 * 浏览器内存文件系统（用于测试）
 */
export class MemoryFileSystem implements FileSystem {
  private files = new Map<string, { content: string; size: number; mtime: number }>()
  private dirs = new Map<string, Set<string>>()

  async readFile(path: string): Promise<string> {
    const file = this.files.get(path)
    if (!file) throw new Error(`File not found: ${path}`)
    return file.content
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path)
  }

  async readdir(path: string): Promise<string[]> {
    const entries = this.dirs.get(path)
    if (!entries) throw new Error(`Directory not found: ${path}`)
    return Array.from(entries)
  }

  async stat(path: string): Promise<{ size: number; mtime: number; isDirectory: boolean }> {
    const file = this.files.get(path)
    if (file) {
      return { size: file.size, mtime: file.mtime, isDirectory: false }
    }
    if (this.dirs.has(path)) {
      return { size: 0, mtime: Date.now(), isDirectory: true }
    }
    throw new Error(`Path not found: ${path}`)
  }

  // 用于测试的辅助方法
  setFile(path: string, content: string): void {
    this.files.set(path, {
      content,
      size: content.length,
      mtime: Date.now(),
    })
    // 更新父目录
    const dir = path.substring(0, path.lastIndexOf('/')) || '.'
    if (!this.dirs.has(dir)) {
      this.dirs.set(dir, new Set())
    }
    this.dirs.get(dir)!.add(path.substring(path.lastIndexOf('/') + 1))
  }
}

/**
 * 项目上下文分析器
 */
export class ProjectContextAnalyzer {
  private fs: FileSystem
  private contextCache: Map<string, ProjectContext> = new Map()

  constructor(fs?: FileSystem, _config?: AnalyzerConfig) {
    this.fs = fs || new TauriFileSystem()
    // TODO: 使用 config 配置扫描行为
  }

  /**
   * 分析项目上下文
   */
  async analyze(workspaceDir: string): Promise<ProjectContext> {
    // 检查缓存
    const cacheKey = workspaceDir
    const cached = this.contextCache.get(cacheKey)
    if (cached && Date.now() - cached.scannedAt < 60000) {
      // 缓存有效期 1 分钟
      return cached
    }

    const context: ProjectContext = {
      name: '',
      rootDir: workspaceDir,
      type: 'unknown',
      languages: [],
      primaryLanguage: 'unknown',
      buildTools: [],
      packageManager: 'unknown',
      frameworks: [],
      entryFiles: [],
      sourceDirs: [],
      configFiles: [],
      dependencies: [],
      devDependencies: [],
      scannedAt: Date.now(),
    }

    // 检测项目类型和配置
    await this.detectPackageJson(workspaceDir, context)
    await this.detectPython(workspaceDir, context)
    await this.detectJava(workspaceDir, context)
    await this.detectRust(workspaceDir, context)
    await this.detectGo(workspaceDir, context)
    await this.detectConfigFiles(workspaceDir, context)
    await this.detectSourceStructure(workspaceDir, context)

    // 确定主语言
    if (context.languages.length > 0) {
      context.primaryLanguage = context.languages[0]
    }

    // 确定项目类型
    context.type = this.inferProjectType(context)

    // 缓存结果
    this.contextCache.set(cacheKey, context)

    return context
  }

  /**
   * 检测 package.json（JavaScript/TypeScript 项目）
   */
  private async detectPackageJson(
    workspaceDir: string,
    context: ProjectContext
  ): Promise<void> {
    const packageJsonPath = `${workspaceDir}/package.json`
    const exists = await this.fs.exists(packageJsonPath)
    if (!exists) return

    try {
      const content = await this.fs.readFile(packageJsonPath)
      const pkg: PackageJson = JSON.parse(content)

      context.name = pkg.name || context.name
      context.buildTools.push('npm')

      // 检测包管理器
      const lockFiles = ['yarn.lock', 'pnpm-lock.yaml']
      for (const lockFile of lockFiles) {
        if (await this.fs.exists(`${workspaceDir}/${lockFile}`)) {
          context.packageManager = lockFile === 'yarn.lock' ? 'yarn' : 'pnpm'
          break
        }
      }
      if (context.packageManager === 'unknown') {
        context.packageManager = 'npm'
      }

      // 解析依赖
      if (pkg.dependencies) {
        for (const [name, version] of Object.entries(pkg.dependencies)) {
          context.dependencies.push({ name, version })
        }
        this.detectFrameworksFromDeps(pkg.dependencies, context)
      }
      if (pkg.devDependencies) {
        for (const [name, version] of Object.entries(pkg.devDependencies)) {
          context.devDependencies.push({ name, version, isDev: true })
        }
      }

      // 检测语言
      if (await this.fs.exists(`${workspaceDir}/tsconfig.json`)) {
        context.languages.push('typescript')
        context.configFiles.push('tsconfig.json')
      } else {
        context.languages.push('javascript')
      }

      // 查找入口文件
      const entryPoints = pkg.main || pkg.src || 'index.js'
      context.entryFiles.push(entryPoints)
    } catch (e) {
      console.warn('[ProjectContextAnalyzer] Failed to parse package.json:', e)
    }
  }

  /**
   * 从依赖中检测框架
   */
  private detectFrameworksFromDeps(
    deps: Record<string, string>,
    context: ProjectContext
  ): void {
    const frameworkDeps: Record<string, Framework> = {
      react: 'react',
      'react-dom': 'react',
      vue: 'vue',
      '@vue/core': 'vue',
      angular: 'angular',
      '@angular/core': 'angular',
      svelte: 'svelte',
      next: 'next',
      nuxt: 'nuxt',
      express: 'express',
      fastify: 'fastify',
      '@nestjs/core': 'nest',
      '@nestjs/common': 'nest',
    }

    for (const dep of Object.keys(deps)) {
      const framework = frameworkDeps[dep]
      if (framework && !context.frameworks.includes(framework)) {
        context.frameworks.push(framework)
      }
    }
  }

  /**
   * 检测 Python 项目
   */
  private async detectPython(workspaceDir: string, context: ProjectContext): Promise<void> {
    const pyFiles = ['setup.py', 'pyproject.toml', 'requirements.txt', 'Pipfile']
    let hasPython = false

    for (const file of pyFiles) {
      if (await this.fs.exists(`${workspaceDir}/${file}`)) {
        hasPython = true
        context.configFiles.push(file)
        break
      }
    }

    // 检查是否有 .py 文件
    if (!hasPython) {
      // 简单检查根目录
      try {
        const entries = await this.fs.readdir(workspaceDir)
        if (entries.some((e) => e.endsWith('.py'))) {
          hasPython = true
        }
      } catch {
        // 忽略
      }
    }

    if (hasPython) {
      if (!context.languages.includes('python')) {
        context.languages.push('python')
      }
      context.packageManager = 'pip'
    }
  }

  /**
   * 检测 Java 项目
   */
  private async detectJava(workspaceDir: string, context: ProjectContext): Promise<void> {
    const hasPom = await this.fs.exists(`${workspaceDir}/pom.xml`)
    const hasGradle =
      (await this.fs.exists(`${workspaceDir}/build.gradle`)) ||
      (await this.fs.exists(`${workspaceDir}/build.gradle.kts`))

    if (hasPom || hasGradle) {
      if (!context.languages.includes('java')) {
        context.languages.push('java')
      }

      if (hasPom) {
        context.buildTools.push('maven')
        context.configFiles.push('pom.xml')
      }
      if (hasGradle) {
        context.buildTools.push('gradle')
        context.configFiles.push('build.gradle')
      }
    }
  }

  /**
   * 检测 Rust 项目
   */
  private async detectRust(workspaceDir: string, context: ProjectContext): Promise<void> {
    const hasCargoToml = await this.fs.exists(`${workspaceDir}/Cargo.toml`)

    if (hasCargoToml) {
      if (!context.languages.includes('rust')) {
        context.languages.push('rust')
      }
      context.buildTools.push('cargo')
      context.packageManager = 'cargo'
      context.configFiles.push('Cargo.toml')
    }
  }

  /**
   * 检测 Go 项目
   */
  private async detectGo(workspaceDir: string, context: ProjectContext): Promise<void> {
    const hasGoMod = await this.fs.exists(`${workspaceDir}/go.mod`)

    if (hasGoMod) {
      if (!context.languages.includes('go')) {
        context.languages.push('go')
      }
      context.buildTools.push('go_modules')
      context.packageManager = 'go'
      context.configFiles.push('go.mod')
    }
  }

  /**
   * 检测配置文件
   */
  private async detectConfigFiles(workspaceDir: string, context: ProjectContext): Promise<void> {
    const configPatterns = [
      '.eslintrc',
      '.prettierrc',
      '.babelrc',
      'tsconfig.json',
      'jest.config.js',
      'vite.config.js',
      'webpack.config.js',
      '.gitignore',
      'Dockerfile',
      'docker-compose.yml',
    ]

    for (const config of configPatterns) {
      if (await this.fs.exists(`${workspaceDir}/${config}`)) {
        context.configFiles.push(config)
      }
    }
  }

  /**
   * 检测源码结构
   */
  private async detectSourceStructure(
    workspaceDir: string,
    context: ProjectContext
  ): Promise<void> {
    const sourceDirPatterns = ['src', 'lib', 'app', 'server', 'client', 'components']

    for (const dir of sourceDirPatterns) {
      if (await this.fs.exists(`${workspaceDir}/${dir}`)) {
        context.sourceDirs.push(dir)
      }
    }

    // 如果没有找到源码目录，添加当前目录
    if (context.sourceDirs.length === 0) {
      context.sourceDirs.push('.')
    }
  }

  /**
   * 推断项目类型
   */
  private inferProjectType(context: ProjectContext): ProjectType {
    const { frameworks, languages } = context

    // 根据框架判断
    if (frameworks.includes('react') || frameworks.includes('vue') || frameworks.includes('svelte')) {
      return 'frontend'
    }
    if (frameworks.includes('next') || frameworks.includes('nuxt')) {
      return 'fullstack'
    }
    if (frameworks.includes('express') || frameworks.includes('fastify') || frameworks.includes('nest')) {
      return 'backend'
    }

    // 根据语言判断
    if (languages.includes('java') || languages.includes('go') || languages.includes('python')) {
      return 'backend'
    }

    return 'unknown'
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.contextCache.clear()
  }
}

/**
 * 全局分析器实例
 */
let globalAnalyzer: ProjectContextAnalyzer | null = null

/**
 * 获取全局分析器
 */
export function getProjectAnalyzer(
  fs?: FileSystem,
  config?: AnalyzerConfig
): ProjectContextAnalyzer {
  if (!globalAnalyzer) {
    globalAnalyzer = new ProjectContextAnalyzer(fs, config)
  }
  return globalAnalyzer
}

/**
 * 重置全局分析器
 */
export function resetProjectAnalyzer(): void {
  if (globalAnalyzer) {
    globalAnalyzer.clearCache()
    globalAnalyzer = null
  }
}

/**
 * 将 ProjectContext 注入到 AITask
 */
export function injectProjectContext(task: AITask, context: ProjectContext): AITask {
  return {
    ...task,
    input: {
      ...task.input,
      extra: {
        ...task.input.extra,
        projectContext: {
          name: context.name,
          type: context.type,
          languages: context.languages,
          primaryLanguage: context.primaryLanguage,
          frameworks: context.frameworks,
          entryFiles: context.entryFiles,
          sourceDirs: context.sourceDirs,
          dependencies: context.dependencies.map((d) => d.name),
        },
      },
    },
  }
}

/**
 * 快捷函数：分析并注入上下文
 */
export async function analyzeAndInject(
  task: AITask,
  workspaceDir: string
): Promise<AITask> {
  const analyzer = getProjectAnalyzer()
  const context = await analyzer.analyze(workspaceDir)
  return injectProjectContext(task, context)
}

/**
 * 创建项目上下文提示词
 */
export function createProjectContextPrompt(context: ProjectContext): string {
  const parts: string[] = []

  parts.push(`## 项目信息`)
  parts.push(`- 名称: ${context.name || '未命名'}`)
  parts.push(`- 类型: ${context.type}`)
  parts.push(`- 语言: ${context.languages.join(', ')}`)
  parts.push(`- 包管理器: ${context.packageManager}`)

  if (context.frameworks.length > 0) {
    parts.push(`- 框架: ${context.frameworks.join(', ')}`)
  }

  if (context.entryFiles.length > 0) {
    parts.push(`- 入口文件: ${context.entryFiles.join(', ')}`)
  }

  if (context.sourceDirs.length > 0) {
    parts.push(`- 源码目录: ${context.sourceDirs.join(', ')}`)
  }

  if (context.dependencies.length > 0) {
    const topDeps = context.dependencies.slice(0, 10).map((d) => d.name)
    parts.push(`- 主要依赖: ${topDeps.join(', ')}${context.dependencies.length > 10 ? '...' : ''}`)
  }

  return parts.join('\n')
}

/**
 * 生成 project-context.json 内容
 */
export function generateProjectContextJson(context: ProjectContext): string {
  return JSON.stringify(context, null, 2)
}
