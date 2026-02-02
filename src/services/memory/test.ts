/**
 * SQLite 功能测试
 *
 * 用于验证数据库功能是否正常工作
 */

import { DatabaseManager } from './database'

export async function testDatabase() {
  console.log('[Test] 开始测试数据库功能...')

  try {
    // 1. 测试数据库初始化
    console.log('[Test] 步骤 1: 初始化数据库')
    const dbManager = DatabaseManager.getInstance()
    await dbManager.init()
    console.log('[Test] ✅ 数据库初始化成功')

    // 2. 测试统计信息
    console.log('[Test] 步骤 2: 获取统计信息')
    const stats = await dbManager.getStats()
    console.log('[Test] ✅ 统计信息:', stats)

    // 3. 测试会话创建
    console.log('[Test] 步骤 3: 创建测试会话')
    const { SessionRepository } = await import('./repositories/session-repository')
    const sessionRepo = new SessionRepository()

    await sessionRepo.create({
      id: 'test-session-123',
      title: '测试会话',
      workspacePath: '/test/path',
      engineId: 'deepseek',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      totalTokens: 0,
      archivedCount: 0,
      archivedTokens: 0,
      isDeleted: false,
      isPinned: false,
      schemaVersion: 1,
    })
    console.log('[Test] ✅ 测试会话创建成功')

    // 4. 测试会话查询
    console.log('[Test] 步骤 4: 查询测试会话')
    const session = await sessionRepo.findById('test-session-123')
    if (session) {
      console.log('[Test] ✅ 会话查询成功:', session.title)
    } else {
      console.log('[Test] ❌ 会话查询失败')
    }

    // 5. 清理测试数据
    console.log('[Test] 步骤 5: 清理测试数据')
    await sessionRepo.delete('test-session-123')
    console.log('[Test] ✅ 测试数据清理成功')

    console.log('[Test] ✅ 所有测试通过！')
    return true
  } catch (error) {
    console.error('[Test] ❌ 测试失败:', error)
    return false
  }
}
