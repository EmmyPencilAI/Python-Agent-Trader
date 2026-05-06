# Quick Start Guide - Crypto Trading Bot

## Step 1: Install Dependencies

```bash
# Backend dependencies
cd trading_bot
pip install -r requirements.txt

# Frontend dependencies  
cd ..
npm install
```

## Step 2: Environment Setup

Your `.env` file is already configured with:
- ✅ Bitget API credentials
- ✅ Telegram bot token
- ✅ Trading mode: REAL (switched from paper)
- ✅ Active exchange: Bitget

**Verify .env has your actual balance:**
- You added $9.35 to Bitget
- Bot will fetch real balance and use it for trades

## Step 3: Start the Trading Bot

```bash
cd trading_bot
python run_bot.py
```

This starts both:
1. **Trading Engine** - Scans markets every 60 seconds
2. **FastAPI Server** - Provides control dashboard (port 8000)

Expected output:
```
============================================================
🚀 CRYPTO TRADING BOT STARTING
============================================================
Exchange: bitget
Trading Mode: real
Capital Per Trade: 2%
Symbols: BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, ADAUSDT
============================================================
✅ Trading Engine initialized
   Mode: real
   Exchange: bitget
   Balance: $9.35
🤖 Trading bot ready - scanning markets 24/7...
```

## Step 4: Access Dashboard

In another terminal:

```bash
npm run dev
```

Then open http://localhost:5173 in your browser

### Dashboard Configuration

1. **API Key Tab**
   - Get API_SECRET_KEY from `.env` (already set as "Cybunk2.0X")
   - Enter in dashboard to authenticate

2. **Config Tab**
   - Shows IP whitelist status
   - NO environment variables exposed (for security)
   - Can toggle between paper/real mode
   - Can adjust paper balance for testing

3. **Trades Tab**
   - View all executed trades
   - See entry price, quantity, TP/SL, and status
   - Real-time updates as trades execute

## Step 5: Toggle Bot to Start Trading

In dashboard:
1. Click **Play** button to start scanning
2. Bot will begin scanning all symbols every 60 seconds
3. When signal found → Places trade automatically
4. Telegram will send alert for each trade

## What's Happening Now

✅ **Real-Time Market Scanning**
- Checks BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, ADAUSDT every 60 seconds
- Uses scalping strategy (RSI + MACD)
- Generates BUY/SELL/HOLD signals

✅ **Micro Trades**
- Each trade uses 2% of balance ($0.19 minimum from your $9.35)
- Takes small profits (2% TP) with minimal loss (1% SL)
- Compounds earnings over time

✅ **Real Money Execution**
- Trading mode is "real" - uses your Bitget account
- Actual orders placed when signals generated
- Check Bitget app to see open orders

⚠️ **Note on $9.35 Balance**
- May be too small for some pairs due to minimum order size
- Bot will skip pairs where quantity rounds to 0
- Consider this a test amount - add more when confident

## API Endpoints (All Require X-API-Key Header)

### Check Bot Status
```bash
curl -H "X-API-Key: Cybunk2.0X" http://localhost:8000/status
```

Response:
```json
{
  "status": "running",
  "mode": "real",
  "exchange": "bitget",
  "paper_balance": 1000,
  "real_balance": 9.35,
  "active_strategy": "Scalping"
}
```

### Get Recent Trades
```bash
curl -H "X-API-Key: Cybunk2.0X" http://localhost:8000/trades?limit=10
```

### Get Configuration
```bash
curl -H "X-API-Key: Cybunk2.0X" http://localhost:8000/config
```

## Troubleshooting

### Bot Says "Insufficient Balance"
- Your $9.35 might be below minimum order size for some pairs
- Add more funds to Bitget account
- Check logs for which symbol failed

### No Trades Executing
- Verify bot status: Click Play button again
- Check if signals are being generated (check logs)
- Verify Bitget account has funds in USDT
- Check Telegram for error alerts

### API Connection Refused
- Make sure `python run_bot.py` is running
- Check if port 8000 is in use: `netstat -an | grep 8000`
- Try restarting: Ctrl+C then `python run_bot.py`

## Security Features ✅

✅ **No Credentials in Frontend**
- API keys stay in backend `.env` file
- Frontend gets trade data only via API
- Dashboard uses X-API-Key header for authentication

✅ **Real-Time Trading**
- Scans 24/7 every 60 seconds
- Executes trades based on technical signals
- Logs all trades with timestamps

✅ **Risk Management**
- 2% per trade (conservative)
- Up to 100 trades/day for compounding
- Auto-stops if 5% daily loss reached

## Next Steps

1. Monitor trades for 24-48 hours
2. Add more funds when confident
3. Adjust CAPITAL_PER_TRADE_PCT in config.py if needed
4. Set up additional Telegram alerts for notifications
5. Backtest different strategies before switching

## Support

- Check trading_bot logs for detailed errors
- Review TRADING_BOT_SETUP.md for full documentation
- Verify .env variables are exactly correct
- Ensure Bitget API has trading permissions enabled

---

**Remember**: Start small, monitor closely, then scale! Good luck! 🚀
