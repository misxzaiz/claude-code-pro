/**
 * 核心层统一导出
 */

// 模型
export * from './models'

// Agents
export { AgentRegistry } from './agents/AgentRunner'
export type { AgentRunner, AgentInput, AgentOutput, AgentCapabilities } from './agents/AgentRunner'

// Adapters (Engine 适配为 AgentRunner)
export * from './adapters'

// Bootstrap (Agent 注册与初始化)
export * from './agent-bootstrap'

// Managers
export { getTaskManager, TaskManager } from './managers/TaskManager'
export { getRunManager, RunManager } from './managers/RunManager'
export { getReviewManager, ReviewManager } from './managers/ReviewManager'
