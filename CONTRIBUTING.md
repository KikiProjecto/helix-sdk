# Contributing to Helix SDK

Thank you for your interest in contributing to Helix SDK! This document provides
guidelines and instructions for contributing to the project.

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for all
contributors. Please be respectful in your interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/helix-sdk.git
   cd helix-sdk
   ```
3. **Install dependencies**:
   ```bash
   pnpm install
   ```
4. **Create a feature branch**:
   ```bash
   git checkout -b feat/your-feature-name
   ```

## Development Workflow

### Running Tests
```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @helix-sdk/core test

# Run with coverage
pnpm test --coverage

# Run in watch mode
pnpm test --watch
```

### Type Checking
```bash
pnpm typecheck
```

### Linting
```bash
pnpm lint
pnpm lint:fix
```

### Building
```bash
pnpm build
```

### Running the Dashboard
```bash
pnpm --filter dashboard dev
# Opens http://localhost:3000
```

## Commit Message Guidelines

Use conventional commits for clear, semantic commit messages:

```
feat(core): add new RPC failover strategy
fix(fees): correct compute unit calculation
docs(readme): clarify quick start example
test(jito): add bundle rejection test
```

Format: `type(scope): description`

Types:
- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation
- `test` — tests
- `refactor` — code refactoring (no feature/fix)
- `perf` — performance improvement
- `ci` — CI/CD configuration
- `build` — build system changes

## Pull Request Process

1. **Ensure tests pass**: `pnpm test`
2. **Ensure types pass**: `pnpm typecheck`
3. **Ensure linting passes**: `pnpm lint`
4. **Update documentation** if needed
5. **Create a pull request** with a clear description

### PR Title Format
Follow the same convention as commits:
```
feat(core): add exponential backoff with jitter
```

### PR Description Template
```markdown
## Description
Brief description of the change

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe how you tested the change

## Checklist
- [ ] Tests pass (`pnpm test`)
- [ ] Types pass (`pnpm typecheck`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Documentation updated
```

## Code Style

- **Formatting**: Prettier (auto-formatted on commit)
- **Linting**: ESLint with TypeScript rules
- **TypeScript**: `strict: true` mode required
- **No `any` types**: Use proper typing
- **JSDoc comments**: On all exported functions

## Testing Requirements

- New features must include tests
- Bug fixes must include regression tests
- Aim for ≥90% code coverage
- Test both happy paths and error cases

## Documentation

- Update README.md if changing public API
- Add JSDoc comments to exported symbols
- Include examples in README for new features

## Publishing Changes

Repository maintainers handle npm publishing.

## Questions?

- Open a GitHub Issue for questions
- Join the Superteam Ukraine Discord for discussions

---

Thank you for contributing to Helix SDK! 🚀
