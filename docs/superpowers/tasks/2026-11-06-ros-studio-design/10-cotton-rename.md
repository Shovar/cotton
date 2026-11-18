# 10 — Renombrado integral a Cotton

**Objetivo:** usar Cotton como identidad visible y técnica de la app, sin alias
ni migración de datos.

## Bloque R1 — Backend

- [x] **T220a · 15 min** — Renombrar paquete Python, distribución, CLI y nombres runtime. **Hecho:** `78384a0`; 217 tests pasaron, 2 se excluyeron y la cobertura fue 88.68 %.

## Bloque R2 — Instalación y despliegue

- [x] **T220b · 15 min** — Renombrar instalador, scripts, Docker y CI. **Hecho:** `2b8e87a`; test del instalador, `bash -n`, configuración de Compose y wheel `cotton` verificados.

## Bloque R3 — Frontend

- [x] **T220c · 15 min** — Renombrar identidad visible, assets, namespaces de almacenamiento y paquetes npm. **Hecho:** `b1eab7a` y `9aa6948`; 162 tests pasaron con 94.12 % de cobertura; lint, TypeScript y build pasaron.

## Bloque R4 — Documentación y cierre

- [x] **T220d · 15 min** — Actualizar la documentación, conservar las rutas históricas y buscar referencias residuales. **Hecho:** los enlaces de la documentación modificada resuelven; la búsqueda conserva solo slugs/rutas históricas y pruebas explícitas de no migración. Backend: 218 passed, 2 deselected, 88.68 %; Ruff y mypy pasan y los archivos backend renombrados pasan formato. Frontend: 162 passed, 94.12 %; ESLint, TypeScript y build pasan. El chequeo global de formato aún señala la línea 175, sin cambios, de `backend/tests/test_process_manager.py`.
