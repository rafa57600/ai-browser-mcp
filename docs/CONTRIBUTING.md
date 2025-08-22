# Contributing to AI Browser MCP

Thank you for your interest in contributing to the AI Browser MCP project! This guide will help you get started with development and explain our contribution process.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 16.0 or higher (18.0+ recommended)
- **npm** 7.0 or higher
- **Git** 2.20 or higher
- **Chromium** or **Google Chrome** (for browser automation)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/ai-browser-mcp.git
cd ai-browser-mcp
```

3. Add the upstream repository:

```bash
git remote add upstream https://github.com/ORIGINAL_OWNER/ai-browser-mcp.git
```

## Development Setup

### Install Dependencies

```bash
# Install all dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

### Environment Configuration

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Edit `.env` with your local settings:

```env
# Server Configuration
PORT=3000
HOST=localhost
NODE_ENV=development

# Browser Configuration
BROWSER_HEADLESS=true
BROWSER_TIMEOUT=30000

# Security Configuration
ALLOWED_DOMAINS=localhost,127.0.0.1,example.com
RATE_LIMIT_REQUESTS=60
RATE_LIMIT_WINDOW=60000

# Logging Configuration
LOG_LEVEL=debug
LOG_FILE=logs/server.log
```

### Start Development Server

```bash
# Start in development mode with hot reload
npm run dev

# Or start normally
npm start

# Run in debug mode
DEBUG=ai-browser-mcp:* npm run dev
```

### Verify Installation

Test that everything is working:

```bash
# Run health check
curl http://localhost:3000/health

# Run basic tests
npm test

# Run a simple example
node examples/basic-usage.js
```

## Project Structure

```
ai-browser-mcp/
├── src/                    # Source code
│   ├── server/            # MCP server implementation
│   ├── browser/           # Browser management
│   ├── tools/             # MCP tools (browser operations)
│   ├── security/          # Security and permissions
│   ├── performance/       # Performance optimization
│   ├── errors/            # Error handling
│   ├── config/            # Configuration management
│   ├── monitoring/        # Health checks and metrics
│   └── types/             # TypeScript type definitions
├── tests/                 # Test files
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   ├── e2e/               # End-to-end tests
│   ├── mocks/             # Mock implementations
│   └── fixtures/          # Test data and fixtures
├── docs/                  # Documentation
│   ├── examples/          # Usage examples
│   └── api-reference.md   # API documentation
├── examples/              # Example scripts
├── config/                # Configuration files
├── scripts/               # Build and deployment scripts
├── vscode-extension/      # VS Code extension
└── dist/                  # Built files (generated)
```

### Key Files

- `src/index.ts` - Main entry point
- `src/server/mcp-browser-server.ts` - Core MCP server
- `src/browser/session-manager.ts` - Browser session management
- `src/tools/` - Individual MCP tool implementations
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `vitest.config.ts` - Test configuration

## Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:

- `feature/add-new-tool` - New features
- `fix/browser-crash-issue` - Bug fixes
- `docs/update-api-reference` - Documentation updates
- `refactor/session-management` - Code refactoring
- `test/add-integration-tests` - Test improvements

### Making Changes

1. Create a new branch:

```bash
git checkout -b feature/your-feature-name
```

2. Make your changes following our [coding standards](#code-style)

3. Add or update tests as needed

4. Update documentation if required

5. Test your changes:

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Run linting
npm run lint

# Run type checking
npm run type-check
```

6. Commit your changes:

```bash
git add .
git commit -m "feat: add new screenshot tool with element selection"
```

### Commit Message Format

We use [Conventional Commits](https://conventionalcommits.org/) format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat` - New features
- `fix` - Bug fixes
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

**Examples:**
```
feat(tools): add browser.scroll tool for page scrolling
fix(security): resolve domain validation bypass issue
docs(api): update screenshot tool documentation
test(integration): add tests for macro recording
```

## Testing

### Test Structure

We use **Vitest** for testing with the following structure:

- **Unit Tests** (`tests/unit/`) - Test individual functions and classes
- **Integration Tests** (`tests/integration/`) - Test component interactions
- **End-to-End Tests** (`tests/e2e/`) - Test complete workflows

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- browser-session.test.ts

# Run tests with coverage
npm run test:coverage

# Run tests in specific directory
npm test tests/unit/

# Run tests matching pattern
npm test -- --grep "screenshot"
```

### Writing Tests

#### Unit Test Example

```typescript
// tests/unit/tools/screenshot-tool.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScreenshotTool } from '../../../src/tools/screenshot-tool';

describe('ScreenshotTool', () => {
  let tool: ScreenshotTool;
  let mockPage: any;

  beforeEach(() => {
    mockPage = {
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-image-data'))
    };
    tool = new ScreenshotTool();
  });

  it('should capture full page screenshot', async () => {
    const result = await tool.execute({
      fullPage: true,
      format: 'png'
    }, mockPage);

    expect(mockPage.screenshot).toHaveBeenCalledWith({
      fullPage: true,
      type: 'png'
    });
    expect(result.format).toBe('png');
  });
});
```

#### Integration Test Example

```typescript
// tests/integration/browser-tools.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPBrowserServer } from '../../src/server/mcp-browser-server';

describe('Browser Tools Integration', () => {
  let server: MCPBrowserServer;

  beforeAll(async () => {
    server = new MCPBrowserServer();
    await server.start(0); // Random port
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should create context and navigate', async () => {
    const context = await server.callTool('browser.newContext', {
      viewport: { width: 1280, height: 720 }
    });

    expect(context.sessionId).toBeDefined();

    const navigation = await server.callTool('browser.goto', {
      url: 'https://example.com'
    });

    expect(navigation.status).toBe(200);
  });
});
```

### Test Utilities

Use our test utilities for common operations:

```typescript
import { createTestServer, createMockBrowser } from '../utils/test-helpers';

// Create test server
const server = await createTestServer();

// Create mock browser
const mockBrowser = createMockBrowser();
```

## Code Style

### TypeScript Guidelines

- Use **strict TypeScript** configuration
- Prefer **interfaces** over types for object shapes
- Use **explicit return types** for public methods
- Avoid `any` - use proper typing

```typescript
// Good
interface BrowserOptions {
  headless: boolean;
  viewport: { width: number; height: number };
}

async function createBrowser(options: BrowserOptions): Promise<Browser> {
  // Implementation
}

// Avoid
function createBrowser(options: any): any {
  // Implementation
}
```

### Naming Conventions

- **Classes**: PascalCase (`BrowserSession`, `ScreenshotTool`)
- **Functions/Methods**: camelCase (`createSession`, `takeScreenshot`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_TIMEOUT`, `MAX_SESSIONS`)
- **Files**: kebab-case (`browser-session.ts`, `screenshot-tool.ts`)

### Code Organization

- **One class per file** (with related interfaces/types)
- **Group related functionality** in directories
- **Use barrel exports** (`index.ts` files)
- **Separate concerns** (business logic, configuration, utilities)

### Error Handling

Use our error system consistently:

```typescript
import { BrowserError, ErrorCategory } from '../errors/error-factory';

// Throw specific errors
throw new BrowserError(
  'Element not found',
  ErrorCategory.BROWSER,
  { selector: '#missing-element', timeout: 5000 }
);

// Handle errors appropriately
try {
  await page.click(selector);
} catch (error) {
  if (error instanceof BrowserError) {
    // Handle browser-specific error
  } else {
    // Handle unexpected error
    throw new SystemError('Unexpected error', error);
  }
}
```

### Async/Await

- Prefer `async/await` over Promises
- Handle errors with try/catch
- Use proper typing for async functions

```typescript
// Good
async function navigateToPage(url: string): Promise<NavigationResult> {
  try {
    const response = await page.goto(url);
    return { success: true, status: response.status() };
  } catch (error) {
    throw new NavigationError(`Failed to navigate to ${url}`, error);
  }
}

// Avoid
function navigateToPage(url: string) {
  return page.goto(url).then(response => {
    return { success: true, status: response.status() };
  }).catch(error => {
    throw new NavigationError(`Failed to navigate to ${url}`, error);
  });
}
```

### Linting and Formatting

We use **ESLint** and **Prettier** for code quality:

```bash
# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

Configuration files:
- `.eslintrc.js` - ESLint rules
- `.prettierrc` - Prettier formatting
- `.editorconfig` - Editor settings

## Submitting Changes

### Pull Request Process

1. **Update your branch** with latest upstream changes:

```bash
git fetch upstream
git rebase upstream/main
```

2. **Push your changes**:

```bash
git push origin feature/your-feature-name
```

3. **Create a Pull Request** on GitHub with:
   - Clear title and description
   - Reference to related issues
   - Screenshots/examples if applicable
   - Checklist of changes made

### Pull Request Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Code is commented where necessary
- [ ] Documentation updated
- [ ] No new warnings introduced
```

### Review Process

1. **Automated checks** must pass (CI/CD pipeline)
2. **Code review** by maintainers
3. **Testing** in development environment
4. **Approval** and merge

### Review Criteria

Reviewers will check for:
- **Functionality** - Does it work as intended?
- **Code Quality** - Is it well-written and maintainable?
- **Testing** - Are there adequate tests?
- **Documentation** - Is it properly documented?
- **Performance** - Does it impact performance?
- **Security** - Are there security implications?

## Release Process

### Versioning

We use [Semantic Versioning](https://semver.org/):

- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality
- **PATCH** version for backwards-compatible bug fixes

### Release Workflow

1. **Version bump** in `package.json`
2. **Update CHANGELOG.md** with release notes
3. **Create release tag**
4. **Publish to npm** (maintainers only)
5. **Update documentation**

## Getting Help

### Communication Channels

- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - General questions and ideas
- **Discord** - Real-time chat (link in README)

### Documentation

- **API Reference** - Complete API documentation
- **Examples** - Practical usage examples
- **FAQ** - Common questions and solutions
- **Troubleshooting** - Problem-solving guide

### Mentorship

New contributors can request mentorship:
- Comment on issues tagged `good-first-issue`
- Ask questions in GitHub Discussions
- Join our Discord community

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). We are committed to providing a welcoming and inclusive environment for all contributors.

## Recognition

Contributors are recognized in:
- **CONTRIBUTORS.md** file
- **Release notes** for significant contributions
- **GitHub contributors** page
- **Annual contributor highlights**

Thank you for contributing to AI Browser MCP! 🎉