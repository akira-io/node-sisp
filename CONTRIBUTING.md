# Contributing to node-sisp

Thanks for your interest in contributing.

## Bugs and feature requests

Open an issue at https://github.com/akira-io/node-sisp/issues. Include:

- What you expected to happen.
- What actually happened.
- A minimal reproduction.
- Versions: node-sisp, the language runtime, and the OS.

## Working on a pull request

1. Fork the repo and create a branch from `main`.
2. Add tests for the change.
3. Run the full test command from the README before pushing.
4. Use conventional commit messages — the changelog is generated from
   them via [git-cliff](https://git-cliff.org).
5. Open the PR against `main`. Keep the diff focused: refactors,
   feature work, and dependency bumps belong in separate PRs.

## Style

- Match the existing project conventions (formatter / linter outputs
  are the source of truth).
- No drive-by refactors in feature PRs.
- No emojis in code, copy, commit messages, or PR descriptions.

## License

By contributing, you agree that your contributions will be dual-licensed
under MIT and Apache-2.0, as described in [LICENSE-MIT](LICENSE-MIT) and
[LICENSE-APACHE](LICENSE-APACHE).
