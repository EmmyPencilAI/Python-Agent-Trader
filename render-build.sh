#!/usr/bin/env bash
# exit on error
set -o errexit

# Install Node dependencies
npm install

# Build the React frontend
npm run build

# Verify build
if [ ! -d "dist" ]; then
  echo "Build failed: dist directory not found"
  exit 1
fi

# Install Python dependencies (optional check)
if [ -f requirements.txt ]; then
  pip install -r requirements.txt
fi
