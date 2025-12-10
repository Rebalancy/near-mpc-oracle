#!/bin/bash
set -e

echo "==================================="
echo "NEAR MPC Oracle - Phala Deployment"
echo "==================================="
echo ""

# Configuration
IMAGE_NAME="near-mpc-oracle"
IMAGE_TAG="${1:-latest}"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-}"

if [ -z "$DOCKER_REGISTRY" ]; then
  echo "Error: DOCKER_REGISTRY environment variable not set"
  echo "Example: export DOCKER_REGISTRY=docker.io/yourusername"
  exit 1
fi

FULL_IMAGE="${DOCKER_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"

echo "Building Docker image..."
echo "Image: $FULL_IMAGE"
echo ""

# Build multi-platform image
docker build --platform linux/amd64 -t "$FULL_IMAGE" .

echo ""
echo "Image built successfully!"
echo ""

# Optional: Push to registry
read -p "Push image to registry? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Pushing image to registry..."
  docker push "$FULL_IMAGE"
  echo ""
  echo "Image pushed successfully!"
  echo ""
fi

echo "==================================="
echo "Next Steps:"
echo "==================================="
echo ""
echo "1. Log in to Phala Cloud: https://cloud.phala.network"
echo "2. Create new CVM instance"
echo "3. Configure Docker image: $FULL_IMAGE"
echo "4. Set environment variables (see env.example):"
echo "   - API_KEY"
echo "   - NEAR_ACCOUNT_ID"
echo "   - NEAR_PRIVATE_KEY"
echo "   - ETHEREUM_SEPOLIA_RPC"
echo "   - BASE_SEPOLIA_RPC"
echo "   - ARBITRUM_SEPOLIA_RPC"
echo "   - OPTIMISM_SEPOLIA_RPC"
echo "5. Start CVM"
echo "6. Test endpoints:"
echo "   curl https://your-cvm-url/health"
echo "   curl -H 'Authorization: Bearer API_KEY' https://your-cvm-url/api/oracle/agent-address"
echo ""
echo "Done!"











