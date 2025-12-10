#!/bin/bash
set -e

echo "=========================================="
echo "NEAR MPC Oracle - Build & Push"
echo "=========================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running"
  echo "Please start Docker Desktop and try again"
  exit 1
fi

# Get registry from user
read -p "Enter your Docker registry (e.g., docker.io/yourusername): " REGISTRY

if [ -z "$REGISTRY" ]; then
  echo "Error: Docker registry is required"
  exit 1
fi

IMAGE_NAME="near-mpc-oracle"
VERSION="${1:-latest}"
FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${VERSION}"

echo ""
echo "Configuration:"
echo "  Registry: $REGISTRY"
echo "  Image: $IMAGE_NAME"
echo "  Tag: $VERSION"
echo "  Full: $FULL_IMAGE"
echo ""

read -p "Continue with this configuration? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted"
  exit 1
fi

echo ""
echo "Step 1: Building Docker image..."
echo "This may take a few minutes..."
docker build --platform linux/amd64 -t "$IMAGE_NAME:$VERSION" .

echo ""
echo "Step 2: Tagging image for registry..."
docker tag "$IMAGE_NAME:$VERSION" "$FULL_IMAGE"

echo ""
echo "Step 3: Checking Docker registry login..."
if ! docker info 2>/dev/null | grep -q "Username"; then
  echo "Not logged in to Docker registry"
  read -p "Login now? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker login
  else
    echo "Please run 'docker login' and try again"
    exit 1
  fi
fi

echo ""
echo "Step 4: Pushing image to registry..."
echo "This may take several minutes..."
docker push "$FULL_IMAGE"

echo ""
echo "=========================================="
echo "Success! Image pushed to registry"
echo "=========================================="
echo ""
echo "Image URL: $FULL_IMAGE"
echo ""
echo "Next steps:"
echo "1. Go to https://cloud.phala.network"
echo "2. Create new CVM with image: $FULL_IMAGE"
echo "3. Set environment variables (see env.example)"
echo "4. Deploy and test"
echo ""
echo "See DEPLOYMENT_GUIDE.md for detailed instructions"
echo ""











