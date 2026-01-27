/**
 * 工具输入提取器
 *
 * 统一从工具输入参数中提取各种类型的值
 * 避免在 toolConfig.ts 和 toolSummary.ts 中重复实现
 */

/**
 * 文件路径相关的键名
 */
const PATH_KEYS = ['path', 'file_path', 'filePath', 'filename', 'file'] as const;

/**
 * 命令相关的键名
 */
const COMMAND_KEYS = ['command', 'cmd', 'command_string', 'commands'] as const;

/**
 * 搜索查询相关的键名
 */
const QUERY_KEYS = ['query', 'q', 'search', 'keyword', 'pattern', 'regex'] as const;

/**
 * URL 相关的键名
 */
const URL_KEYS = ['url', 'uri', 'href', 'link'] as const;

/**
 * 从工具输入中提取文件路径（只返回文件名）
 *
 * @param input - 工具输入参数对象
 * @returns 文件名，如果未找到则返回空字符串
 *
 * @example
 * extractFilePath({ path: '/src/components/App.tsx' })
 * // => 'App.tsx'
 *
 * extractFilePath({ filePath: 'C:\\project\\index.js' })
 * // => 'index.js'
 */
export function extractFilePath(input: Record<string, unknown> | undefined): string {
  if (!input) return '';

  for (const key of PATH_KEYS) {
    const value = input[key];
    if (typeof value === 'string') {
      // 只显示文件名，不显示完整路径
      const parts = value.split('/');
      const parts2 = value.split('\\');
      const fileName = parts.length > parts2.length
        ? parts[parts.length - 1]
        : parts2[parts2.length - 1];
      return fileName || value;
    }
  }
  return '';
}

/**
 * 从工具输入中提取命令
 *
 * @param input - 工具输入参数对象
 * @param maxLength - 最大长度限制，超过则截断（默认40）
 * @returns 命令字符串，如果未找到则返回空字符串
 *
 * @example
 * extractCommand({ command: 'npm run build' })
 * // => 'npm run build'
 *
 * extractCommand({ commands: ['git commit -m "fix"', 'git push'] })
 * // => 'git commit -m "fix"'
 */
export function extractCommand(
  input: Record<string, unknown> | undefined,
  maxLength: number = 40
): string {
  if (!input) return '';

  for (const key of COMMAND_KEYS) {
    const value = input[key];
    if (typeof value === 'string') {
      // 截断过长的命令
      return value.length > maxLength ? value.slice(0, maxLength - 3) + '...' : value;
    }
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      const cmd = value[0];
      return cmd.length > maxLength ? cmd.slice(0, maxLength - 3) + '...' : cmd;
    }
  }
  return '';
}

/**
 * 从工具输入中提取搜索关键词
 *
 * @param input - 工具输入参数对象
 * @param maxLength - 最大长度限制，超过则截断（默认30）
 * @returns 搜索关键词，如果未找到则返回空字符串
 *
 * @example
 * extractSearchQuery({ query: 'useState' })
 * // => 'useState'
 *
 * extractSearchQuery({ pattern: '^export.*function' })
 * // => '^export.*function'
 */
export function extractSearchQuery(
  input: Record<string, unknown> | undefined,
  maxLength: number = 30
): string {
  if (!input) return '';

  for (const key of QUERY_KEYS) {
    const value = input[key];
    if (typeof value === 'string') {
      return value.length > maxLength ? value.slice(0, maxLength - 3) + '...' : value;
    }
  }
  return '';
}

/**
 * 从工具输入中提取 URL
 *
 * @param input - 工具输入参数对象
 * @param maxLength - 最大长度限制，超过则截断（默认30）
 * @returns 简化的 URL，如果未找到则返回空字符串
 *
 * @example
 * extractUrl({ url: 'https://example.com/docs/api/reference' })
 * // => 'example.com/docs/api...'
 */
export function extractUrl(
  input: Record<string, unknown> | undefined,
  maxLength: number = 30
): string {
  if (!input) return '';

  for (const key of URL_KEYS) {
    const value = input[key];
    if (typeof value === 'string') {
      // 简化 URL 显示
      try {
        const urlObj = new URL(value);
        const hostname = urlObj.hostname;
        const pathname = urlObj.pathname.length > 1 ? urlObj.pathname : '';
        const path = pathname.length > 20 ? pathname.slice(0, 17) + '...' : pathname;
        const result = hostname + path;

        return result.length > maxLength ? result.slice(0, maxLength - 3) + '...' : result;
      } catch {
        return value.length > maxLength ? value.slice(0, maxLength - 3) + '...' : value;
      }
    }
  }
  return '';
}

/**
 * 从工具输入中提取 Todo 任务信息
 *
 * @param input - 工具输入参数对象
 * @returns 任务描述字符串，如果未找到则返回空字符串
 *
 * @example
 * extractTodoInfo({ todos: [{ status: 'completed', content: 'task1' }] })
 * // => '1个已完成'
 */
export function extractTodoInfo(input: Record<string, unknown> | undefined): string {
  if (!input) return '';
  const todos = input.todos as Array<{ status: string; content: string }> | undefined;
  if (!Array.isArray(todos)) return '';

  const total = todos.length;
  const completed = todos.filter(t => t.status === 'completed').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;

  if (completed === total) return `${total}个已完成`;
  if (inProgress > 0) return `${inProgress}/${total} 进行中`;
  return `${total}个任务`;
}

/**
 * 通用值提取器
 *
 * @param input - 工具输入参数对象
 * @param keys - 要查找的键名数组
 * @returns 找到的值，如果未找到则返回 null
 *
 * @example
 * extractValue({ name: 'test' }, ['name', 'title'])
 * // => 'test'
 */
export function extractValue(
  input: Record<string, unknown> | undefined,
  keys: readonly string[]
): string | null {
  if (!input) return null;

  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return null;
}
