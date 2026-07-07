# Aegis AI Trader - Unified Deployment Guide

This application is a full-stack Node.js (React + Express) app that manages a Python trading engine.

## 🛡️ 24/7 High Availability & Persistence Guide

### 1. Render.com Persistence (Keep Free Tier Alive)
Render free web services will automatically spin down (go to sleep) after 15 minutes of inactivity (no external incoming HTTP requests). To prevent sleeping and ensure your trading engine runs 24/7 without stopping:
- **Set Up a Free External Ping Service**: 
  - Register at [UptimeRobot.com](https://uptimerobot.com) or [Cron-job.org](https://cron-job.org).
  - Create a new "HTTPS" monitor pointing directly to your Render URL: `https://<your-app-name>.onrender.com/api/health`.
  - Set the interval to check **every 5 minutes**. This keeps the web service constantly active, preventing Render from sleeping.

### 2. Ubuntu VPS from Interserver.net Persistence (Auto-start on reboot)
For Ubuntu VPS deployments, we use **PM2** (Process Manager 2) to manage the applet and keep it running persistently across crashes and system restarts:
- **Deploy with PM2**:
  - Run the VPS deploy script to launch the app automatically.
  - To make PM2 save its process list and start up automatically when your Ubuntu server reboots, run:
    ```bash
    pm2 startup
    # (Follow the instruction printed by PM2 on your terminal to copy/paste the systemd command)
    pm2 save
    ```
- **Checking Engine Logs**:
  - View real-time logs: `pm2 logs`
  - Restart the app: `pm2 restart aegis-trader`

---

## 🚀 Render.com Deployment Steps

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
   - `VITE_API_URL`: Your Render backend URL (e.g., `https://aegis-trader.onrender.com`).
   - If not set, the app will try to call its own domain (which will fail if the backend is elsewhere).

### ⚠️ Netlify Failure
- **Error: "This resource could not be found"**: You likely didn't set the Publish Directory to `dist`.
- We deleted `runtime.txt` and `.python-version` to fix "definition not found" errors on Netlify. Netlify does not need Python to build your React frontend.
