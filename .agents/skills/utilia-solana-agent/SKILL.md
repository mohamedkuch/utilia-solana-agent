```markdown
# utilia-solana-agent Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `utilia-solana-agent` JavaScript codebase. It covers file naming, import/export styles, commit message habits, and testing patterns. While no specific frameworks or automated workflows were detected, this guide provides best practices and command suggestions for consistent development.

## Coding Conventions

### File Naming
- **Style:** Kebab-case (all lowercase, words separated by hyphens)
- **Example:**  
  ```
  solana-agent.js
  transaction-handler.js
  ```

### Imports
- **Style:** Absolute imports (from the project root or a configured base path)
- **Example:**
  ```js
  import { sendTransaction } from 'utils/solana';
  ```

### Exports
- **Style:** Named exports (no default exports)
- **Example:**
  ```js
  // In solana-agent.js
  export function createAgent(config) { ... }
  export function closeAgent(agent) { ... }
  ```

### Commit Messages
- **Style:** Freeform, no strict prefixes
- **Average Length:** ~37 characters
- **Examples:**
  ```
  add transaction signing logic
  fix bug in agent initialization
  update readme with usage info
  ```

## Workflows

### Adding a New Utility Module
**Trigger:** When you need to add a new helper or utility function.
**Command:** `/add-utility-module`

1. Create a new file in kebab-case (e.g., `my-helper.js`).
2. Write functions and export them using named exports.
   ```js
   // my-helper.js
   export function usefulHelper() { ... }
   ```
3. Import your utility using absolute paths where needed.
   ```js
   import { usefulHelper } from 'utils/my-helper';
   ```
4. Write a corresponding test file (`my-helper.test.js`).

### Writing and Running Tests
**Trigger:** When you develop or modify code and need to verify correctness.
**Command:** `/run-tests`

1. Create test files matching the pattern `*.test.*` (e.g., `solana-agent.test.js`).
2. Write test cases for each exported function.
   ```js
   // solana-agent.test.js
   import { createAgent } from 'solana-agent';

   test('should create agent with config', () => {
     const agent = createAgent({ key: 'value' });
     expect(agent).toBeDefined();
   });
   ```
3. Run the tests using your preferred test runner.

## Testing Patterns

- **Test File Naming:** Files end with `.test.js` (e.g., `transaction-handler.test.js`).
- **Framework:** Not explicitly detected; use your preferred JavaScript test framework (e.g., Jest, Mocha).
- **Test Structure:** Import named exports and write assertions for each function.
- **Example:**
  ```js
  import { closeAgent } from 'solana-agent';

  test('closes agent successfully', () => {
    const agent = { /* mock agent */ };
    expect(() => closeAgent(agent)).not.toThrow();
  });
  ```

## Commands

| Command               | Purpose                                   |
|-----------------------|-------------------------------------------|
| /add-utility-module   | Scaffold a new utility module             |
| /run-tests            | Run all test files matching `*.test.*`    |
```
