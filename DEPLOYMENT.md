# Aegis AI Trader - Unified Deployment Guide

This application is a full-stack Node.js (React + Express) app that manages a Python trading engine.

## 🚀 Render.com (Recommended for 24/7 Trading)

1. **New Web Service**: Connect your repo.
2. **Runtime**: Select **Node**.
3. **Build Command**: `./render-build.sh`
4. **Start Command**: `npm start`
5. **Environment Variables**:
   - `BINANCE_API_KEY`, `BINANCE_SECRET_KEY`
   - `BITGET_API_KEY`, `BITGET_SECRET_KEY`, `BITGET_PASSPHRASE`
   - `API_SECRET_KEY` (Used to secure your dashboard)
   - `DATABASE_URL` (Optional, defaults to local SQLite)

### ⚠️ Common Errors on Render
- **Error: "Start: command not found"**: Do NOT type "Start Command: npm start". Only type `npm start` in the start command box.
- **Python Version**: Render Node images include Python. We removed `runtime.txt` to let Render use its default stable Python.

## 🌐 Netlify (Frontend Only)

1. **Build Command**: `npm run build`
2. **Publish Directory**: `dist` (CRITICAL: Do not leave blank)
3. **Environment Variables**:
   - `VITE_API_URL`: Your Render backend URL (e.g., `https://aegis-python.onrender.com`).
   - If not set, the app will try to call its own domain (which will fail if the backend is elsewhere).

### ⚠️ Netlify Failure
- **Error: "This resource could not be found"**: You likely didn't set the Publish Directory to `dist`.
- We deleted `runtime.txt` and `.python-version` to fix "definition not found" errors on Netlify. Netlify does not need Python to build your React frontend.
