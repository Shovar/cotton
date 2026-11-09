# 01 — Spikes de la etapa 0

**Objetivo:** medir el coste real del descubrimiento, validar el apagado de procesos y decidir cómo se sirve Lichtblick antes de escribir producto.

**Depende de:** T001–T011 (repositorio y tooling).

**Desbloquea a:** discovery, processes y delivery con datos medidos, no supuestos.

## Reglas de este fichero

- Los spikes son desechables: no llevan TDD y no se publican como paquete.
- Cada medición se anota en `docs/etapa-0-mediciones.md` con máquina, distro, RMW y versión.
- Si un spike no se puede ejecutar por entorno, se anota la incidencia y se sigue; no se bloquea el resto.
- Ninguna decisión de la etapa 0 se reabre sin una medición nueva.

## Bloque S1 — Sondeo del grafo

- [x] **T012 · 10 min** — Crear `spikes/graph_probe.py` con argumentos, init de `rclpy` y salida JSON. **Hecho:** `--help` funciona sin ROS.
- [x] **T013 · 10 min** — Añadir la creación de 100 publishers `std_msgs/msg/String` en `probe/topic_000…099`. **Hecho:** el script arranca y crea los topics.
- [x] **T014 · 10 min** — Medir 20 s de polling (nombres, tipos y endpoints) y calcular `p50`, `p95`, `max` y `cpu_percent`. **Hecho:** imprime el JSON completo.
- [x] **T015 · 10 min** — Ejecutarlo con 100 topics en el entorno ROS real. **Hecho:** JSON guardado con `topic_count: 100`.
- [x] **T016 · 5 min** — Repetir con `RMW_IMPLEMENTATION=rmw_cyclonedds_cpp` si está instalado. **Hecho:** segunda fila o nota de que no está disponible.
- [x] **T017 · 10 min** — Crear `docs/etapa-0-mediciones.md` con la tabla de máquina, distro, RMW y tiempos. **Hecho:** la tabla tiene al menos una fila.
- [x] **T018 · 5 min** — Anotar la decisión go/no-go: sondeo de 1 s válido si CPU <5 % y p95 <200 ms. **Hecho:** hay una frase de decisión explícita.
- [x] **T019 · 5 min** — Commit `spike: measure ros graph polling cost`. **Hecho:** commit creado.

## Bloque S2 — Señales y huérfanos

- [x] **T020 · 10 min** — Crear `spikes/signals_probe.py` que lance un hijo con grupo propio y un nieto `sleep 60`. **Hecho:** se imprimen `pid` y `pgid` de ambos.
- [x] **T021 · 10 min** — Enviar `SIGINT` al grupo y comprobar con `os.killpg(pgid, 0)` si queda alguien. **Hecho:** se imprime `orphans_after_sigint`.
- [x] **T022 · 5 min** — Añadir la escalada `SIGTERM` y `SIGKILL` hasta dejar el grupo vacío. **Hecho:** se imprime `group_empty: true`.
- [x] **T023 · 10 min** — Añadir el escenario de registro JSON + `kill -9` del padre + comprobación del nieto desde un proceso nuevo. **Hecho:** se imprime si el huérfano sigue vivo.
- [x] **T024 · 10 min** — Añadir un hijo que ignora `SIGINT` y verificar que la escalada termina en `SIGKILL`. **Hecho:** el grupo queda vacío.
- [x] **T025 · 5 min** — Anotar en `docs/etapa-0-mediciones.md` si 5 s + 3 s de gracia son suficientes. **Hecho:** valor anotado.
- [x] **T026 · 5 min** — Commit `spike: validate process group shutdown and orphan detection`. **Hecho:** commit creado.

## Bloque S3 — Lichtblick y assets

- [x] **T027 · 15 min** — Clonar la release estable elegida de Lichtblick y lanzar `npm ci`. **Hecho:** dependencias instaladas o incidencia anotada.
- [x] **T028 · 10 min** — Lanzar `npm run build` y comprobar que termina. **Hecho:** existe el directorio de build.
- [x] **T029 · 10 min** — Medir `du -sh` del build y revisar `LICENSE`. **Hecho:** tamaño, licencia y versión anotados.
- [x] **T030 · 10 min** — Servir el build y conectar con `foxglove_bridge` en `8765`. **Hecho:** la URL conecta y se ve el visor.
- [x] **T031 · 10 min** — Probar `?layout=...` con un layout mínimo. **Hecho:** se anota si funciona y el formato.
- [x] **T032 · 10 min** — Decidir vendorizar vs descargar con checksum y anotar URL/hash/versión. **Hecho:** decisión registrada.

## Bloque S4 — Validación de instalaciones

- [x] **T033 · 15 min** — Validar la instalación en pixi/RoboStack (`pixi add fastapi uvicorn`, wheel local, `import rclpy`). **Hecho:** resultado anotado.
- [ ] **T034 · 15 min** — Validar la instalación en Ubuntu con venv `--system-site-packages`. **Hecho:** `import rclpy` funciona. **Bloqueado:** la sesión corre en macOS arm64 y no hay host Ubuntu 24.04 con ROS 2 por apt; queda anotado en `docs/etapa-0-mediciones.md`.

## Bloque S5 — Cierre

- [x] **T035 · 10 min** — Escribir `spikes/lichtblick_probe.md` y commit `spike: measure lichtblick assets and install paths`. **Hecho:** commit creado.

## Verificación

Los spikes se ejecutan a mano dentro del entorno ROS activo. No hay suite automática para ellos.

## Gate de cierre

- [x] `docs/etapa-0-mediciones.md` tiene filas de sondeo con p50/p95/max y CPU.
- [x] Está anotado si 5 s + 3 s de gracia bastan para apagar grupos de procesos.
- [x] Está decidido vendorizar o descargar Lichtblick, con URL, versión y sha256.
- [x] Las instalaciones de pixi/RoboStack y Ubuntu quedan validadas o con incidencia escrita.
