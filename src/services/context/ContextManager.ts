/**
 * 上下文管理器
 * 核心实现，整合存储、优先级管理和 Token 预算控制
 */

import type {
  ContextEntry,
  ContextQueryRequest,
  ContextQueryResult,
  ContextStats,
  ContextSummary,
  BuildPromptOptions,
  PromptFormat,
  DroppedEntry,
  FileContext,
  FileStructureContext,
  DiagnosticsContext,
  ProjectMetaContext,
  FolderContext,
} from '../../types/context';
import type { IContextManager, ChangeEvent } from './IContextManager';
import type { IContextStore } from './IContextStore';
import { MemoryContextStore } from './MemoryContextStore';
import { PriorityManager } from './PriorityManager';
import { TokenBudgetController } from './TokenBudgetController';

/**
 * 上下文管理器配置
 */
export interface ContextManagerConfig {
  /** 存储实现 */
  store?: IContextStore;
  /** Token 预算配置 */
  tokenBudget?: {
    contextSize?: number;
    systemReserved?: number;
    userMessageReserved?: number;
  };
  /** 是否自动清理过期条目 */
  autoCleanup?: boolean;
  /** 清理间隔（毫秒） */
  cleanupInterval?: number;
}

/**
 * 上下文管理器实现
 */
export class ContextManager implements IContextManager {
  private store: IContextStore;
  private priorityManager: PriorityManager;
  private tokenController: TokenBudgetController;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config?: ContextManagerConfig) {
    this.store = config?.store ?? new MemoryContextStore();
    this.priorityManager = new PriorityManager();
    this.tokenController = new TokenBudgetController(config?.tokenBudget);

    // 自动清理过期条目
    if (config?.autoCleanup !== false) {
      const interval = config?.cleanupInterval ?? 5 * 60 * 1000; // 默认 5 分钟
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, interval);
    }
  }

  // ========== 查询接口 ==========

  async query(request: ContextQueryRequest): Promise<ContextQueryResult> {
    const allEntries = await this.store.getAll();
    let filtered = this.filterEntries(allEntries, request);

    // 应用优先级规则
    filtered = this.priorityManager.adjustPriorities(filtered, request);

    // 按 Token 预算选择
    const maxTokens = request.maxTokens ?? this.tokenController.getConfig().available;
    const { selected, dropped } = this.tokenController.selectWithinBudget(
      filtered,
      maxTokens - (request.reservedTokens ?? 0)
    );

    // 构建摘要
    const summary = this.buildSummary(selected);

    return {
      entries: selected,
      totalTokens: selected.reduce((sum, e) => sum + e.estimatedTokens, 0),
      droppedEntries: dropped.map(this.buildDroppedEntry),
      summary,
    };
  }

  async buildPrompt(options: BuildPromptOptions = {}): Promise<string> {
    const format = options.format ?? 'markdown';
    const queryResult = await this.query({
      maxTokens: options.maxTokens,
      includeDiagnostics: options.includeDiagnostics ?? true,
      includeStructure: options.includeStructure ?? true,
    });

    return this.formatPrompt(queryResult.entries, format, options);
  }

  async getStats(): Promise<ContextStats> {
    return this.store.getStats();
  }

  async get(id: string): Promise<ContextEntry | undefined> {
    return this.store.get(id);
  }

  async getAll(): Promise<ContextEntry[]> {
    return this.store.getAll();
  }

  // ========== 更新接口 ==========

  async upsert(entry: ContextEntry): Promise<void> {
    // 如果没有指定优先级，使用默认值
    if (entry.priority === undefined) {
      (entry as any).priority = this.priorityManager.getDefaultPriority(entry.source);
    }

    // 如果没有估算 Token，自动估算
    if (entry.estimatedTokens === 0) {
      entry.estimatedTokens = this.estimateTokensFromEntry(entry);
    }

    await this.store.upsert(entry);
  }

  async upsertMany(entries: ContextEntry[]): Promise<void> {
    for (const entry of entries) {
      if (entry.priority === undefined) {
        (entry as any).priority = this.priorityManager.getDefaultPriority(entry.source);
      }
      if (entry.estimatedTokens === 0) {
        entry.estimatedTokens = this.estimateTokensFromEntry(entry);
      }
    }
    await this.store.upsertMany(entries);
  }

  async touch(id: string): Promise<void> {
    await this.store.touch(id);
  }

  // ========== 删除接口 ==========

  async remove(id: string): Promise<void> {
    await this.store.remove(id);
  }

  async removeByFilter(filter: {
    source?: string;
    type?: string;
    workspaceId?: string;
  }): Promise<number> {
    return this.store.removeByFilter(filter);
  }

  async clear(): Promise<void> {
    await this.store.clear();
  }

  // ========== 订阅接口 ==========

  onChange(handler: (event: ChangeEvent) => void): () => void {
    return this.store.onChange(handler);
  }

  // ========== 工具方法 ==========

  estimateTokens(text: string): number {
    return this.tokenController['estimateTokens'](text);
  }

  // ========== 私有方法 ==========

  /**
   * 根据查询条件过滤条目
   */
  private filterEntries(entries: ContextEntry[], request: ContextQueryRequest): ContextEntry[] {
    const now = Date.now();

    return entries.filter(entry => {
      // 检查是否过期
      if (entry.expiresAt && entry.expiresAt < now) {
        return false;
      }

      // 工作区过滤
      if (request.workspaceId && entry.metadata?.workspaceId !== request.workspaceId) {
        return false;
      }

      // 文件过滤
      if (request.files?.length) {
        const filePath = (entry.content as any).path;
        if (!filePath || !request.files.includes(filePath)) {
          return false;
        }
      }

      // 类型过滤
      if (request.types?.length && !request.types.includes(entry.type)) {
        return false;
      }

      // 来源过滤
      if (request.sources?.length && !request.sources.includes(entry.source)) {
        return false;
      }

      // 最小优先级过滤
      if (request.minPriority !== undefined && entry.priority < request.minPriority) {
        return false;
      }

      return true;
    });
  }

  /**
   * 构建上下文摘要
   */
  private buildSummary(entries: ContextEntry[]): ContextSummary {
    const summary: ContextSummary = {
      fileCount: 0,
      symbolCount: 0,
      workspaceIds: [],
      languages: [],
    };

    const workspaceIdSet = new Set<string>();
    const languageSet = new Set<string>();

    for (const entry of entries) {
      // 统计文件
      if (entry.type === 'file' || entry.type === 'file_structure') {
        summary.fileCount++;
      }

      // 统计文件夹
      if (entry.type === 'folder') {
        summary.fileCount++; // 文件夹也计入文件数
      }

      // 统计符号
      if (entry.type === 'symbol') {
        summary.symbolCount++;
      }

      // 统计工作区
      if (entry.metadata?.workspaceId) {
        workspaceIdSet.add(entry.metadata.workspaceId);
      }

      // 统计语言
      if (entry.metadata?.language) {
        languageSet.add(entry.metadata.language);
      } else if ((entry.content as any).language) {
        languageSet.add((entry.content as any).language);
      }

      // 提取项目信息
      if (entry.type === 'project_meta') {
        summary.projectInfo = entry.content as ProjectMetaContext;
      }

      // 提取诊断信息
      if (entry.type === 'diagnostics') {
        const diag = entry.content as DiagnosticsContext;
        summary.diagnostics = diag.summary;
      }
    }

    summary.workspaceIds = Array.from(workspaceIdSet);
    summary.languages = Array.from(languageSet);

    return summary;
  }

  /**
   * 构建丢弃条目信息
   */
  private buildDroppedEntry(entry: ContextEntry): DroppedEntry {
    return {
      id: entry.id,
      reason: 'token_limit', // 简化，实际可以更精确
      priority: entry.priority,
      tokens: entry.estimatedTokens,
    };
  }

  /**
   * 格式化提示词
   */
  private formatPrompt(
    entries: ContextEntry[],
    format: PromptFormat,
    options: BuildPromptOptions
  ): string {
    if (format === 'json') {
      return JSON.stringify(entries, null, 2);
    }

    if (format === 'concise') {
      return entries.map(e => {
        const content = e.content as any;
        if (e.type === 'file') {
          return `File: ${content.path} (${e.estimatedTokens} tokens)`;
        }
        if (e.type === 'symbol') {
          return `Symbol: ${content.name} in ${content.definition?.path}`;
        }
        return `${e.type}: ${e.id}`;
      }).join('\n');
    }

    // Markdown 格式（默认）
    const sections: string[] = [];

    // 项目信息
    const projectEntry = entries.find(e => e.type === 'project_meta');
    if (projectEntry && options.includeStructure !== false) {
      sections.push(this.formatProjectMeta(projectEntry.content as ProjectMetaContext));
    }

    // 文件列表
    const fileEntries = entries.filter(e => e.type === 'file' || e.type === 'file_structure');
    if (fileEntries.length > 0) {
      sections.push('## 相关文件\n');
      sections.push(fileEntries.map(e => this.formatFileEntry(e)).join('\n\n'));
    }

    // 文件夹列表
    const folderEntries = entries.filter(e => e.type === 'folder');
    if (folderEntries.length > 0) {
      sections.push('## 相关文件夹\n');
      sections.push(folderEntries.map(e => this.formatFolderEntry(e)).join('\n'));
    }

    // 符号列表
    const symbolEntries = entries.filter(e => e.type === 'symbol');
    if (symbolEntries.length > 0 && options.includeStructure !== false) {
      sections.push('\n## 相关符号\n');
      sections.push(symbolEntries.map(e => this.formatSymbolEntry(e)).join('\n'));
    }

    // 诊断信息
    const diagEntries = entries.filter(e => e.type === 'diagnostics');
    if (diagEntries.length > 0 && options.includeDiagnostics !== false) {
      sections.push('\n## 诊断信息\n');
      sections.push(diagEntries.map(e => this.formatDiagnosticEntry(e)).join('\n\n'));
    }

    return sections.join('');
  }

  private formatProjectMeta(meta: ProjectMetaContext): string {
    return `## 项目信息
- **名称**: ${meta.name}
- **类型**: ${meta.projectType}
- **语言**: ${meta.languages.join(', ')}
- **框架**: ${meta.frameworks.join(', ') || '无'}
- **入口文件**: ${meta.entryFiles.join(', ') || '无'}
`;
  }

  private formatFileEntry(entry: ContextEntry): string {
    const content = entry.content as FileContext | FileStructureContext;
    const isStructure = entry.type === 'file_structure';

    if (isStructure) {
      const struct = content as FileStructureContext;
      let output = `### \`${struct.path}\` (结构)\n\n`;
      if (struct.symbols.length > 0) {
        output += struct.symbols.map(s => `- **${s.kind}**: \`${s.name}\``).join('\n');
      } else {
        output += '(无符号信息)';
      }
      return output;
    } else {
      const file = content as FileContext;
      return `### \`${file.path}\`

\`\`\`${file.language}
${file.content}
\`\`\``;
    }
  }

  private formatFolderEntry(entry: ContextEntry): string {
    const content = entry.content as FolderContext;
    let output = `- 📁 \`${content.path}\``;

    if (content.fileCount !== undefined || content.dirCount !== undefined) {
      const parts = [];
      if (content.fileCount !== undefined) parts.push(`${content.fileCount} 个文件`);
      if (content.dirCount !== undefined) parts.push(`${content.dirCount} 个子目录`);
      output += ` (${parts.join(', ')})`;
    }

    return output;
  }

  private formatSymbolEntry(entry: ContextEntry): string {
    const content = entry.content as any;
    return `- **${content.kind}**: \`${content.name}\` (${content.definition?.path}:${content.definition?.lineStart})`;
  }

  private formatDiagnosticEntry(entry: ContextEntry): string {
    const content = entry.content as DiagnosticsContext;
    const items = content.items;
    const summary = content.summary;

    let output = '';

    if (summary) {
      output += `错误: ${summary.errors}, 警告: ${summary.warnings}`;
    }

    if (items.length > 0) {
      output += '\n\n' + items.slice(0, 10).map(d => {
        const icon = d.severity === 'error' ? '❌' : d.severity === 'warning' ? '⚠️' : 'ℹ️';
        return `${icon} **${d.path}:${d.range.start.line + 1}**: ${d.message}`;
      }).join('\n');
    }

    return output;
  }

  /**
   * 从条目内容估算 Token
   */
  private estimateTokensFromEntry(entry: ContextEntry): number {
    const content = entry.content as any;

    switch (entry.type) {
      case 'file':
        return this.tokenController['estimateTokens'](content.content ?? '');
      case 'file_structure':
        return this.tokenController['estimateTokens'](JSON.stringify(content.symbols ?? []));
      case 'folder':
        return entry.estimatedTokens || 100; // 文件夹使用预设的 token 数
      case 'symbol':
        return this.tokenController['estimateTokens'](content.documentation ?? content.signature ?? content.name);
      case 'selection':
        return this.tokenController['estimateTokens'](content.content ?? '');
      case 'diagnostics':
        return this.tokenController['estimateTokens'](JSON.stringify(content.items ?? []));
      case 'project_meta':
        return 200; // 固定估算
      case 'user_message':
        return this.tokenController['estimateTokens'](content.content ?? '');
      case 'tool_result':
        return this.tokenController['estimateTokens'](content.output ?? JSON.stringify(content.input ?? {}));
      default:
        return 100;
    }
  }

  /**
   * 清理过期条目
   */
  private async cleanup(): Promise<void> {
    if ('cleanupExpired' in this.store) {
      await (this.store as any).cleanupExpired();
    }
  }

  /**
   * 销毁管理器
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}

/**
 * 创建全局上下文管理器实例
 */
let globalContextManager: ContextManager | null = null;

export function getGlobalContextManager(): ContextManager {
  if (!globalContextManager) {
    globalContextManager = new ContextManager();
  }
  return globalContextManager;
}

export function setGlobalContextManager(manager: ContextManager): void {
  if (globalContextManager) {
    globalContextManager.dispose();
  }
  globalContextManager = manager;
}
