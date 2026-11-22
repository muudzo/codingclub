# codingclub

## Read the shared vault first

At the start of every session, before planning or changing this project, read these notes in order:

1. `/Users/michaelnyemudzo/Obsidian/Coding/Home.md`
2. `/Users/michaelnyemudzo/Obsidian/Coding/Workflow.md`
3. `/Users/michaelnyemudzo/Obsidian/Coding/Memory.md`
4. `/Users/michaelnyemudzo/Obsidian/Coding/Skills/Index.md` and any relevant skills it links to.
5. `/Users/michaelnyemudzo/Obsidian/Coding/Projects/codingclub/Index.md`
6. `/Users/michaelnyemudzo/Obsidian/Coding/Projects/codingclub/Decisions.md`
7. `/Users/michaelnyemudzo/Obsidian/Coding/Projects/codingclub/Memory.md`
8. The current feature note linked from the project index, if any.

The Obsidian vault is the shared source for design decisions, reusable skills, and project memory. Code belongs in this repository. If the vault cannot be read, tell the user and resolve access before starting project work.

## Describe, then build

- Write every feature in the vault before implementing it, using `Templates/Feature.md`.
- Put feature notes in `Projects/codingclub/Features/` and link them from `Projects/codingclub/Index.md`.
- Number features sequentially within this project: `001`, `002`, `003`, and so on. Choose the next unused number by checking both the index and feature files. Never reuse a number.
- Record the outcome, behaviour, boundaries, and observable acceptance checks before building.
- Keep the feature note and index status consistent: `idea`, `doing`, or `done`.
- Build one feature at a time. Mark it `doing` when implementation starts and `done` when its acceptance criteria are met and checked.
- Record the actual validation results, design decisions, and useful project memory in the vault. Do not claim checks that were not run.
- Ask the user one question at a time when clarification is needed. A clear request to build does not require a second approval solely because of this workflow.

Follow the user's current instructions if they change this workflow.

## Feature branches and rollback checkpoints

- Start feature work on a dedicated branch based on the current `main`, using a name such as `feature/009-phone-publishing`.
- Keep implementation off `main`. Commit each completed, validated step separately before starting the next step.
- Push the feature branch and merge it into `main` after the feature's required checks pass. Preserve the individual checkpoint commits when merging so they can be reverted independently.
- Keep the published site on the last verified revision while work is in progress. Record the branch, checkpoint commits, validation and rollback instructions in the feature note.

## Debugging workflow

Use this systematic debugging workflow for bugs and failed checks:

1. Reproduce the failure and record the expected behaviour, actual result, and relevant error. Separate environment restrictions from code failures.
2. Trace the failing path and inspect the relevant code, private logs, recent changes, and deployment revision. Keep credentials and private logs out of public output.
3. State a specific root-cause hypothesis and test it with the smallest useful check before editing. Fix the cause while preserving content, drafts, authentication, and retry behaviour.
4. Add a focused regression check for a meaningful behaviour bug; reuse existing tests when they already cover it. Use isolated fixtures instead of production posts.
5. Run the relevant tests and required build/type checks. For UI changes, follow the vault's UI/UX standards, inspect real-browser screenshots and verify navigation, keyboard access, touch targets, overflow, and error recovery.
6. Record actual results and limitations in the feature note, commit the validated fix, and verify the deployed behaviour before calling it resolved. Distinguish browser emulation from physical-device testing.

This is the project's debugging method, documented here so future agents can use it without installing another skill. Keep the investigation scoped to the reported issue; avoid speculative refactors.
