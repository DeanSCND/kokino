# Contributing Guide

> **How to Contribute to Kokino**
>
> **Last Updated:** 2026-01-26

---

## Welcome!

Thank you for your interest in contributing to Kokino! This guide will help you get started.

---

## Ways to Contribute

### 1. Report Bugs

**Before reporting:**
- Search existing issues to avoid duplicates
- Check if it's already fixed in `main` branch

**When reporting:**
- Use issue template (if available)
- Include reproduction steps
- Provide environment details (OS, Node version, etc.)
- Include error messages and logs

### 2. Suggest Features

- Open a GitHub issue with `[Feature Request]` tag
- Describe the problem you're solving
- Provide use cases and examples
- Be open to feedback and discussion

### 3. Submit Pull Requests

**See PR workflow below**

### 4. Improve Documentation

- Fix typos, clarify explanations
- Add examples and diagrams
- Update outdated information
- Documentation PRs follow same process as code

---

## Development Setup

**See:** [Development Guide](DEVELOPMENT.md) for complete setup instructions

**Quick start:**
```bash
git clone https://github.com/yourusername/kokino.git
cd kokino
npm install
cd broker && npm run dev  # Terminal 1
cd ui && npm run dev      # Terminal 2
```

---

## Pull Request Workflow

### 1. Fork and Clone

```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/kokino.git
cd kokino
git remote add upstream https://github.com/ORIGINAL/kokino.git
```

### 2. Create Branch

```bash
git checkout main
git pull upstream main
gt create feature/my-feature  # If using Graphite
# OR
git checkout -b feature/my-feature
```

### 3. Make Changes

- Follow [Conventions](../reference/CONVENTIONS.md)
- Write tests for new functionality
- Update documentation
- Run tests: `npm test -ws`

### 4. Commit

```bash
git add .
git commit -m "feat(broker): add new endpoint"

# Use Conventional Commits format:
# feat: New feature
# fix: Bug fix
# docs: Documentation only
# refactor: Code refactoring
# test: Add/update tests
# chore: Maintenance
```

### 5. Push and Create PR

```bash
gt submit  # Graphite
# OR
git push origin feature/my-feature
gh pr create --title "..." --body "..."
```

### 6. PR Template

```markdown
## Summary
Brief description of changes

## Changes
- Bullet list of specific changes

## Testing
- [ ] Tests added/updated
- [ ] Tests pass
- [ ] Manual testing completed

## Related
Closes #123
```

### 7. Review Process

- Maintainer reviews PR
- Address feedback
- Iterate until approved
- Maintainer merges

---

## Code Review Guidelines

### As a Reviewer

- Be kind and constructive
- Focus on code quality, not style preferences
- Explain reasoning for requested changes
- Approve when satisfied

### As an Author

- Be open to feedback
- Ask questions if unclear
- Make requested changes promptly
- Thank reviewers for their time

---

## Coding Standards

**See:** [Conventions](../reference/CONVENTIONS.md) for complete coding standards

**Summary:**
- Use ES modules (`import/export`)
- Follow naming conventions (camelCase, PascalCase, UPPER_SNAKE_CASE)
- Write tests for new code
- Document public APIs
- Keep PRs focused and small (<200 LOC preferred)

---

## Testing Requirements

- All new features must have tests
- Bug fixes should include regression tests
- Tests must pass before merge
- Aim for 80%+ coverage

**Run tests:**
```bash
npm test -ws
npm test -ws -- --coverage
```

---

## Documentation Requirements

When adding/changing features:

1. Update API docs (`docs/reference/API.md`)
2. Update relevant guides
3. Add examples where helpful
4. Update CHANGELOG.md (if exists)

---

## Release Process

**For maintainers only:**

1. Update version in `package.json` files
2. Update CHANGELOG.md
3. Create git tag: `git tag v0.2.0`
4. Push tag: `git push --tags`
5. GitHub Action creates release (planned)

---

## Community Guidelines

- Be respectful and professional
- Welcome newcomers
- Help others learn
- Follow code of conduct

---

## Getting Help

- **Questions:** Open GitHub discussion
- **Bugs:** Open GitHub issue
- **PRs:** Tag maintainers for review

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Kokino! 🎉**
