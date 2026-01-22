/**
 * OpenAI 兼容引擎 - 工具定义和执行器
 *
 * 定义所有可提供给 AI 模型的工具，以及工具执行逻辑。
 * 通过 Tauri invoke 调用后端实现真实的文件操作、命令执行等功能。
 */

import type { OpenAIToolDefinition } from './types'

/**
 * Polaris 支持的工具列表
 * 定义所有可提供给 AI 模型的工具
 */
export const POLARIS_TOOLS: OpenAIToolDefinition[] = [
  // ========== 文件操作工具 ==========

  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取文件内容。使用此工具查看文件的完整内容。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件的绝对路径或相对于项目根目录的路径'
          }
        },
        required: ['path']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件内容。如果文件存在则覆盖，不存在则创建新文件。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件的绝对路径或相对于项目根目录的路径'
          },
          content: {
            type: 'string',
            description: '要写入文件的内容'
          }
        },
        required: ['path', 'content']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'create_file',
      description: '创建新文件。如果文件已存在则报错。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件的绝对路径或相对于项目根目录的路径'
          },
          content: {
            type: 'string',
            description: '文件的初始内容'
          }
        },
        required: ['path', 'content']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: '编辑文件的指定部分。用于替换文件中的特定文本。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件的绝对路径或相对于项目根目录的路径'
          },
          oldText: {
            type: 'string',
            description: '要被替换的原始文本'
          },
          newText: {
            type: 'string',
            description: '替换后的新文本'
          }
        },
        required: ['path', 'oldText', 'newText']
      }
    }
  },

  // ========== 搜索工具 ==========

  {
    type: 'function',
    function: {
      name: 'search_files',
      description: '在文件系统中搜索匹配指定模式的文件路径。使用 glob 模式匹配。',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob 搜索模式，例如 "**/*.ts" 或 "src/**/*.tsx"'
          },
          path: {
            type: 'string',
            description: '搜索起始目录，默认为项目根目录'
          }
        },
        required: ['pattern']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'search_content',
      description: '在文件内容中搜索匹配指定文本或正则表达式的行。',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: '要搜索的文本或正则表达式'
          },
          path: {
            type: 'string',
            description: '搜索路径，默认为项目根目录'
          },
          filePattern: {
            type: 'string',
            description: '限制搜索的文件类型，例如 "**/*.ts"'
          }
        },
        required: ['pattern']
      }
    }
  },

  // ========== 命令执行工具 ==========

  {
    type: 'function',
    function: {
      name: 'execute_command',
      description: '执行 shell 命令并返回输出。用于运行 git、npm 等命令。',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '要执行的 shell 命令'
          },
          cwd: {
            type: 'string',
            description: '命令执行的工作目录，默认为项目根目录'
          },
          timeout: {
            type: 'number',
            description: '命令执行超时时间（毫秒），默认 30000ms'
          }
        },
        required: ['command']
      }
    }
  },

  // ========== Git 工具 ==========

  {
    type: 'function',
    function: {
      name: 'git_status',
      description: '查看 Git 工作区状态。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Git 仓库路径，默认为项目根目录'
          }
        }
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: '查看 Git 差异。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Git 仓库路径'
          },
          file: {
            type: 'string',
            description: '特定文件的差异，不传则显示所有变更'
          }
        }
      }
    }
  },

  // ========== 目录工具 ==========

  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: '列出目录中的文件和子目录。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '目录路径'
          },
          recursive: {
            type: 'boolean',
            description: '是否递归列出子目录'
          }
        },
        required: ['path']
      }
    }
  },
]

/**
 * 工具执行器接口
 */
export interface ToolExecutor {
  /** 执行工具并返回结果 */
  execute(toolName: string, args: Record<string, unknown>): Promise<unknown>
}

/**
 * Tauri 工具执行器
 * 通过 Tauri invoke 调用后端工具
 */
export class TauriToolExecutor implements ToolExecutor {
  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      // 获取 Tauri invoke 函数（从全局对象）
      const invoke = (window as any).__TAURI__?.core?.invoke
      if (!invoke) {
        throw new Error('Tauri invoke not available')
      }

      // 根据工具名称调用对应的 Tauri 命令
      switch (toolName) {
        case 'read_file':
          return await invoke('plugin:filesystem|read_file', { path: args.path })

        case 'write_file':
          return await invoke('plugin:filesystem|write_file', {
            path: args.path,
            contents: args.content
          })

        case 'create_file':
          return await invoke('plugin:filesystem|write_file', {
            path: args.path,
            contents: args.content || ''
          })

        case 'edit_file':
          // 先读取文件，替换内容后再写回
          const currentContent = await invoke('plugin:filesystem|read_file', { path: args.path })
          const newContent = (currentContent as string).replace(
            args.oldText as string,
            args.newText as string
          )
          return await invoke('plugin:filesystem|write_file', {
            path: args.path,
            contents: newContent
          })

        case 'search_files':
          return await invoke('plugin:glob|glob', {
            pattern: args.pattern,
            path: args.path || '.'
          })

        case 'search_content':
          return await invoke('plugin:grep|grep', {
            pattern: args.pattern,
            path: args.path || '.',
            filePattern: args.filePattern
          })

        case 'execute_command':
          return await invoke('plugin:shell|execute', {
            command: args.command,
            cwd: args.cwd,
            timeout: args.timeout || 30000
          })

        case 'git_status':
          return await invoke('plugin:git|status', {
            path: args.path || '.'
          })

        case 'git_diff':
          return await invoke('plugin:git|diff', {
            path: args.path || '.',
            file: args.file
          })

        case 'list_directory':
          return await invoke('plugin:filesystem|read_dir', {
            path: args.path,
            recursive: args.recursive || false
          })

        default:
          throw new Error(`Unknown tool: ${toolName}`)
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

/**
 * Mock 工具执行器（用于开发测试）
 * 在浏览器环境或没有 Tauri 的情况下使用
 */
export class MockToolExecutor implements ToolExecutor {
  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    console.log(`[MockToolExecutor] Executing ${toolName}`, args)

    // 返回模拟结果
    switch (toolName) {
      case 'read_file':
        return `[Mock] Content of ${args.path}`

      case 'write_file':
        return { success: true, path: args.path }

      case 'create_file':
        return { success: true, path: args.path }

      case 'edit_file':
        return { success: true, path: args.path }

      case 'search_files':
        return [
          `src/${args.pattern}`,
          `tests/${args.pattern}`
        ]

      case 'search_content':
        return [
          { file: 'src/index.ts', line: 10, content: '匹配内容' }
        ]

      case 'execute_command':
        return { stdout: '[Mock] Command output', stderr: '' }

      case 'git_status':
        return { branch: 'main', changes: [] }

      case 'git_diff':
        return 'diff --git a/file.ts b/file.ts\n+新增内容\n-删除内容'

      case 'list_directory':
        return [
          { name: 'src', type: 'directory' },
          { name: 'index.ts', type: 'file' }
        ]

      default:
        return { error: `Unknown tool: ${toolName}` }
    }
  }
}

/**
 * 创建工具执行器
 * 根据环境自动选择 Tauri 或 Mock 执行器
 */
export function createToolExecutor(): ToolExecutor {
  // 检查是否在 Tauri 环境中
  const isTauri = !!(window as any).__TAURI__

  if (isTauri) {
    return new TauriToolExecutor()
  } else {
    console.warn('[OpenAICompat] Tauri not available, using MockToolExecutor')
    return new MockToolExecutor()
  }
}
