---
name: testing
description: Comprehensive testing workflow for writing, running, and iterating on tests. Use when Claude needs to: (1) Write new tests based on requirements, (2) Debug failing tests, (3) Improve test coverage, (4) Set up testing infrastructure. Supports pytest, jest, vitest, and other testing frameworks.
---

# Testing Skill

Comprehensive testing workflow for writing, running, and iterating on tests.

## Quick Start

1. **Understand requirements** - Clarify what needs to be tested
2. **Write tests** - Follow framework-specific patterns
3. **Run tests** - Execute and verify failures
4. **Iterate** - Fix and re-run until passing

## Framework Patterns

### Python (pytest)

```python
def test_feature():
    # Arrange
    input = create_test_input()

    # Act
    result = process(input)

    # Assert
    assert result.expected == "value"
```

**Best practices:**
- Test one thing per test
- Use descriptive test names
- Mock external dependencies
- Test edge cases

### JavaScript/TypeScript (jest/vitest)

```typescript
describe('Feature', () => {
  it('should do something', () => {
    // Arrange
    const input = createTestInput()

    // Act
    const result = process(input)

    // Assert
    expect(result).toBe('expected value')
  })
})
```

**Best practices:**
- Use `describe` blocks for related tests
- Test async code with `async/await`
- Mock functions with `jest.fn()`
- Clear mocks after each test

## Testing Strategy

### When to Write Tests

1. **Before coding** (TDD approach)
   - Write test first
   - Run test (should fail)
   - Write minimal code to pass
   - Refactor

2. **After coding**
   - Write tests for existing code
   - Focus on critical paths
   - Add edge cases

### Test Coverage

- Aim for 80%+ coverage on critical code
- Focus on business logic, not getters/setters
- Test error cases and edge cases

### Common Patterns

**Testing async code:**
```python
async def test_async_function():
    result = await async_function()
    assert result == expected
```

**Testing errors:**
```python
def test_error_case():
    with pytest.raises(ValueError):
        raise_error()
```

```typescript
it('should throw error', () => {
  expect(() => throwError()).toThrow(Error)
})
```

## Troubleshooting

### Tests pass locally but fail in CI
- Check environment variables
- Verify dependencies are installed
- Check for timing issues

### Flaky tests
- Add explicit waits
- Mock external dependencies
- Use deterministic test data

### Slow tests
- Mock expensive operations
- Parallelize test execution
- Use test doubles
