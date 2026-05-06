# Crypto Trading Bot - Setup & Usage Guide

## Overview
This is a real-time cryptocurrency trading bot that:
- ✅ Scans markets 24/7 every minute
- ✅ Executes micro trades to compound account
- ✅ Supports Bitget and Binance exchanges
- ✅ Implements proper risk management
- ✅ Sends Telegram alerts for all trades
- ✅ Has a web dashboard for control

## Architecture

```
Frontend (React/TypeScript)
    ↓ API calls with auth header
Backend API (FastAPI) - SECURE
    ↓ Only exposes trade data & settings
    ↓ NO environment variables exposed
Trading Engine (Python)
    ↓ Reads env vars from .env file (SECURE)
    ↓ Connects to Bitget/Binance via CCXT
Exchange APIs
```

## Security Features

✅ **Environment Variables are NEVER exposed to frontend**
- All sensitive API keys stay in `.env` file
- Backend loads from .env using `python-dotenv`
- Frontend only gets trading data via protected API endpoints
- API requires `X-API-Key` header for authentication

✅ **Frontend Config Tab**
- Shows IP whitelist status (from database only)
- Controls trading mode (paper/real)
- No sensitive data displayed

## Setup Instructions

### 1. Install Dependencies

```bash
cd trading_bot
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Edit `.env` file with your exchange credentials:

```
ACTIVE_EXCHANGE="bitget"
TRADING_MODE="real"

# Bitget API Credentials (found in Bitget Settings)
BITGET_API_KEY="your_api_key_here"
BITGET_API_SECRET="your_api_secret_here"
BITGET_PASSPHRASE="your_passphrase_here"

# Telegram Notifications
TELEGRAM_BOT_TOKEN="your_bot_token_here"
TELEGRAM_CHAT_ID="your_chat_id_here"

# API Security Key (for dashboard authentication)
API_SECRET_KEY="change_this_to_something_secure"
```

### 3. Initialize Database

The database is automatically created on first run with proper schema including:
- Trades table (with order_id and mode columns)
- Bot state table (with running, mode, exchange settings)

### 4. Run the Bot

#### Option A: Run Both Bot and API
```bash
python run_bot.py
```

This will:
- Start the Trading Engine (real-time market scanning)
- Start the FastAPI server on port 8000
- Initialize database with default settings
- Connect to Bitget with credentials from .env

#### Option B: Run Only Trading Bot
```bash
python main.py
```

#### Option C: Run Only API Server (for development)
```bash
uvicorn api.app:app --reload --port 8000
```

### 5. Test the Bot

Check bot status:
```bash
curl -H "X-API-Key: your_api_key" http://localhost:8000/status
```

Get recent trades:
```bash
curl -H "X-API-Key: your_api_key" http://localhost:8000/trades?limit=10
```

Get configuration:
```bash
curl -H "X-API-Key: your_api_key" http://localhost:8000/config
```

## How It Works

### Real-Time Trading Flow

1. **Market Scanning (Every 60 seconds)**
   - Fetches 1-minute candles for all configured symbols
   - Calculates technical indicators (RSI, MACD, EMA)
   - Generates BUY/SELL/HOLD signals

2. **Signal Generation**
   - Scalping Strategy: RSI + MACD crossover
   - Swing Strategy: EMA 9/21 crossover
   - Confidence scores determine trade strength

3. **Risk Management**
   - Micro trades: 2% of balance per trade (CAPITAL_PER_TRADE_PCT)
   - Max 100 trades per day for compounding
   - 5% daily loss limit (MAX_DAILY_LOSS_PCT)
   - Automatic balance check before real trades

4. **Trade Execution**
   - **Paper Mode**: Simulates trades with virtual balance
   - **Real Mode**: Executes actual orders on Bitget
   - Calculates Take Profit (TP) and Stop Loss (SL)
   - Logs all trades with entry price, quantity, and order_id

5. **Notifications**
   - Telegram alerts for every trade
   - Includes: Symbol, Action, Entry, TP, SL, Balance
   - Error alerts for insufficient funds or API issues

## Configuration Parameters

Edit `config.py` to adjust:

```python
SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "ADAUSDT"]
SCAN_INTERVAL = 60  # seconds between scans
MAX_DAILY_LOSS_PCT = 5.0  # Stop if losses exceed 5%
MAX_TRADES_PER_DAY = 100  # Allow many micro trades
CAPITAL_PER_TRADE_PCT = 2.0  # 2% per trade = safety
```

## API Endpoints (Require X-API-Key Header)

### GET /status
Returns bot status, mode, exchange, balances

### GET /trades?limit=50
Returns recent trades with entry/exit prices, P&L

### GET /config
Returns trading symbols and parameters (NO env vars!)

### POST /bot/toggle
Toggle bot on/off - request body: `{"action": "running"}`

### POST /bot/settings
Update settings - request body: 
```json
{
  "mode": "real",
  "exchange": "bitget",
  "paper_balance": 1000.0
}
```

## Troubleshooting

### Bot Not Scanning Markets
- Check if bot is running: `GET /status` should show `"status": "running"`
- Verify .env file has correct BITGET credentials
- Check logs for exchange connection errors
- Ensure balance > 0 in Bitget account

### Real Trades Not Executing
- Confirm TRADING_MODE="real" in .env
- Check balance: must have at least $5-10 in USDT
- Verify API keys have trading permissions in Bitget
- Check Telegram alerts for detailed error messages

### Connection Errors
- Verify internet connection is stable
- Check CCXT library is up to date: `pip install --upgrade ccxt`
- Bitget might have rate limits - check logs for 429 errors
- Ensure .env credentials are exactly correct (no spaces)

### Database Issues
- Delete `database.sqlite` to reset database
- Bot will recreate it on startup
- Check file permissions if database.sqlite can't be created

## Monitoring Best Practices

1. **Set up Telegram Alerts**
   - Receive live notifications for all trades
   - Get immediate alerts for errors
   - Monitor account balance changes

2. **Check Dashboard Regularly**
   - View recent trades and P&L
   - Monitor bot status
   - Adjust settings as needed

3. **Review Logs**
   - Check `AegisBot` logs for trading decisions
   - Look for API errors or connectivity issues
   - Monitor execution times

## Real Money Tips

⚠️ **Start Small**
- Begin with $10-20 to test the system
- Monitor for 24-48 hours before adding more funds
- Don't increase capital per trade % without backtesting

✅ **Use Stop Orders**
- Bot sets TP and SL automatically
- Monitor if actual Bitget orders have SL/TP set
- Manually set SL/TP if needed

✅ **Daily Review**
- Check P&L every morning
- Review trade log for patterns
- Adjust strategy if needed

## Support

- Check logs: `tail -f -n 100 logs.txt`
- Verify API credentials in Bitget settings
- Test connectivity: `ping google.com`
- Check Telegram bot token: Verify in BotFather

## License
Licensed for personal use. Do not distribute credentials or API keys.
