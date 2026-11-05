# romanised-learner — development instructions

lyric learner for canto, mandarin, japanese & korean!

This is a newly initialized repository. Implementation details, toolchain versions and build commands are not yet established. Treat selected technologies as intended direction; inspect the actual files before making assumptions.

## Implementation

- Read the relevant code and trace the existing behaviour before editing.
- Follow established conventions and module boundaries; preserve the existing architecture.
- Keep unrelated components and refactoring outside the requested change.
- Choose the smallest change that fully resolves the requested behaviour.
- Prefer existing dependencies; justify any new dependency before adding it.

## Verification

- Run tests that exercise the changed behaviour.
- Run the relevant lint and type checks available in the repository.
- Check affected user-facing workflows, including accessibility where applicable.
- Avoid redundant large test suites unless failures or the change’s scope justify them.
- Report failed or unavailable checks accurately; distinguish verified results from assumptions.

## Git

- Use descriptive commit messages that explain the completed change.
- Commit completed changes when the user explicitly requests it.
- Push to the configured remote when the user explicitly requests it.
- Never force-push without explicit user permission.
- Never rewrite shared history without explicit user permission.

## Documentation

- Update relevant README sections when the requested change affects them.
- Document meaningful changes to behaviour, configuration or public interfaces.
- Keep documentation proportionate; avoid generating unrelated or repetitive documents.

## Safety

- Never commit credentials, access tokens or private keys.
- Do not expose environment secrets in output, logs or generated files.
- Obtain appropriate explicit authorization before destructive repository operations.
- Preserve existing user data and unrelated local changes.

## Communication

- Keep implementation reports concise and relevant to the requested outcome.
- Explain genuine blockers and the concrete information or action needed to resolve them.
- Distinguish tested behaviour from assumptions and disclose material verification limitations.
- Give useful progress updates without narrating every routine operation.
