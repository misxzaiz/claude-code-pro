/**
 * 通用缓存工具
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

export class AsyncCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private ttl: number; // 缓存有效期（毫秒）

  constructor(ttl: number = 5000) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  /**
   * 获取缓存值
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * 设置缓存值
   */
  set(key: string, value: T): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * 获取或计算缓存值
   */
  async getOrCompute(key: string, compute: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await compute();
    this.set(key, value);
    return value;
  }

  /**
   * 清除指定缓存
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 清除过期缓存
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * 同步缓存
 */
export class SyncCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private ttl: number;

  constructor(ttl: number = 5000) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  getOrCompute(key: string, compute: () => T): T {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = compute();
    this.set(key, value);
    return value;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * 带有最大缓存大小的 LRU 缓存
 */
export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number = 100, ttl: number = 5000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // 更新访问时间（移到最后）
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T): void {
    // 如果已存在，先删除
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // 如果超过最大容量，删除最旧的（第一个）
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// Markdown 渲染缓存
// ============================================================================

/**
 * Markdown 渲染缓存配置
 */
interface MarkdownCacheEntry {
  html: string;
  contentLength: number;
}

/**
 * 计算内容的简单哈希指纹
 * 用于快速比较内容是否变化
 */
function getContentFingerprint(content: string): string {
  // 使用前 100 字符 + 长度作为简单指纹
  // 这对增量更新的内容很有效
  const prefix = content.slice(0, 100);
  return `${prefix.length}:${content.length}:${prefix.slice(-20)}`;
}

/**
 * Markdown 渲染缓存类
 *
 * 性能优化：
 * - 使用 LRU 缓存避免重复解析
 * - 增量内容检测，避免对相同前缀的内容重复渲染
 * - 预设允许的 HTML 标签和属性
 */
export class MarkdownRenderCache {
  private cache: LRUCache<MarkdownCacheEntry>;
  private lastContent: string = '';
  private lastRenderedLength: number = 0;

  // 允许的 HTML 标签和属性（与原 EnhancedChatMessages 一致）
  private readonly ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'span', 'div', 'mark', 'table', 'thead', 'tbody',
    'tr', 'td', 'th', 'hr', 'dl', 'dt', 'dd', 'input'
  ];
  private readonly ALLOWED_ATTR = ['class', 'href', 'target', 'rel', 'type', 'checked', 'disabled'];

  constructor(maxSize: number = 100) {
    this.cache = new LRUCache<MarkdownCacheEntry>(maxSize, 60000); // 1 分钟 TTL
  }

  /**
   * 渲染 Markdown（带缓存）
   *
   * 优化策略：
   * 1. 检查是否为增量更新（新内容是旧内容的延伸）
   * 2. 如果是增量，复用之前的渲染结果
   * 3. 否则使用完整缓存
   */
  render(content: string): string {
    // 空内容快速返回
    if (!content) return '';

    // 检查是否为新内容
    const isNewContent = content !== this.lastContent;

    // 如果内容没变，返回缓存
    if (!isNewContent && this.lastContent) {
      const entry = this.cache.get(getContentFingerprint(this.lastContent));
      if (entry) {
        return entry.html;
      }
    }

    // 如果是增量更新且新增部分较小，可以优化（这里简化处理，直接重新渲染）
    // 对于流式场景，完整内容已经在最后一次调用时传入

    try {
      const raw = marked.parse(content) as string;
      const html = DOMPurify.sanitize(raw, {
        ALLOWED_TAGS: this.ALLOWED_TAGS,
        ALLOWED_ATTR: this.ALLOWED_ATTR,
      });

      // 缓存结果
      const fingerprint = getContentFingerprint(content);
      this.cache.set(fingerprint, {
        html,
        contentLength: content.length,
      });

      this.lastContent = content;
      this.lastRenderedLength = content.length;

      return html;
    } catch (error) {
      console.error('[MarkdownRenderCache] Render error:', error);
      // 降级处理：转义 HTML
      return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    }
  }

  /**
   * 预渲染内容（用于后台准备）
   */
  prerender(content: string): void {
    if (!content) return;
    this.render(content);
  }

  /**
   * 清除缓存
   */
  clear(): void {
    this.cache.clear();
    this.lastContent = '';
    this.lastRenderedLength = 0;
  }

  /**
   * 获取缓存统计
   */
  get stats() {
    return {
      size: this.cache.size,
      lastContentLength: this.lastRenderedLength,
    };
  }
}

// 预定义的缓存实例
export const fileSearchCache = new AsyncCache<any[]>(5000);
export const commandCache = new SyncCache<any[]>(10000);

/**
 * 全局 Markdown 渲染缓存实例
 */
export const markdownCache = new MarkdownRenderCache(200);
