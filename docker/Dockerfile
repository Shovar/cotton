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

WORKDIR /opt/ros-studio
COPY pyproject.toml README.md LICENSE ./
COPY backend ./backend
COPY --from=web /src/frontend/dist ./backend/src/ros_studio/web

RUN python3 -m venv --system-site-packages /opt/ros-studio/.venv \
 && /opt/ros-studio/.venv/bin/pip install --no-cache-dir . \
 && rm -rf /opt/ros-studio/backend /opt/ros-studio/pyproject.toml \
           /opt/ros-studio/README.md /opt/ros-studio/LICENSE

COPY docker/entrypoint.sh /usr/local/bin/ros-studio-entrypoint
RUN chmod +x /usr/local/bin/ros-studio-entrypoint

ENV ROS_DOMAIN_ID=0
ENV PATH="/opt/ros-studio/.venv/bin:${PATH}"
EXPOSE 8000 8765

ENTRYPOINT ["/usr/local/bin/ros-studio-entrypoint"]
CMD ["ros-studio", "--host", "0.0.0.0", "--no-browser", "--token", "test-token"]
