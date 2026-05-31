# Contributing

Thanks for considering a contribution. This guide tells you what you need to know to send a pull request that we can merge quickly.

## Before you start

- Read the [Code of Conduct](CODE_OF_CONDUCT.md). It is the floor, not the ceiling.
- For non-trivial changes, open an issue first so we can agree on direction before you spend time on it.
- Small fixes (typos, broken links, single-file refactors) do not need an issue first. Just send the pull request.

## How to write a pull request

Each pull request should:

1. **Do one thing.** If you find a second thing, open a second pull request.
2. **State the change in the title.** Not "fix" or "update" - say what changed.
3. **Explain the why in the description.** Link the issue if there is one.
4. **Pass all checks.** Security, lint, Vale, readability, accessibility (if enabled). All of these run automatically on your pull request.

## Style

- Match the existing code style. We do not have strong opinions beyond what the linters enforce.
- Prefer clear names over short names.
- Avoid adding dependencies unless you need them.
- Comments explain the **why**. Code explains the **what**.

## Writing for BRAINS

Any prose you add - READMEs, comments in docs, error messages, commit messages - should match the BRAINS voice:

- **Plain language first.** Aim for Grade 8 reading level for anything a user will read.
- **Direct, not blunt.** State the point, then the evidence.
- **No deficit framing.** Vale will flag this. Trust the flag.
- **Identity-first by default.** "Autistic users," not "users with autism."

The Vale rule pack in `.vale/styles/BRAINS/` encodes these rules. If the linter blocks you and you think it is wrong, open an issue rather than disabling the rule.

## Security

Do not include credentials, tokens, or production data in a pull request. Gitleaks will catch most of these. If you find a security issue, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## License

By contributing you agree your work is licensed under the same terms as the project (MIT by default).

## Questions

Open an issue with the `question` label, or join the BRAINS community channels.
