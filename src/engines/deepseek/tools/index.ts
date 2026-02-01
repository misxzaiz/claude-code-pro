/**
 * DeepSeek Tool Schemas
 *
 * 定义所有可供 DeepSeek 调用的工具 Schema。
 * 遵循 OpenAI Function Calling 格式（DeepSeek 兼容）。
 *
 * @author Polaris Team
 * @since 2025-01-24
 */

/**
 * DeepSeek Tool Schema 格式
 */
interface DeepSeekToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters?: {
      type: 'object'
      properties?: Record<string, {
        type: string
        description: string
        enum?: string[]
      }>
      required?: string[]
      additionalProperties?: boolean
    }
    strict?: boolean
  }
}

// ==================== 工具定义 ====================

/**
 * 读取文件工具
 */
const READ_FILE_TOOL: DeepSeekToolSchema = {
  type: 'function',
  function: {
    name: 'read_file',
    description: '读取文件内容',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '相对路径',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
}

/**
 * 写入文件工具
 */
const WRITE_FILE_TOOL: DeepSeekToolSchema = {
  type: 'function',
  function: {
    name: 'write_file',
    description: '创建或覆盖文件',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '相对路径',
        },
        content: {
          type: 'string',
          description: '文件内容',
        },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
}

/**
 * 编辑文件工具
 */
const EDIT_FILE_TOOL: DeepSeekToolSchema = {
  type: 'function',
  function: {
    name: 'edit_file',
    description: '精确编辑文件（文本替换）',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '相对路径',
        },
        oldStr: {
          type: 'string',
          description: '原文（精确匹配）',
        },
        newStr: {
          type: 'string',
          description: '新文本',
        },
      },
      required: ['path', 'oldStr', 'newStr'],
      additionalProperties: false,
    },
  },
}

/**
 * 列出文件工具
 */
const LIST_FILES_TOOL: DeepSeekToolSchema = {
  type: 'function',
  function: {
    name: 'list_files',
    description: '列出目录文件',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '目录路径（相对路径）',
        },
        recursive: {
          type: 'boolean',
          description: '是否递归',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
}

/**
 * Bash 工具
 */
const BASH_TOOL: DeepSeekToolSchema = {
  type: 'function',
  function: {
    name: 'bash',
    description: '执行 shell 命令',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '命令内容',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
}

/**
 * Git 状态工具
 */
const GIT_STATUS_TOOL: DeepSeekToolSchema = {
  type: 'function',
  function: {
    name: 'git_status',
    description: '获取 Git 状态',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
}

/**
 * Git Diff 工具
 */
const GIT_DIFF_TOOL: DeepSeekToolSchema = {
  type: 'function',
  function: {
    name: 'git_diff',
    description: '查看 Git diff',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文件路径',
        },
        cached: {
          type: 'boolean',
          description: '暂存区 diff',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
}

/**
 * Git Log 工具
 */
const GIT_LOG_TOOL: DeepSeekToolSchema = {
  type: 'function',
  function: {
    name: 'git_log',
    description: '查看 Git 提交历史',
    parameters: {
      type: 'object',
      properties: {
        maxCount: {
          type: 'number',
          description: '返回数量',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
}

/**
 * Todo 添加工具
 */
const TODO_ADD_TOOL: DeepSeekToolSchema = {
  type: 'function',
  function: {
    name: 'todo_add',
    description: '添加待办',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: '待办内容',
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'urgent'],
          description: '优先级',
        },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
}

/**
 * Todo 列表工具
 */
const TODO_LIST_TOOL: DeepSeekToolSchema = {
  type: 'function',
  function: {
    name: 'todo_list',
    description: '列出待办',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed', 'all'],
          description: '状态筛选',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
}

/**
 * Todo 完成工具
 */
const TODO_COMPLETE_TOOL: DeepSeekToolSchema = {
  type: 'function',
  function: {
    name: 'todo_complete',
    description: '完成待办',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '待办 ID',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
}

/**
 * Todo 删除工具
 */
const TODO_DELETE_TOOL: DeepSeekToolSchema = {
  type: 'function',
  function: {
    name: 'todo_delete',
    description: '删除待办',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '待办 ID',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
}

/**
 * 搜索文件工具
 */
const SEARCH_FILES_TOOL: DeepSeekToolSchema = {
  type: 'function',
  function: {
    name: 'search_files',
    description: '按文件名搜索',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: '搜索模式（支持 *）',
        },
        path: {
          type: 'string',
          description: '搜索目录',
        },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
}

/**
 * 搜索代码工具
 */
const SEARCH_CODE_TOOL: DeepSeekToolSchema = {
  type: 'function',
  function: {
    name: 'search_code',
    description: '在文件内容中搜索',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索内容',
        },
        path: {
          type: 'string',
          description: '搜索目录',
        },
        file_pattern: {
          type: 'string',
          description: '文件模式过滤',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
}

// ==================== 导出 ====================

/**
 * 所有工具 Schema 列表
 */
export const TOOL_SCHEMAS: DeepSeekToolSchema[] = [
  // ===== 文件操作工具 =====
  READ_FILE_TOOL,
  WRITE_FILE_TOOL,
  EDIT_FILE_TOOL,
  LIST_FILES_TOOL,

  // ===== Bash 工具 =====
  BASH_TOOL,

  // ===== Git 工具 =====
  GIT_STATUS_TOOL,
  GIT_DIFF_TOOL,
  GIT_LOG_TOOL,

  // ===== Todo 工具 =====
  TODO_ADD_TOOL,
  TODO_LIST_TOOL,
  TODO_COMPLETE_TOOL,
  TODO_DELETE_TOOL,

  // ===== 搜索工具 =====
  SEARCH_FILES_TOOL,
  SEARCH_CODE_TOOL,
]

/**
 * 生成 DeepSeek Tool Calls 格式的工具 Schema 列表
 *
 * @returns 工具 Schema 数组
 */
export function generateToolSchemas(): Array<any> {
  return TOOL_SCHEMAS
}

/**
 * 根据意图生成工具 Schema 列表（按需优化）
 *
 * @param requiredTools - 需要的工具名称列表
 * @returns 工具 Schema 数组
 */
export function generateToolSchemasForIntent(requiredTools: string[]): Array<any> {
  if (!requiredTools || requiredTools.length === 0) {
    // 如果没有指定工具，返回空数组（不发送任何工具）
    return []
  }

  // 只返回需要的工具
  return TOOL_SCHEMAS.filter(tool =>
    requiredTools.includes(tool.function.name)
  )
}

/**
 * 根据名称获取工具 Schema
 *
 * @param name - 工具名称
 * @returns 工具 Schema，不存在返回 undefined
 */
export function getToolSchema(name: string): DeepSeekToolSchema | undefined {
  return TOOL_SCHEMAS.find(tool => tool.function.name === name)
}

/**
 * 获取所有工具名称列表
 *
 * @returns 工具名称数组
 */
export function getToolNames(): string[] {
  return TOOL_SCHEMAS.map(tool => tool.function.name)
}

/**
 * 检查工具是否存在
 *
 * @param name - 工具名称
 * @returns 工具是否存在
 */
export function hasTool(name: string): boolean {
  return TOOL_SCHEMAS.some(tool => tool.function.name === name)
}
