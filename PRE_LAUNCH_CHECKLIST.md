# ✅ PRE-LAUNCH VERIFICATION CHECKLIST

Run through this before starting the bot with real $9.35:

## 🔧 Installation & Setup

- [ ] Python 3.7+ installed (`python --version`)
- [ ] Dependencies installed (`pip install -r trading_bot/requirements.txt`)
- [ ] Node.js installed for frontend (`npm --version`)
- [ ] Frontend dependencies installed (`npm install` from root)
- [ ] `.env` file exists in project root with all credentials

## 🔐 Security Check

- [ ] `.env` file is in `.gitignore` (not committed to git)
- [ ] BITGET_API_KEY in `.env` (no spaces, exactly as Bitget shows)
- [ ] BITGET_API_SECRET in `.env` (no spaces)
- [ ] BITGET_PASSPHRASE in `.env` (if needed)
- [ ] TELEGRAM_BOT_TOKEN set correctly
- [ ] TELEGRAM_CHAT_ID set correctly
- [ ] API_SECRET_KEY set to "Cybunk2.0X" or custom value
- [ ] Frontend `.env` does NOT contain API keys ✅

## ⚙️ Configuration Verification

- [ ] `config.py` ACTIVE_EXCHANGE = "bitget"
- [ ] `config.py` TRADING_MODE = "real"
- [ ] `config.py` CAPITAL_PER_TRADE_PCT = 2.0
- [ ] `config.py` SYMBOLS includes what you want to trade
- [ ] Database will auto-create on first run

## 💰 Bitget Account Check

- [ ] Logged into Bitget account
- [ ] Balance shows $9.35 (or amount you added)
- [ ] USDT balance in spot wallet (not margin/futures)
- [ ] API key created with **trading** permission enabled
- [ ] API key has **withdrawal** disabled (for security)
- [ ] Your IP is whitelisted in Bitget API settings (if required)

## 📱 Telegram Setup

- [ ] Bot token is valid (test by sending message to bot)
- [ ] Chat ID is correct (you're in the chat)
- [ ] Bot can send messages (test manually)
- [ ] You'll see alerts here when trades execute

## 🗄️ Database

- [ ] Old `database.sqlite` deleted (if exists) - bot will recreate
- [ ] Database file location: `trading_bot/database.sqlite`
- [ ] File will be created automatically on startup

## 🚀 Starting the Bot

### Terminal 1: Start Trading Bot & API
```bash
cd trading_bot
python run_bot.py
```

Look for these messages (means it's working):
```
============================================================
🚀 CRYPTO TRADING BOT STARTING
============================================================
Exchange: bitget
Trading Mode: real
Capital Per Trade: 2%
...
✅ Trading Engine initialized
   Mode: real
   Exchange: bitget
   Balance: $X.XX
🤖 Trading bot ready - scanning markets 24/7...
```

- [ ] No errors in terminal
- [ ] Shows balance from Bitget
- [ ] "Trading bot ready" message appears

### Terminal 2: Start Frontend
```bash
npm run dev
```

- [ ] Frontend starts on http://localhost:5173
- [ ] No "connection refused" errors
- [ ] Dashboard loads

## 🎮 Dashboard Verification

In browser (http://localhost:5173):

1. **Config Tab**
   - [ ] Click Config tab
   - [ ] Enter API Key: `Cybunk2.0X`
   - [ ] Click Submit/Authenticate
   - [ ] No errors shown
   
2. **Dashboard Tab**
   - [ ] Status shows "stopped" initially
   - [ ] Balance shows your $9.35 amount
   - [ ] Exchange shows "Bitget"
   - [ ] Mode shows "real"

3. **Settings/Mode Check**
   - [ ] Click Play button (top right)
   - [ ] Status changes to "running"
   - [ ] Terminal shows "Trading bot ready"
   - [ ] Check is now being done

## 📊 First Trade Verification

Wait 60-120 seconds after clicking Play:

- [ ] Terminal shows "📊 Scanning symbols..."
- [ ] No error messages in terminal
- [ ] Dashboard shows recent trade (Trades tab)
- [ ] Telegram received a notification
- [ ] Bitget app shows open order

If no trade in 2 minutes:
- [ ] Check balance is sufficient ($9.35)
- [ ] Check logs for errors
- [ ] Verify API has trading permission
- [ ] Try toggling bot off/on

## 🧪 Manual API Test

In another terminal:
```bash
curl -H "X-API-Key: Cybunk2.0X" http://localhost:8000/status
```

Expected response:
```json
{
  "status": "running",
  "mode": "real",
  "exchange": "bitget",
  "paper_balance": 1000,
  "real_balance": 9.35
}
```

- [ ] Returns 200 OK
- [ ] real_balance matches Bitget balance
- [ ] status shows "running" after clicking Play

## 🚨 Error Recovery

If something fails:

1. **Bot won't start**
   - Check: Python version, dependencies installed
   - Try: `pip install --upgrade -r trading_bot/requirements.txt`

2. **"Insufficient balance" error**
   - Normal with small balance on some pairs
   - Bot will skip pairs and try others
   - Add more funds if persists

3. **No API connection**
   - Verify internet is working
   - Check: CCXT/Bitget API status
   - Try: `pip install --upgrade ccxt`

4. **Telegram not sending**
   - Verify bot token in .env
   - Verify chat ID is correct
   - Test token manually in Telegram app

5. **Dashboard not connecting**
   - Check: Is `run_bot.py` still running?
   - Try: Refresh browser (F5)
   - Try: `npm run dev` restart

## ✅ Ready to Trade!

If all checkboxes above are ticked:

✅ Bot will scan markets every 60 seconds  
✅ Trades execute automatically when signals appear  
✅ Telegram alerts you of every trade  
✅ Dashboard shows real-time status  
✅ Your $9.35 is working for you 24/7  

---

## 📋 Daily Monitoring

Once running:

- [ ] Check Telegram every hour for trades
- [ ] Review balance daily (in dashboard)
- [ ] Monitor P&L in Trades tab
- [ ] Verify bot is still running (`status` API)
- [ ] Check for errors in terminal

## 🛑 Stopping the Bot

Graceful shutdown:
1. Click Stop button in dashboard, OR
2. Press Ctrl+C in terminal running `python run_bot.py`
3. Wait for "Bot stopped" message

Then check Bitget for any open orders to close manually.

---

**After completing all checks, you're ready to let the bot trade! 🚀**

Good luck! Monitor for first 24-48 hours, then you can leave it running 24/7.
