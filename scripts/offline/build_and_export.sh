#!/usr/bin/env bash
# Build all Rack Insight images on an INTERNET-CONNECTED machine and export
# them (plus the infrastructure images) into a single archive that can be
# carried into an air-gapped network and loaded with `docker load`.
#
# Usage:
#   ./scripts/offline/build_and_export.sh [IMAGE_TAG]
#
# Output:
#   dist/rack-insight-images-<tag>.tar.gz   (all 5 docker images)
#   dist/rack-insight-deploy-<tag>.tar.gz   (compose file + nginx config + scripts)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_TAG="${1:-${IMAGE_TAG:-1.3.1}}"
IMAGE_PREFIX="${IMAGE_PREFIX:-rack-insight}"
DIST_DIR="${REPO_ROOT}/dist"

BACKEND_IMAGE="${IMAGE_PREFIX}-backend:${IMAGE_TAG}"
FRONTEND_IMAGE="${IMAGE_PREFIX}-frontend:${IMAGE_TAG}"
INFRA_IMAGES=(
  "postgres:17-alpine"
  "redis:7-alpine"
  "nginx:1.27-alpine"
)

mkdir -p "${DIST_DIR}"

echo "==> Building application images (tag: ${IMAGE_TAG})"
docker build -t "${BACKEND_IMAGE}" "${REPO_ROOT}/backend"
docker build -t "${FRONTEND_IMAGE}" "${REPO_ROOT}/frontend"

echo "==> Pulling infrastructure images"
for image in "${INFRA_IMAGES[@]}"; do
  docker pull "${image}"
done

IMAGES_ARCHIVE="${DIST_DIR}/rack-insight-images-${IMAGE_TAG}.tar.gz"
echo "==> Exporting images to ${IMAGES_ARCHIVE}"
docker save "${BACKEND_IMAGE}" "${FRONTEND_IMAGE}" "${INFRA_IMAGES[@]}" \
  | gzip > "${IMAGES_ARCHIVE}"

DEPLOY_ARCHIVE="${DIST_DIR}/rack-insight-deploy-${IMAGE_TAG}.tar.gz"
echo "==> Packaging deploy bundle to ${DEPLOY_ARCHIVE}"
tar -czf "${DEPLOY_ARCHIVE}" -C "${REPO_ROOT}" \
  docker-compose.yml \
  docker/nginx/default.conf \
  backend/.env.example \
  scripts/offline/load_images.sh \
  README.md

echo
echo "Done. Copy these two files into the air-gapped network:"
ls -lh "${IMAGES_ARCHIVE}" "${DEPLOY_ARCHIVE}"
echo
echo "On the air-gapped host:"
echo "  tar -xzf rack-insight-deploy-${IMAGE_TAG}.tar.gz"
echo "  ./scripts/offline/load_images.sh rack-insight-images-${IMAGE_TAG}.tar.gz"
echo "  IMAGE_TAG=${IMAGE_TAG} docker compose up -d"
