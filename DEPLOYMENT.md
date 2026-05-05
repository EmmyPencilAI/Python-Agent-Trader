# Aegis AI Trader - Deployment Guide

This system is designed to be split between a **Python Backend (Render)** and a **Frontend Dashboard (Netlify)**.

## 1. Backend Deployment (Render.com)

1. **Create a New Web Service** on Render.
2. **Connect your GitHub Repository**.
3. **Configure Environment Variables** in the Render Dashboard:
   - `BINANCE_API_KEY`, `BINANCE_SECRET_KEY`
   - `BITGET_API_KEY`, `BITGET_SECRET_KEY`, `BITGET_PASSPHRASE`
   - `ACTIVE_EXCHANGE` (Set to "binance" or "bitget")
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
   - `API_SECRET_KEY` (Used to protect your API)
4. **Build Command:** `pip install -r trading_bot/requirements.txt`
5. **Start Command:** `python trading_bot/main.py & uvicorn trading_bot.api.app:app --host 0.0.0.0 --port 10000` (Note: You may need a small bridge script to run both).

## 2. Frontend Deployment (Netlify)

1. **Create a New Site** on Netlify.
2. **Build Settings:**
   - **Build Command:** `npm run build`
   - **Publish Directory:** `dist`
3. **Configure Environment Variables**:
   - `VITE_API_URL`: Set this to your Render service URL (e.g., `https://aegis-trader.onrender.com`).

## 3. Communication Setup
- The Dashboard calls your Render API to fetch balance and trades.
- Ensure CORS is configured if you're hitting the Render API directly from the browser.

---
### Important Notes:
- **IP Whitelisting:** Binance and Bitget strongly recommend whitelisting your VPS/Render IP for API keys.
- **Trading Permissions:** Ensure your API keys have "Enable Spot & Margin Trading" active.
- **Passphrase:** Bitget specifically requires a `passphrase` which is different from your password.
