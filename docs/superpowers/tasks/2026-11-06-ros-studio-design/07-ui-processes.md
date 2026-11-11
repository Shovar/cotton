# 07 — UI de procesos

**Objetivo:** listar y controlar procesos, ver logs en vivo con filtros, gestionar perfiles y abrir la paleta de comandos.

**Depende de:** 05-ui-shell y el contrato de 03-processes.

**Desbloquea a:** delivery (flujo E2E).

## Reglas de este fichero

- No crea store ni layout: usa el de 05-ui-shell y añade su slice.
- El panel se registra con `registerPanel()`.
- Los logs se guardan en un buffer de 2000 líneas; la descarga usa las líneas visibles.
- Los botones de proceso no se habilitan si el estado no lo permite.

## Bloque P1 — Lista y control de procesos

- [x] **T154 · 10 min** — Escribir el test de `ProcessesView` con un proceso fallido y su código de salida. **Hecho:** falla por componente ausente.
- [x] **T155 · 15 min** — Implementar la lista, el formulario de arranque y los botones parar/reiniciar. **Hecho:** T154 en verde.

## Bloque P2 — Logs

- [x] **T156 · 10 min** — Escribir el test de `LogsPanel` con filtro por nivel y búsqueda. **Hecho:** falla por componente ausente.
- [x] **T157 · 15 min** — Implementar el panel de logs con buffer de 2000 líneas. **Hecho:** T156 en verde.
- [x] **T158 · 10 min** — Implementar el filtro combinado de nivel y texto. **Hecho:** el test de filtrado pasa.
- [x] **T159 · 10 min** — Añadir la descarga de las líneas visibles como blob. **Hecho:** se genera el fichero.

## Bloque P3 — Perfiles

- [x] **T160 · 15 min** — Implementar `ProfilesPanel` con listar, iniciar y guardar. **Hecho:** los botones llaman a la API.
- [x] **T161 · 10 min** — Escribir el test de «Guardar como perfil» y conectarlo a `POST /api/profiles`. **Hecho:** el test pasa.

## Bloque P4 — Paleta y eventos

- [x] **T162 · 15 min** — Escribir el test de `CommandPalette` y implementar `Ctrl+Shift+P` con acciones. **Hecho:** ejecuta `open-graph`.
- [x] **T163 · 10 min** — Conectar `process.state` y `process.log` al store y a las vistas. **Hecho:** la UI se actualiza en vivo.
- [x] **T164 · 10 min** — Tests, `tsc`, build y commit `feat: add processes, logs and profiles ui`. **Hecho:** commit creado.

## Verificación

```bash
npm install
npm run lint
npm run typecheck
npm test -- --coverage
```

## Gate de cierre

- [ ] Arrancar, parar y reiniciar desde la UI cambia el estado en vivo.
- [ ] El filtro por nivel y texto se combina y la descarga contiene solo lo visible.
- [ ] «Guardar como perfil» llama a `POST /api/profiles`.
- [ ] `Ctrl+Shift+P` ejecuta `open-graph`.
