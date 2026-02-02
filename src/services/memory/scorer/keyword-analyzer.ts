/**
 * 关键词分析器
 * 分析消息中的关键词类型和密度
 *
 * @author Polaris Team
 * @since 2026-02-03
 */

/**
 * 关键词分析结果
 */
export interface KeywordAnalysis {
  /** 技术关键词数量 */
  technical: number
  /** 动作关键词数量 */
  action: number
  /** 问题关键词数量 */
  question: number
  /** 所有提取的关键词 */
  keywords: string[]
}

/**
 * 关键词分析器
 */
export class KeywordAnalyzer {
  // 技术关键词库
  private technicalKeywords = new Set([
    // 编程概念
    'function', 'class', 'interface', 'type', 'async', 'await', 'promise',
    'array', 'object', 'string', 'number', 'boolean', 'null', 'undefined',
    'map', 'set', 'json', 'xml', 'html', 'css', 'javascript', 'typescript',
    'react', 'vue', 'angular', 'node', 'express', 'koa', 'nest',
    'database', 'sql', 'nosql', 'mongodb', 'mysql', 'postgresql', 'redis',
    'api', 'rest', 'graphql', 'grpc', 'websocket',
    'git', 'github', 'gitlab', 'docker', 'kubernetes', 'ci', 'cd',
    'test', 'jest', 'mocha', 'cypress', 'selenium',
    'webpack', 'vite', 'rollup', 'babel', 'ts',

    // 中文技术词
    '函数', '类', '接口', '类型', '异步', '数组', '对象',
    '数据库', '接口', '前端', '后端', '全栈',
    '测试', '部署', '构建', '编译', '运行',
  ])

  // 动作关键词库
  private actionKeywords = new Set([
    'create', 'update', 'delete', 'insert', 'select', 'find',
    'build', 'compile', 'run', 'execute', 'deploy', 'test',
    'add', 'remove', 'modify', 'change', 'replace', 'swap',
    'send', 'receive', 'fetch', 'post', 'get', 'put', 'patch',
    'import', 'export', 'require', 'include',
    'install', 'uninstall', 'update', 'upgrade', 'downgrade',

    // 中文动作词
    '创建', '更新', '删除', '插入', '查找', '搜索',
    '构建', '编译', '运行', '执行', '部署', '测试',
    '添加', '移除', '修改', '替换', '交换',
    '发送', '接收', '获取', '请求',
    '导入', '导出', '安装', '卸载', '升级',
  ])

  // 问题关键词库
  private questionKeywords = new Set([
    'what', 'how', 'why', 'when', 'where', 'who', 'which',
    'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does',
    'problem', 'issue', 'error', 'bug', 'fail', 'wrong',
    'help', 'support', 'assist', 'guide', 'explain',

    // 中文问题词
    '什么', '怎么', '如何', '为什么', '何时', '哪里', '谁',
    '能否', '可以', '应该', '是否', '问题', '错误', '失败',
    '帮助', '支持', '解释', '说明',
  ])

  /**
   * 分析关键词
   */
  analyze(content: string): KeywordAnalysis {
    const words = this.extractWords(content)
    const keywordSet = new Set<string>()

    let technicalCount = 0
    let actionCount = 0
    let questionCount = 0

    for (const word of words) {
      const lowerWord = word.toLowerCase()

      if (this.technicalKeywords.has(lowerWord)) {
        technicalCount++
        keywordSet.add(word)
      }

      if (this.actionKeywords.has(lowerWord)) {
        actionCount++
        keywordSet.add(word)
      }

      if (this.questionKeywords.has(lowerWord)) {
        questionCount++
        keywordSet.add(word)
      }
    }

    return {
      technical: technicalCount,
      action: actionCount,
      question: questionCount,
      keywords: Array.from(keywordSet),
    }
  }

  /**
   * 提取单词
   */
  private extractWords(content: string): string[] {
    // 匹配英文单词
    const englishWords = content.match(/[a-zA-Z]+/g) || []

    // 匹配中文词汇（简单按字符分割）
    const chineseChars = content.match(/[\u4e00-\u9fa5]{2,}/g) || []

    return [...englishWords, ...chineseChars]
  }

  /**
   * 检测内容的主要语言
   */
  detectLanguage(content: string): 'zh' | 'en' | 'mixed' {
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length
    const englishWords = (content.match(/[a-zA-Z]+/g) || []).length
    const totalChars = content.length

    if (totalChars === 0) return 'en'

    const chineseRatio = chineseChars / totalChars
    const englishRatio = englishWords / (totalChars / 5) // 估算

    if (chineseRatio > 0.3 && englishRatio > 0.1) return 'mixed'
    if (chineseRatio > 0.3) return 'zh'
    return 'en'
  }

  /**
   * 计算关键词密度（关键词数 / 总词数）
   */
  calculateDensity(content: string): number {
    const analysis = this.analyze(content)
    const words = this.extractWords(content)

    if (words.length === 0) return 0

    const totalKeywords = analysis.technical + analysis.action + analysis.question
    return totalKeywords / words.length
  }

  /**
   * 添加自定义关键词
   */
  addKeyword(type: 'technical' | 'action' | 'question', keyword: string): void {
    const keywordSet = {
      technical: this.technicalKeywords,
      action: this.actionKeywords,
      question: this.questionKeywords,
    }[type]

    keywordSet.add(keyword.toLowerCase())
  }

  /**
   * 批量添加关键词
   */
  addKeywords(
    type: 'technical' | 'action' | 'question',
    keywords: string[]
  ): void {
    for (const keyword of keywords) {
      this.addKeyword(type, keyword)
    }
  }

  /**
   * 获取所有关键词
   */
  getAllKeywords(): {
    technical: string[]
    action: string[]
    question: string[]
  } {
    return {
      technical: Array.from(this.technicalKeywords),
      action: Array.from(this.actionKeywords),
      question: Array.from(this.questionKeywords),
    }
  }
}
