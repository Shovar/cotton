# Cotton Rename — Design

## Intent

Rename the application from ROS Studio to **Cotton** across its visible brand
and technical identity. The user confirmed that nobody is using it yet and
chose a clean break rather than compatibility support.

## Goals and non-goals

- Use Cotton in the UI, browser title, command, Python distribution and import
  package, installer, runtime messages, ROS node identity, assets, tests, and
  project documentation.
- Use Cotton-specific configuration, cache, installation, and browser storage
  names. Do not migrate old ROS Studio state; leave any old files untouched.
- Preserve the app's behavior, API contract, and security model.
- The GitHub repository is now `Shovar/cotton`; the existing local checkout
  path remains unchanged.
- Do not add a `ros-studio` command or `ros_studio` import compatibility layer.

## Approaches

1. **Full rename with compatibility:** retain old command/import entry points
   and migrate existing data. This protects existing users but keeps old names
   and migration code in the project.
2. **Full rename with a clean break (chosen):** use Cotton-only identifiers and
   fresh data locations. This is simpler and matches the absence of current
   users. Old data, if present, remains on disk but is not read by Cotton.

## Scope and constraints

Rename project-owned references in backend/frontend source, tests, packaging,
scripts, Docker/CI, and docs. Keep API routes and payloads unchanged. The Python
distribution name `cotton` was checked on PyPI and currently returns 404.

The builder should verify that every active runtime/install reference uses the
new identity and run the relevant backend and frontend checks. Repository URLs
remain unchanged unless the user separately requests a GitHub repository rename.
