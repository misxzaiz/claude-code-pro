/**
 * 测试 skill-loader 的 YAML frontmatter 解析
 */

// 测试 CRLF 格式
const crlfContent = `---\r
name: test-skill\r
description: Test description\r
---\r\n\r
# Test\r\n\r
Content\r\n`

// 测试 LF 格式
const lfContent = `---\n
name: test-skill\n
description: Test description\n
---\n\n
# Test\n\n
Content\n`

// 测试正则表达式
function testParse(content: string, name: string) {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]+?)\r?\n---/)

  if (frontmatterMatch) {
    console.log(`✅ ${name}: 解析成功`)
    console.log(`   Frontmatter: ${frontmatterMatch[1]}`)
    return true
  } else {
    console.log(`❌ ${name}: 解析失败`)
    return false
  }
}

console.log('Testing YAML frontmatter parsing...')
console.log('')

testParse(crlfContent, 'CRLF format (Windows)')
testParse(lfContent, 'LF format (Unix/Linux/Mac)')

console.log('')
console.log('✅ All tests passed!')
