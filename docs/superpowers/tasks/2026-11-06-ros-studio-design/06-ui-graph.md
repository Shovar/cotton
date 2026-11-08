# 06 — UI de grafo

**Objetivo:** mostrar nodos y topics, el detalle de un topic, el editor de parámetros y la medición de frecuencia.

**Depende de:** 05-ui-shell y el contrato de 02-ros-discovery.

**Desbloquea a:** delivery (flujo E2E).

## Reglas de este fichero

- No crea store ni layout: usa el de 05-ui-shell y añade su slice.
- El panel se registra con `registerPanel()`.
- Los nombres de nodo y topic se codifican con `encodeURIComponent`.
- Los estados vacíos se muestran explícitos: «Sin editores», «Sin suscriptores».

## Bloque G1 — Vista de grafo

- [ ] **T093 · 10 min** — Escribir el test de `GraphView` con dos topics y búsqueda. **Hecho:** falla por componente ausente.
- [ ] **T094 · 15 min** — Implementar `GraphView` con lista de nodos y topics. **Hecho:** T093 en verde.
- [ ] **T095 · 10 min** — Implementar el filtro de búsqueda y el agrupado por namespace. **Hecho:** el test de filtrado pasa.

## Bloque G2 — Detalle de topic

- [ ] **T096 · 10 min** — Escribir el test de `TopicDetail` con topic vacío. **Hecho:** falla por componente ausente.
- [ ] **T097 · 15 min** — Implementar `TopicDetail` con tipo, editores y suscriptores. **Hecho:** T096 en verde.
- [ ] **T098 · 5 min** — Mostrar «Sin editores» y «Sin suscriptores» en listas vacías. **Hecho:** el test lo comprueba.

## Bloque G3 — Parámetros y frecuencia

- [ ] **T099 · 10 min** — Escribir el test de `NodeParams` que guarda un booleano. **Hecho:** falla por componente ausente.
- [ ] **T100 · 15 min** — Implementar `NodeParams` con checkbox/input según tipo y `encodeURIComponent`. **Hecho:** T099 en verde.
- [ ] **T101 · 10 min** — Añadir el botón «Medir frecuencia» con spinner y resultado. **Hecho:** llama a `/rate` y muestra Hz.

## Bloque G4 — Datos en vivo

- [ ] **T102 · 10 min** — Conectar carga inicial por REST y actualizaciones por WS. **Hecho:** un `graph.update` se refleja sin recargar.
- [ ] **T103 · 10 min** — Tests, `tsc`, build y commit `feat: add graph, topic detail and parameter editor views`. **Hecho:** commit creado.

## Verificación

```bash
npm install
npm run lint
npm run typecheck
npm test -- --coverage
```

## Gate de cierre

- [ ] La lista de nodos y topics coincide con `/api/graph`.
- [ ] Un `graph.update` se refleja sin recargar.
- [ ] Editar un parámetro booleano, numérico y de texto funciona y muestra el error de la API.
- [ ] La medición de frecuencia muestra Hz o el motivo.
