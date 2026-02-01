/**
 * Intent Detector - 意图检测器
 *
 * 负责分析用户消息，检测其意图，以便动态加载相关上下文。
 * 基于 Claude Code 和 Cursor 的最佳实践。
 *
 * @author Polaris Team
 * @since 2025-02-01
 */

/**
 * 用户意图
 */
export interface Intent {
  /** 意图类型 */
  type: 'chat' | 'code' | 'debug' | 'refactor' | 'test' | 'write' | 'read'
  /** 是否需要工具 */
  requiresTools: boolean
  /** 需要的工具列表 */
  requiredTools: string[]
  /** 是否需要 Skills */
  requiresSkills: boolean
  /** Skill 触发关键词 */
  skillTriggers: string[]
  /** 复杂度 */
  complexity: 'simple' | 'medium' | 'complex'
}

/**
 * Intent Detector
 *
 * 使用规则引擎检测用户意图，避免过度处理。
 */
export class IntentDetector {
  /**
   * 检测用户消息的意图
   */
  detect(userMessage: string): Intent {
    const msg = userMessage.toLowerCase().trim()

    // 1. 检测简单对话（不需要工具）
    if (this.isSimpleChat(msg)) {
      return {
        type: 'chat',
        requiresTools: false,
        requiredTools: [],
        requiresSkills: false,
        skillTriggers: [],
        complexity: 'simple'
      }
    }

    // 2. 检测测试相关
    if (this.isTesting(msg)) {
      return {
        type: 'test',
        requiresTools: true,
        requiredTools: ['bash', 'write_file', 'read_file'],
        requiresSkills: false, // TODO: Phase 2 启用
        skillTriggers: ['testing', 'test'],
        complexity: 'medium'
      }
    }

    // 3. 检测前端设计
    if (this.isFrontendDesign(msg)) {
      return {
        type: 'write',
        requiresTools: true,
        requiredTools: ['write_file', 'read_file', 'edit_file'],
        requiresSkills: false, // TODO: Phase 2 启用
        skillTriggers: ['frontend-design', 'ui', 'ux'],
        complexity: 'complex'
      }
    }

    // 4. 检测代码调试
    if (this.isDebugging(msg)) {
      return {
        type: 'debug',
        requiresTools: true,
        requiredTools: ['read_file', 'bash', 'search_code'],
        requiresSkills: false,
        skillTriggers: [],
        complexity: 'medium'
      }
    }

    // 5. 检测代码重构
    if (this.isRefactoring(msg)) {
      return {
        type: 'refactor',
        requiresTools: true,
        requiredTools: ['read_file', 'edit_file', 'bash'],
        requiresSkills: false,
        skillTriggers: [],
        complexity: 'complex'
      }
    }

    // 6. 检测文件读取
    if (this.isReading(msg)) {
      return {
        type: 'read',
        requiresTools: true,
        requiredTools: ['read_file', 'list_files', 'search_files'],
        requiresSkills: false,
        skillTriggers: [],
        complexity: 'simple'
      }
    }

    // 7. 默认：代码任务
    return {
      type: 'code',
      requiresTools: true,
      requiredTools: ['read_file', 'edit_file', 'write_file'],
      requiresSkills: false,
      skillTriggers: [],
      complexity: 'medium'
    }
  }

  /**
   * 判断是否为简单对话
   *
   * 特征：问候、感谢、简单问题，且不涉及代码/文件
   */
  private isSimpleChat(msg: string): boolean {
    const chatKeywords = [
      '你好', 'hi', 'hello', '嘿',
      '谢谢', 'thank', 'thanks',
      '再见', 'bye',
      '早上好', '下午好', '晚上好'
    ]

    const hasChatKeyword = chatKeywords.some(kw => msg.includes(kw))

    // 排除涉及代码/文件的情况
    const involvesCode = msg.includes('代码') || msg.includes('文件') ||
                         msg.includes('函数') || msg.includes('功能')

    return hasChatKeyword && !involvesCode
  }

  /**
   * 判断是否为测试相关
   */
  private isTesting(msg: string): boolean {
    const testKeywords = [
      '测试', 'test', 'testing',
      'pytest', 'jest', 'vitest',
      '单元测试', '集成测试',
      '用例', 'test case'
    ]

    return testKeywords.some(kw => msg.includes(kw))
  }

  /**
   * 判断是否为前端设计
   */
  private isFrontendDesign(msg: string): boolean {
    const designKeywords = [
      '界面', 'ui', 'ux',
      '前端', 'frontend',
      '页面', 'page',
      '组件', 'component',
      '样式', 'style', 'css',
      '设计', 'design',
      '布局', 'layout'
    ]

    return designKeywords.some(kw => msg.includes(kw))
  }

  /**
   * 判断是否为代码调试
   */
  private isDebugging(msg: string): boolean {
    const debugKeywords = [
      '调试', 'debug',
      '错误', 'error', 'bug',
      '问题', 'issue',
      '修复', 'fix',
      '为什么', 'why',
      '怎么', 'how'
    ]

    return debugKeywords.some(kw => msg.includes(kw))
  }

  /**
   * 判断是否为代码重构
   */
  private isRefactoring(msg: string): boolean {
    const refactorKeywords = [
      '重构', 'refactor',
      '优化', 'optimize',
      '改进', 'improve',
      '重构代码', '代码优化'
    ]

    return refactorKeywords.some(kw => msg.includes(kw))
  }

  /**
   * 判断是否为文件读取
   */
  private isReading(msg: string): boolean {
    const readKeywords = [
      '读取', 'read',
      '查看', 'view',
      '看看', 'show',
      '分析', 'analyze',
      '解释', 'explain'
    ]

    const hasReadKeyword = readKeywords.some(kw => msg.includes(kw))
    const mentionsFile = msg.includes('文件') || msg.includes('代码') || msg.includes('函数')

    return hasReadKeyword && mentionsFile
  }
}
