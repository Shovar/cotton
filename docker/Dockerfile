# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS web

WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM ros:jazzy-ros-base AS runtime

SHELL ["/bin/bash", "-c"]
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3-venv \
      xvfb \
      ros-jazzy-foxglove-bridge \
      ros-jazzy-turtlesim \
      ros-jazzy-demo-nodes-cpp \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/cotton
COPY pyproject.toml README.md LICENSE ./
COPY backend ./backend
COPY --from=web /src/frontend/dist ./backend/src/cotton/web

RUN python3 -m venv --system-site-packages /opt/cotton/.venv \
 && /opt/cotton/.venv/bin/pip install --no-cache-dir . \
 && rm -rf /opt/cotton/backend /opt/cotton/pyproject.toml \
           /opt/cotton/README.md /opt/cotton/LICENSE

COPY docker/entrypoint.sh /usr/local/bin/cotton-entrypoint
RUN chmod +x /usr/local/bin/cotton-entrypoint

ENV ROS_DOMAIN_ID=0
ENV PATH="/opt/cotton/.venv/bin:${PATH}"
EXPOSE 8000 8765

ENTRYPOINT ["/usr/local/bin/cotton-entrypoint"]
CMD ["cotton", "--host", "0.0.0.0", "--no-browser", "--token", "test-token"]
