# Verificaciones que necesitan ROS 2

Estas comprobaciones no se pueden ejecutar en macOS sin ROS. Cada una cierra una
tarea que sigue abierta en el tracker. Anota el comando y su salida en la tarea
correspondiente antes de marcarla `[x]`.

Requisitos: un entorno ROS 2 (Humble o Jazzy) sourceado, el wheel instalado y
`cotton` en el `PATH`.

## T034 — Instalación en Ubuntu con venv `--system-site-packages`

```bash
python3 -m venv --system-site-packages /tmp/rs
/tmp/rs/bin/pip install dist/cotton-0.1.0-py3-none-any.whl
/tmp/rs/bin/python -c "import rclpy, cotton; print('ok')"
/tmp/rs/bin/cotton --help
```

Esperado: `ok`, `--help` con el uso y sin instalar otro `rclpy`.

## T069/T070 — Parámetros remotos con un nodo real

```bash
ros2 run demo_nodes_cpp parameter_blackboard &
cotton --no-browser --token test-token &
curl -s -H 'Authorization: Bearer test-token' \
  'http://127.0.0.1:8000/api/nodes//parameter_blackboard/params'
curl -s -o /dev/null -w '%{http_code}\n' -X PUT \
  -H 'Authorization: Bearer test-token' -H 'Content-Type: application/json' \
  -d '{"value": 42}' \
  'http://127.0.0.1:8000/api/nodes//parameter_blackboard/params/use_sim_time'
```

Esperado: el primer `curl` devuelve el JSON de parámetros del nodo; el segundo
responde `204`. La doble barra es el nombre absoluto del nodo en el path.

## T200 — Healthcheck del puente de Foxglove

```bash
ros2 launch foxglove_bridge foxglove_bridge_launch.xml port:=8765 &
cotton --no-browser --token test-token &
curl -s -H 'Authorization: Bearer test-token' http://127.0.0.1:8000/api/plugins
```

Esperado: el plugin `foxglove` llega a `active` (el healthcheck TCP a
`127.0.0.1:8765` pasa) y el panel carga el visor desde el puerto real de la app.
Con `--port 9000`, la URL del panel debe usar `9000`; el puente sigue en `8765`.

## E2E — Docker y Playwright

```bash
docker compose -f docker/compose.yaml up --build -d
cd frontend && npm run e2e
docker compose -f docker/compose.yaml down
```

Esperado: el flujo de `frontend/e2e/mvp.spec.ts` en verde (grafo, lanzar
`talker`, ver logs, parar, abrir el panel).

## Comparación con `ros2` (gate de etapa 1)

Con la app abierta y el mismo `ROS_DOMAIN_ID`:

```bash
ros2 node list
ros2 topic list
ros2 service list
ros2 action list
```

Esperado: las listas de la UI coinciden con estas (el nodo propio
`/cotton_<pid>` y su probe de frecuencia no aparecen). Un cambio en el grafo
se ve en menos de 2 s.
