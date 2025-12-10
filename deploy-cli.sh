#!/bin/bash
set -e

echo "=========================================="
echo "Phala CLI Deployment"
echo "=========================================="
echo ""

# Check if phala.env exists and has been configured
if [ ! -f "phala.env" ]; then
  echo "Error: phala.env file not found"
  echo "Please create phala.env with your configuration"
  exit 1
fi

# Check for placeholder values
if grep -q "REPLACE_WITH" phala.env; then
  echo "⚠️  Warning: phala.env contains placeholder values"
  echo ""
  echo "Please edit phala.env and replace:"
  echo "  - API_KEY (generated: 0e3d620bf2077a01daae9162980fa394d62e78ef4348e8826b9edd58bc057ce2)"
  echo "  - NEAR_PRIVATE_KEY (your actual NEAR private key)"
  echo ""
  read -p "Have you updated phala.env? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please update phala.env and run this script again"
    exit 1
  fi
fi

echo "Configuration:"
echo "  Image: docker.io/gregdev0x/near-mpc-oracle:latest"
echo "  Name: near-mpc-oracle"
echo "  Resources: 1 vCPU, 1024 MB RAM"
echo "  Env file: phala.env"
echo ""

read -p "Deploy with this configuration? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Deployment cancelled"
  exit 0
fi

echo ""
echo "Creating CVM on Phala Cloud..."
echo ""

# Create a temporary docker-compose.yml for Phala CLI
cat > docker-compose.phala.yml <<EOF
version: '3.8'
services:
  oracle:
    image: docker.io/gregdev0x/near-mpc-oracle:latest
    ports:
      - "3001:3001"
    env_file:
      - phala.env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
EOF

echo "Created temporary docker-compose.phala.yml"
echo ""

# Deploy using Phala CLI
phala cvms create \
  --name near-mpc-oracle \
  --compose docker-compose.phala.yml \
  --vcpu 1 \
  --memory 1024 \
  --disk-size 10 \
  --env-file phala.env

echo ""
echo "=========================================="
echo "Deployment command sent!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Check Phala Cloud dashboard for deployment status"
echo "2. Get your CVM URL from the dashboard"
echo "3. Test endpoints:"
echo "   curl https://your-cvm-url/health"
echo "   curl -H 'Authorization: Bearer YOUR_API_KEY' https://your-cvm-url/api/oracle/agent-address"
echo ""











