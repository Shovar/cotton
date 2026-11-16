# Cotton Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename ROS Studio to Cotton across the app's visible and technical identity with no compatibility layer or data migration.

**Architecture:** Keep the existing single-process Python/FastAPI backend and React frontend. Rename the Python package, distribution, CLI, persisted-data namespaces, frontend identifiers, installer/deployment references, and documentation without changing APIs or runtime behavior.

**Tech Stack:** Python 3.10+, FastAPI, Pydantic, `rclpy`, React 19, TypeScript, Vite, npm, pytest, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-cotton-rename-design.md`

## Global Constraints

- Python 3.10+; `rclpy` remains supplied by the active ROS 2 environment, not PyPI.
- Frontend remains React 19, TypeScript, Vite, and npm.
- Keep the API contract, bind default `127.0.0.1`, session-token checks, and WebSocket `Origin` validation unchanged.
- Do not add a `ros-studio` command, `ros_studio` import alias, or old-data migration.
- Old ROS Studio data remains untouched on disk; Cotton uses new storage names.
- Code and documentation remain in English; use the repository's existing pytest, Vitest, Ruff, mypy, ESLint, and TypeScript tooling.

## Review Focus

- **Python entry point/module mismatch:** `cotton --help`, package imports, and the built wheel must agree; cover in Task 1 and Task 2.
- **Wrong or mixed data namespaces:** config and cache resolve under Cotton and old files remain untouched; cover in Task 1.
- **Stale ROS self-node filtering:** the Cotton node and rate probe must be excluded from graph results; cover in Task 1.
- **Installer/deployment still invoking the old command:** generated launcher, dev script, and container all invoke `cotton`; cover in Task 2.
- **Browser state unexpectedly retained or lost under mixed keys:** Cotton reads only Cotton keys; cover in Task 3.

---

### Task 1: Rename the Python package and runtime identity

**Files:**
- Move: `backend/src/ros_studio/` to `backend/src/cotton/`
- Modify: `pyproject.toml` (distribution, wheel/sdist paths, coverage source, Ruff first-party package), all Python imports in `backend/tests/`, and package/runtime references under `backend/src/cotton/`
- Test: `backend/tests/test_cli.py`, `test_package.py`, `test_ros_thread.py`, `test_graph.py`, `test_rate.py`

**Interfaces:**
- Produces the `cotton` Python package, `cotton` distribution metadata, and `cotton` console-script entry point.
- `cli.build_services()` uses `user_config_dir("cotton")` and `user_cache_dir("cotton")`; the ROS node and rate-probe names use the `cotton` prefix.

- [x] Update tests first: `test_parse_args_help_identifies_cotton` asserts `usage: cotton`; `test_build_services_uses_cotton_data_directories` asserts config/cache calls use `cotton`; update `test_default_node_name_includes_the_pid` to expect `cotton_<pid>` and add `test_graph_excludes_cotton_self_node`.
- [x] Run the focused backend tests and confirm they fail against the old names.
- [x] Move the package directory, update internal imports and packaging configuration, and apply Cotton names to runtime defaults, error messages, ROS node/probe names, and test fixtures.
- [x] Run `pytest backend/tests/test_cli.py backend/tests/test_package.py backend/tests/test_ros_thread.py backend/tests/test_graph.py backend/tests/test_rate.py`.
- [x] Commit as `refactor: rename backend identity to cotton`.

### Task 2: Rename installer and deployment entry points

**Files:**
- Modify: `scripts/install.sh`, `scripts/dev.sh`, `docker/Dockerfile`, `docker/compose.yaml`, `.gitignore`, `.dockerignore`, `.github/workflows/ci.yml`, `.github/workflows/integration.yml`
- Test: `backend/tests/test_install_script.py`

**Interfaces:**
- Installer defaults to `~/.local/share/cotton`, installs/exposes `cotton`, and does not create an old-name alias.
- Docker and development scripts launch the `cotton` command and package path.

- [x] Update installer tests first to expect the Cotton executable, package import, and default install prefix.
- [x] Run `pytest backend/tests/test_install_script.py` and confirm failures against the old names.
- [x] Update scripts, Docker paths/labels, and CI commands to the Cotton package and command.
- [x] Run `pytest backend/tests/test_install_script.py`, `bash -n scripts/install.sh scripts/dev.sh`, `python -m build --wheel --no-isolation --outdir /tmp/cotton-wheel`, and `docker compose -f docker/compose.yaml config -q`; confirm the wheel contains `cotton/` and a `cotton` console script.
- [x] Commit as `build: rename installer and deployment to cotton`.

### Task 3: Rename frontend identity and browser storage

**Files:**
- Move: `frontend/src/assets/ros-studio-logo*.png` and `ros-studio-favicon-*.png` to Cotton-named files
- Modify: root and frontend `package.json`/`package-lock.json`, `frontend/index.html`, `frontend/src/layout/Workbench.tsx`, `frontend/src/state/preferences.ts`, `frontend/src/api/session.ts`, `frontend/src/features/processes/commandHistory.ts`
- Test: `frontend/src/layout/Workbench.test.tsx`, `frontend/src/state/preferences.test.ts`, `frontend/src/api/session.test.ts`, `frontend/src/features/processes/commandHistory.test.ts`

**Interfaces:**
- The page title, logo accessible name, favicon asset paths, token key, preferences key, and command-history key use Cotton.
- Existing `ros-studio-*` browser keys are not read or migrated.

- [x] Update tests first: Workbench displays an image named `Cotton`; `preferences.test.ts`, `session.test.ts`, and `commandHistory.test.ts` assert Cotton keys are used and old ROS Studio keys are ignored.
- [x] Run the focused Vitest files and confirm failures against the old names.
- [x] Rename the assets and update frontend labels, imports, and storage constants.
- [x] Set the root npm package to `cotton`, the frontend package to `cotton-frontend`, and regenerate both lockfiles with `npm install --package-lock-only --ignore-scripts` in the root and `frontend/`.
- [x] Run focused Vitest tests, then `npm run lint`, `npm run typecheck`, and `npm run build`.
- [x] Commit as `feat: rename frontend identity to cotton`.

### Task 4: Update documentation and close the rename

**Files:**
- Modify: `AGENTS.md`, `README.md`, `docs/install.md`, `docs/Spec IDE local para ROS 2.md`, `docs/contracts/`, and the existing design/plan/task documents
- Create: `docs/superpowers/tasks/2026-11-06-ros-studio-design/10-cotton-rename.md`
- Modify: `docs/superpowers/tasks/2026-11-06-ros-studio-design.md` and its index to record T220a–T220d and their evidence
- Keep: dated historical document filenames, GitHub repository slug `Shovar/ros-studio`, and local checkout name

**Interfaces:**
- User-facing install examples use `cotton`, `cotton-<version>` wheel names, and Cotton-specific data/cache/install paths.
- Historical engineering paths stay stable; their contents and references describe the current Cotton identity.

- [x] Update install and README examples after Tasks 1–3 establish the exact command and paths.
- [x] Update current product/design/task documentation and links without renaming the GitHub repository or historical document paths; map T220a–T220d to Tasks 1–4.
- [x] Search tracked source and docs for `ROS Studio`, `ros-studio`, and `ros_studio`; resolve all active references and retain only explicit historical/hosting references.
- [x] Run `git diff --check`, backend checks (`ruff check backend`, `ruff format --check backend`, `mypy backend/src`, and `pytest -m "not integration" --cov=cotton --cov-fail-under=80`), and frontend checks (`npm run lint`, `npm run typecheck`, `npm test -- --coverage`). Full backend format check reports an unchanged formatting issue at `backend/tests/test_process_manager.py:175`; the renamed backend files pass the targeted formatting check.
- [x] Commit as `docs: rename project documentation to cotton`.
