# AGENTS.md — Working agreement for ROS Studio

This file defines how every agent works in this repository. It applies to the
whole project: backend, frontend, plugins, tests, scripts and docs.

If this file conflicts with another document, **AGENTS.md wins on process** and
the spec/design wins on product behavior. When in doubt, ask before guessing.

## 1. Mandatory working style

Every agent must apply these principles on every task:

- **Ponytail (full level), always active.** Load the `ponytail` skill before
  writing code and keep it active for the whole session. It is disabled only by
  an explicit "stop ponytail" / "normal mode" from the user.
- **SOLID.** Small interfaces, one reason to change, depend on abstractions,
  extend without modifying stable code.
- **Clean Code.** Intention-revealing names, small functions, explicit errors,
  no dead code, no commented-out code, no obvious comments.
- **KISS.** The smallest complete change that fully solves the task. No
  speculative abstractions, options, config or "for later" code.
- **Hexagonal architecture.** Respect the domain layers described in section 3.
- **YAGNI.** Build only what the current task needs.

Ponytail never justifies cutting validation, error handling that prevents data
loss, security, accessibility, tests or anything the user explicitly asked for.

## 2. Before writing anything

1. Read this file, the task in `tasks.md` and the docs it references.
2. Read the code the change touches, including its callers, tests, fixtures and
   configuration.
3. List the full scope: files to change, tests to add or fix, docs to update.
4. If a task would take more than 15 minutes of active work, split it first
   (`T0xxa`, `T0xxb`) as described in `tasks.md`.
5. If the request is ambiguous or the change is destructive, ask. Do not invent
   requirements.

Do not reorganize unrelated code to "match" a pattern. Keep the structure the
repository already uses.

## 3. Hexagonal architecture and domain layers

These are principles, not a mandatory folder tree. Folder names below are
illustrative; apply the dependency rules wherever the code lives.

- **Domain** contains pure business logic and types: entities, value objects,
  domain errors and invariants. It must not import FastAPI, Pydantic, `rclpy`,
  `sqlite3`, `subprocess`, `asyncio`, filesystem, network or React. It must be
  testable without any external system.
- **Application** contains use cases that orchestrate domain logic through
  ports. It may depend on the domain, never on adapters or frameworks.
- **Ports** are small interfaces owned by the inner layers. Define a port where
  a use case needs an external capability; do not let the adapter define it.
- **Adapters** translate between the outside world and the domain: FastAPI
  routes, WebSocket handlers, `GraphSource` with `rclpy`, SQLite repositories,
  process manager, plugin loader, React API clients. They may depend inward;
  inner layers must never depend on them.
- **Dependencies point inward only.** Domain ← application ← adapters. If an
  import breaks that direction, redesign it; do not add a cycle.
- Keep framework objects (`Request`, ORM rows, `rclpy` nodes, subprocess
  handles) at the boundary. Do not leak them into domain or application types.
- Cross a layer boundary with domain types or explicit DTOs, not with raw
  dictionaries or adapter-specific objects.

When adding a feature, prefer a new use case plus a small port over adding a
branch to an existing adapter. When a change does not need a new abstraction,
do not create one.

## 4. Fixed stack and tooling

- **Backend:** Python 3.10+, FastAPI, Pydantic, `rclpy` provided by the active
  ROS 2 environment (never declared as a PyPI dependency). Use `venv` + `pip`.
- **Frontend:** React 19, TypeScript, Vite, `npm`.
- **Tests:** `pytest` (backend) and Vitest + Testing Library (frontend).
- **Quality:** `ruff` and `mypy` (backend), ESLint and `tsc` (frontend).

When `rclpy` comes from a system ROS installation, create the virtual
environment with `--system-site-packages` so the backend can import it. Commit
`package-lock.json`; do not commit `.venv/` or `node_modules/`. Do not introduce
uv, pnpm or yarn lockfiles.

Do not add a dependency for a few lines of code. Use the standard library, an
existing dependency or a local helper first. Any new dependency must be
justified in the commit or PR.

## 5. Test-driven development

Every code change follows red → green → refactor:

1. Write the smallest failing test that expresses the required behavior.
2. Implement the minimum code that makes it pass.
3. Refactor without changing behavior, keeping tests green.

Rules:

- Tests are written before implementation. Exceptions: throwaway stage-0 spikes
  and pure documentation changes.
- Unit tests use fakes at the ports. No real network, DDS, subprocesses or
  filesystem in unit tests.
- Integration tests are marked `integration` and must skip cleanly when ROS is
  not available.
- Every bug fix includes a regression test that fails before the fix.
- Never weaken or delete a test to make CI pass. Fix the cause.
- **Minimum coverage is 80% for backend and frontend.** CI fails below it.
- Test names describe behavior, not implementation details.

## 6. Development workflow

1. Pick the next pending task from `tasks.md`. Work on one task at a time.
2. Load Ponytail and confirm the scope from section 2.
3. Write the failing test.
4. Implement the smallest complete change, including callers, fixtures and docs.
5. Run the relevant checks and fix failures before moving on.
6. Update `tasks.md`: mark `[x]` only with the evidence described in `Hecho:`.
7. Update docs when behavior, API, configuration or commands change.
8. Commit one logical change with a Conventional Commit message in English.

Do not start a new block while the previous one has failing tests. Do not mix
unrelated refactors in a feature commit.

## 7. Verification commands

Run the checks that apply to the changed area. CI uses the same commands.

Backend:

```bash
python -m venv .venv --system-site-packages
source .venv/bin/activate
pip install -e ".[dev]"
ruff check backend
ruff format --check backend
mypy backend/src
pytest -m "not integration" --cov=ros_studio --cov-fail-under=80
```

Frontend:

```bash
npm install
npm run lint
npm run typecheck
npm test -- --coverage
```

Report the exact commands run and their result. Never claim something passes
without showing the command output. If a check cannot run in this environment,
say so explicitly and explain what remains unverified.

## 8. Code review and quality bar

Before considering a task done:

- The diff contains only changes required by the task.
- Domain and application layers have no framework, I/O or ROS imports.
- Public functions and ports have clear names and minimal surface.
- Errors are explicit and actionable; no silent `except: pass`.
- User input, process arguments, file paths and plugin manifests are validated
  at the boundary.
- No process is launched with `shell=True`; use `argv` lists and `shlex`.
- No secrets, tokens or machine-specific paths are committed.
- New behavior has tests; new commands or configuration are documented.

## 9. Security guardrails (non-negotiable)

ROS Studio can start processes and is therefore equivalent to a local shell:

- Bind to `127.0.0.1` by default. Docker is the only documented exception.
- Keep the session token, `Authorization: Bearer` and WebSocket `Origin`
  validation in place. Never disable them to make a test or demo easier.
- Validate and sanitize anything that reaches process execution, filesystem
  access or the HTTP/WebSocket boundary.
- Do not log tokens or full environment dumps.
- Do not add telemetry, cloud calls or remote execution.

## 10. Commits, language and documentation

- **Code, comments, commit messages and documentation are written in English.**
- User-facing documentation may be translated, but English is the source.
- Use **Conventional Commits**: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`,
  `chore:`, `build:`, `ci:`. One logical change per commit.
- Reference the task ID when useful, e.g. `feat: detect ros environment (T036)`.
- Do not amend, rebase, force-push or delete branches unless the user asks.
- Do not commit generated artifacts (`node_modules`, `dist`, coverage output,
  local databases, the packaged frontend).

## 11. Definition of done

A task is done only when all of these are true:

- The acceptance evidence in `tasks.md` is satisfied and reproducible.
- Tests were written first, pass, and coverage is at least 80%.
- `ruff`, `mypy`, ESLint and TypeScript checks pass for the changed area.
- Docs and `tasks.md` are updated.
- The change respects the domain-layer rules and the security guardrails.
- The commit exists with a Conventional Commit message.
- No unrelated, generated or temporary files are included.

## 12. What agents must not do

- Do not bypass the domain layers with shortcuts "just this once".
- Do not introduce an ORM, state manager, DI container or framework layer
  without an explicit request.
- Do not rewrite working code to satisfy a preference.
- Do not silently change the spec, API contract or security model.
- Do not mark a task complete or report success without running the checks.

## 13. References

- Product spec: `Spec IDE local para ROS 2.md`
- Design: `docs/superpowers/specs/2026-11-06-ros-studio-design.md`
- Plan: `docs/superpowers/plans/2026-11-06-ros-studio-mvp.md`
- Task list: `tasks.md`
- Ponytail skill: load it with the `ponytail` skill tool (full level).
