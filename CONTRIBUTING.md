# Contributing to slack_mcp

Thanks for taking the time to contribute. This document covers the basics of working on the project.

## Reporting issues

Please use [GitHub Issues](https://github.com/NextDoorDevLab/slack_mcp/issues/new). Include your Node.js version, which MCP client you're running it from, and a minimal reproduction wherever possible.

For security-sensitive reports, see [SECURITY.md](SECURITY.md) — please do not file public issues for vulnerabilities.

## Suggesting features

Open a feature request issue describing the use case and what you'd expect the tool to do. This project is intentionally a **single-operator tool** — no shared app, no hosted service, no multi-tenant state (see the README's "Why" section) — features that would require a hosted backend or shared credentials are out of scope here.

## Local development

```bash
git clone https://github.com/NextDoorDevLab/slack_mcp.git
cd slack_mcp
npm install
npm run build
```

Requires Node.js 20+.

## Quality gates

The same checks CI runs:

```bash
npm run lint          # ESLint
npm run format:check  # Prettier (dry run)
npm run build         # TypeScript compile
npm test              # Vitest
```

Run `npm run format` to auto-fix formatting issues.

## Pull request workflow

1. Fork the repo and create a branch from `master`.
2. Make your change — keep PRs focused on a single logical change.
3. Add or update tests covering the change; this codebase favors small, well-tested pure modules over large ones (see `src/oauth/` for the pattern).
4. Run the quality gates above locally.
5. Open a PR using the [pull request template](.github/PULL_REQUEST_TEMPLATE.md).
6. CI will run automatically. `master` is branch-protected: merging requires the CI workflow to pass and at least one approving review, including for maintainers. Address any reviewer feedback in follow-up commits.

## Commit messages

Write commit subjects in the imperative mood ("Add workspace collision check", not "Added" or "Adding"), one logical change per commit. Explain the _why_ in the body when the change isn't obvious from the diff alone. This project does not use Conventional Commits prefixes (`feat:`, `fix:`, etc.) — keep messages plain and descriptive.

## Code of Conduct

By participating in this project, you agree to abide by the project's [Code of Conduct](CODE_OF_CONDUCT.md).
