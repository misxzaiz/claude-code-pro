/**
 * 自动迭代提示词服务
 * 为不同迭代模式和阶段生成结构化的 AI 提示词
 */

import type { IterationConfig, IterationMode, CodeIssue } from '../types/iteration';

/**
 * 生成规划阶段提示词
 */
export function generatePlanningPrompt(config: IterationConfig): string {
  const modeInstructions = getModeInstructions(config.mode);

  return `# 自动项目迭代系统 - 规划阶段

你是一个自动项目迭代系统的规划模块。请分析当前项目并制定详细的实现计划。

## 用户目标
${config.description}

## 迭代模式
${modeInstructions}

## 规划任务
请按以下步骤进行规划：

1. **分析项目结构**
   - 使用 \`/map\` 命令查看当前项目结构
   - 使用 \`/status\` 查看当前 git 状态
   - 识别项目类型和技术栈

2. **制定实现计划**
   - 将目标分解为具体的实现步骤
   - 每个步骤应该是可独立验证的
   - 考虑潜在的依赖关系和风险

3. **输出计划**
   - 用 \`<plan>\` 标签包裹你的计划概览
   - 用 \`<steps>\` 列出具体步骤，每个步骤用 \`<step>\` 标签

## 输出格式示例
\`\`\`
<plan>
这是一个概览，描述整体策略和主要模块...
</plan>

<steps>
<step number="1">分析现有代码结构，确定需要修改的文件</step>
<step number="2">设计并实现核心功能模块</step>
<step number="3">添加必要的测试</step>
<step number="4">更新相关文档</step>
</steps>

<estimated_steps>4</estimated_steps>
\`\`\`

请开始规划，首先使用 \`/map\` 和 \`/status\` 命令了解项目状态。`;
}

/**
 * 生成执行阶段提示词
 */
export function generateExecutingPrompt(
  config: IterationConfig,
  stepDescription: string,
  stepNumber: number
): string {
  return `# 自动项目迭代系统 - 执行阶段

## 用户目标
${config.description}

## 当前任务
步骤 ${stepNumber}: ${stepDescription}

## 执行要求
1. 仔细阅读需要修改的文件
2. 进行必要的代码修改
3. 确保修改不会破坏现有功能
4. 添加适当的注释说明修改原因

## 执行完成标准
- 代码修改已完成
- 修改后的代码符合项目风格
- 没有引入明显的错误

完成后，请简要说明：
- 修改了哪些文件
- 做了什么修改
- 为什么这样修改

请开始执行任务。`;
}

/**
 * 生成审查阶段提示词
 */
export function generateReviewingPrompt(config: IterationConfig): string {
  const reviewCriteria = getReviewCriteria(config.mode);

  return `# 自动项目迭代系统 - 代码审查阶段

请对最近的代码修改进行全面的代码审查。

## 审查标准
${reviewCriteria}

## 审查流程
1. 查看最近的 git diff: \`/diff\`
2. 分析修改的代码
3. 检查是否存在问题

## 输出格式

如果发现任何问题，请用以下格式输出：
\`\`\`
<issues>
<issue>
<severity>high|medium|low</severity>
<description>问题的详细描述</description>
<location>文件路径:行号（如果适用）</location>
<suggestion>修复建议</suggestion>
</issue>
...更多问题...
</issues>
\`\`\`

如果没有发现问题，请输出：
\`\`\`
<no_issues />
<review_summary>代码质量良好，没有发现明显问题。</review_summary>
\`\`\`

请开始审查。`;
}

/**
 * 生成修复阶段提示词
 */
export function generateFixingPrompt(issues: CodeIssue[]): string {
  const issuesList = issues.map((issue, index) => `
${index + 1}. **[${issue.severity.toUpperCase()}]** ${issue.description}
   - 位置: ${issue.location || '未指定'}
   - 建议: ${issue.suggestion || '无'}
`).join('\n');

  return `# 自动项目迭代系统 - 修复阶段

检测到以下问题需要修复：

## 发现的问题
${issuesList}

## 修复要求
1. 按优先级修复问题（high > medium > low）
2. 修复时要确保不引入新问题
3. 修复后使用相关工具验证（如测试、构建）

## 修复流程
1. 分析每个问题的根本原因
2. 实施修复
3. 运行验证（如果配置了自动测试/构建）

## 输出格式
修复完成后，请输出：
\`\`\`
<fix_summary>
<fixed_count>${issues.length}</fixed_count>
<changes>
简要描述做了哪些修改...
</changes>
</fix_summary>
\`\`\`

请开始修复这些问题。`;
}

/**
 * 生成验证阶段提示词
 */
export function generateValidatingPrompt(config: IterationConfig): string {
  let commands: string[] = [];

  if (config.autoRunTests) {
    commands.push('1. 运行测试: `/test`');
  }
  if (config.autoRunBuild) {
    commands.push('2. 运行构建: `/build`');
  }

  if (commands.length === 0) {
    commands.push('1. 检查代码是否能正常运行');
  }

  return `# 自动项目迭代系统 - 验证阶段

请验证当前的修改是否正确完成。

## 验证步骤
${commands.join('\n')}

## 验证标准
- 测试通过（如果有测试）
- 构建成功（如果需要构建）
- 没有引入新的错误或警告

## 输出格式

如果验证通过：
\`\`\`
<validation_result>passed</validation_result>
<summary>所有验证通过，可以继续下一步。</summary>
\`\`\`

如果验证失败：
\`\`\`
<validation_result>failed</validation_result>
<errors>
列出具体的错误或失败信息...
</errors>
<suggested_fixes>
建议的修复方案...
</suggested_fixes>
\`\`\`

请开始验证。`;
}

/**
 * 生成下一轮迭代提示词
 */
export function generateNextIterationPrompt(
  config: IterationConfig,
  completedIterations: number,
  remainingWork?: string
): string {
  return `# 自动项目迭代系统 - 下一轮迭代

## 当前进度
已完成 ${completedIterations} 轮迭代
最大迭代次数: ${config.maxIterations}

${remainingWork ? `## 剩余工作\n${remainingWork}\n` : ''}

## 下一步
请继续执行计划的下一步骤。如果所有步骤都已完成，请告知。

如果已完成所有目标，请输出：
\`\`\`
<iteration_complete />
<final_summary>
总结整个迭代过程中完成的工作...
</final_summary>
\`\`\`

请继续。`;
}

/**
 * 获取模式特定的指令
 */
function getModeInstructions(mode: IterationMode): string {
  switch (mode) {
    case 'feature':
      return `**功能增强模式**
- 识别需要添加的新功能
- 设计功能架构和接口
- 实现核心功能逻辑
- 添加测试和文档`;

    case 'performance':
      return `**性能优化模式**
- 识别性能瓶颈
- 分析代码执行效率
- 实施优化措施
- 测量优化效果`;

    case 'refactoring':
      return `**代码重构模式**
- 识别代码异味和复杂逻辑
- 改进代码结构和组织
- 提高可读性和可维护性
- 保持功能行为不变`;

    case 'bug_fixing':
      return `**Bug 修复模式**
- 搜索和识别潜在 bug
- 分析错误原因
- 实施修复方案
- 验证修复效果`;

    case 'custom':
      return `**自定义流程模式**
- 根据用户的具体描述执行任务
- 灵活调整执行策略`;

    default:
      return '';
  }
}

/**
 * 获取模式特定的审查标准
 */
function getReviewCriteria(mode: IterationMode): string {
  const commonCriteria = `
1. **代码质量**
   - 可读性和可维护性
   - 命名规范
   - 代码复杂度

2. **安全性**
   - SQL 注入风险
   - XSS 漏洞
   - 认证和授权问题

3. **错误处理**
   - 边界条件处理
   - 错误提示信息
   - 异常捕获

4. **兼容性**
   - 是否破坏现有功能
   - API 兼容性`;

  const modeSpecific: Record<IterationMode, string> = {
    feature: `
5. **功能完整性**
   - 是否实现了所有需求
   - 边缘情况处理
   - 用户体验考虑`,

    performance: `
5. **性能考虑**
   - 是否真正优化了性能
   - 是否引入了新的性能问题
   - 资源使用效率`,

    refactoring: `
5. **重构效果**
   - 代码是否更清晰
   - 复杂度是否降低
   - 功能行为是否保持一致`,

    bug_fixing: `
5. **修复效果**
   - 问题是否彻底解决
   - 是否有副作用
   - 是否引入新问题`,

    custom: `
5. **目标达成**
   - 是否满足用户描述的要求
   - 实现是否合理`,
  };

  return commonCriteria + (modeSpecific[mode] || modeSpecific.custom);
}

/**
 * 解析 AI 响应中的结构化数据
 */
export class ResponseParser {
  /**
   * 解析问题列表
   */
  static parseIssues(response: string): CodeIssue[] {
    const issues: CodeIssue[] = [];

    // 检查是否有 no_issues 标记
    if (response.includes('<no_issues')) {
      return issues;
    }

    // 提取 <issues> 标签内容
    const issuesMatch = response.match(/<issues>([\s\S]*?)<\/issues>/);
    if (!issuesMatch) {
      return issues;
    }

    const issuesContent = issuesMatch[1];
    const issueMatches = issuesContent.matchAll(/<issue>([\s\S]*?)<\/issue>/g);

    for (const match of issueMatches) {
      const issueContent = match[1];
      const severityMatch = issueContent.match(/<severity>(high|medium|low)<\/severity>/);
      const descriptionMatch = issueContent.match(/<description>([\s\S]*?)<\/description>/);
      const locationMatch = issueContent.match(/<location>([\s\S]*?)<\/location>/);
      const suggestionMatch = issueContent.match(/<suggestion>([\s\S]*?)<\/suggestion>/);

      if (severityMatch && descriptionMatch) {
        issues.push({
          severity: severityMatch[1] as CodeIssue['severity'],
          description: descriptionMatch[1].trim(),
          location: locationMatch?.[1]?.trim(),
          suggestion: suggestionMatch?.[1]?.trim(),
        });
      }
    }

    return issues;
  }

  /**
   * 解析验证结果
   */
  static parseValidationResult(response: string): { passed: boolean; errors?: string[] } {
    const resultMatch = response.match(/<validation_result>(passed|failed)<\/validation_result>/);

    if (!resultMatch) {
      return { passed: false };
    }

    const passed = resultMatch[1] === 'passed';

    if (!passed) {
      const errorsMatch = response.match(/<errors>([\s\S]*?)<\/errors>/);
      const errors = errorsMatch?.[1]?.split('\n').filter(e => e.trim()) || [];
      return { passed: false, errors };
    }

    return { passed };
  }

  /**
   * 解析计划步骤
   */
  static parsePlanSteps(response: string): { plan: string; steps: string[] } {
    const planMatch = response.match(/<plan>([\s\S]*?)<\/plan>/);
    const stepsMatch = response.matchAll(/<step[^>]*>([\s\S]*?)<\/step>/g);

    const steps: string[] = [];
    for (const match of stepsMatch) {
      steps.push(match[1].trim());
    }

    return {
      plan: planMatch?.[1]?.trim() || '',
      steps,
    };
  }

  /**
   * 解析迭代完成状态
   */
  static isIterationComplete(response: string): boolean {
    return response.includes('<iteration_complete');
  }

  /**
   * 解析修复摘要
   */
  static parseFixSummary(response: string): { fixedCount: number; changes: string } {
    const countMatch = response.match(/<fixed_count>(\d+)<\/fixed_count>/);
    const changesMatch = response.match(/<changes>([\s\S]*?)<\/changes>/);

    return {
      fixedCount: countMatch ? parseInt(countMatch[1], 10) : 0,
      changes: changesMatch?.[1]?.trim() || '',
    };
  }
}
