# 08 — UI de plugins

**Objetivo:** listar plugins con sus permisos, activarlos y desactivarlos, y abrir el visor embebido de Foxglove.

**Depende de:** 05-ui-shell y el contrato de 04-plugins.

**Desbloquea a:** delivery (criterio de la fase 3).

## Reglas de este fichero

- No crea store ni layout: usa el de 05-ui-shell y añade su slice.
- El iframe sustituye `{host}` por `location.host` (host y puerto) y `{hostname}` por `location.hostname`; nunca fija `127.0.0.1`.
- El panel se registra con `registerPanel()` y muestra el estado `error` del plugin.
- Sin assets de Lichtblick se muestra el fallback con instrucciones, no un iframe roto.

## Bloque X1 — Lista y activación

- [x] **T187 · 10 min** — Escribir el test de `PluginsView` con permisos y activación. **Hecho:** falla por componente ausente.
- [x] **T188 · 15 min** — Implementar `PluginsView` y el estado/error. **Hecho:** T187 en verde.

## Bloque X2 — Panel embebido

- [x] **T189 · 10 min** — Implementar `PluginPanel` con iframe para `iframe`/`stream`. **Hecho:** se abre al activar.
- [x] **T190 · 10 min** — Sustituir `{hostname}` por `location.hostname` y probarlo. **Hecho:** el `src` es correcto.

## Bloque X3 — Panel de Foxglove

- [x] **T196 · 10 min** — Crear `layout.json` con panel 3D sobre `/tf` y Plot sobre `/turtle1/pose`. **Hecho:** el JSON es válido.
- [x] **T197 · 10 min** — Montar `/lichtblick` antes del catch-all y copiar el layout. **Hecho:** `/lichtblick/index.html` responde.
- [x] **T198 · 10 min** — Escribir el test de `PluginPanel` que sustituye el host. **Hecho:** falla por componente ausente.
- [x] **T199 · 10 min** — Implementar el iframe a pantalla completa y el fallback sin assets. **Hecho:** T198 en verde.

## Bloque X4 — Cierre

- [x] **T191 · 10 min** — Checks, build y commit `feat: expose and manage plugins in the ui`. **Hecho:** commit creado.

## Verificación

```bash
npm install
npm run lint
npm run typecheck
npm test -- --coverage
```

## Gate de cierre

- [ ] La lista muestra permisos, estado y error.
- [ ] Activar abre el panel y desactivar lo cierra.
- [ ] El `src` del iframe usa el host del navegador.
- [ ] El layout de Lichtblick se sirve desde `/lichtblick/layout.json`.
