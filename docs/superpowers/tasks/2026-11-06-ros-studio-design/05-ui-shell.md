# 05 — Shell de la UI

**Objetivo:** crear el proyecto Vite, los clientes REST/WS, el store, el layout dockview y la barra de estado.

**Depende de:** 00-foundation (contrato REST/WS y token).

**Desbloquea a:** 06-ui-graph, 07-ui-processes y 08-ui-plugins.

## Reglas de este fichero

- Es el único fichero que crea `store.ts`, `Workbench.tsx` y `preferences.ts`.
- Cada feature UI registra su panel con `registerPanel()`; no edita `Workbench.tsx`.
- Cada feature añade su slice al store desde su propio módulo; no reescribe el store global.
- Los componentes no llaman a `fetch` directamente: usan `apiGet`/`apiSend`.

## Bloque U0 — Proyecto Vite y tests

- [x] **T080 · 15 min** — Crear el proyecto Vite React-TS y instalar `dockview`, TanStack Query, Zustand y Vitest. **Hecho:** `npm run dev` arranca.
- [x] **T081 · 10 min** — Configurar Vitest, jsdom y `@testing-library/jest-dom`. **Hecho:** un test trivial pasa.

## Bloque U1 — Token, clientes y estado

- [x] **T082 · 10 min** — Escribir el test de `readTokenFromHash` e implementarlo. **Hecho:** extrae el token y limpia el hash.
- [x] **T083 · 10 min** — Escribir el test de `nextDelay` e implementar el backoff del WS. **Hecho:** 1 s→30 s con techo.
- [x] **T084 · 10 min** — Escribir el test del cliente REST e implementar `apiGet`/`apiSend` con Bearer y `ApiError`. **Hecho:** el test pasa.
- [x] **T085 · 10 min** — Escribir el test de preferencias e implementar tema/layout en `localStorage`. **Hecho:** `data-theme` cambia y persiste.
- [x] **T086 · 10 min** — Implementar el store Zustand con `env`, `graph`, `processes`, `plugins`, `rosConnected`. **Hecho:** un evento WS actualiza el estado.

## Bloque U2 — Workbench y barra de estado

- [x] **T087 · 15 min** — Montar `Workbench` con barra de actividad y `dockview` con paneles vacíos. **Hecho:** se ven las cuatro secciones.
- [x] **T088 · 10 min** — Implementar `StatusBar` y su test con entorno y «ROS desconectado». **Hecho:** el test pasa.

## Bloque U3 — Punto de extensión de paneles

- [x] **T215 · 10 min** — Crear `registerPanel()` y el registro de paneles para que cada vista se registre sin editar `Workbench.tsx`. **Hecho:** un panel de prueba aparece en el dock sin tocar el componente base.

## Bloque U4 — Integración con el backend

- [x] **T091 · 5 min** — Configurar el proxy de Vite para `/api` y `/ws`. **Hecho:** el dev server habla con el backend.
- [x] **T092 · 10 min** — Ejecutar tests, `tsc --noEmit`, build y commit `feat: scaffold react workbench with api and ws clients`. **Hecho:** commit creado.

## Bloque U5 — Identidad visual

- [x] **T218 · 10 min** — Mostrar el logo en la pestaña y la barra de actividad. **Hecho:** el test del Workbench pasa y `npm run build` incluye el favicon.

## Verificación

```bash
npm install
npm run lint
npm run typecheck
npm test -- --coverage
```

## Gate de cierre

- [ ] `npm run dev` arranca y el proxy habla con el backend.
- [ ] El token del hash se guarda en `sessionStorage` y se limpia de la URL.
- [ ] El layout y el tema persisten tras recargar.
- [ ] Una vista nueva se registra como panel sin tocar `Workbench.tsx`.
