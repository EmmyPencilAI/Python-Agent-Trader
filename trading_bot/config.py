import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    BINANCE_API_KEY = os.getenv("BINANCE_API_KEY")
    BINANCE_SECRET_KEY = os.getenv("BINANCE_SECRET_KEY")
    
    BITGET_API_KEY = os.getenv("BITGET_API_KEY")
    BITGET_API_SECRET = os.getenv("BITGET_API_SECRET")
    BITGET_PASSPHRASE = os.getenv("BITGET_PASSPHRASE") # Bitget requires a passphrase

    ACTIVE_EXCHANGE = os.getenv("ACTIVE_EXCHANGE", "bitget").lower() # 'binance' or 'bitget'
    TRADING_MODE = os.getenv("TRADING_MODE", "real").lower() # 'real' or 'paper'
    PAPER_BALANCE = float(os.getenv("PAPER_BALANCE", "1000.0"))
    
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
    TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
    API_SECRET_KEY = os.getenv("API_SECRET_KEY")

    DATABASE_NAME = "database.sqlite"
    
    # Symbols to trade - Bitget format
    SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "ADAUSDT"]
    SCAN_INTERVAL = 60  # seconds - checks market every minute for scalping
    
    # Risk Management - Micro trading with compound growth
    MAX_DAILY_LOSS_PCT = 5.0  # Stop trading if daily loss exceeds 5%
    MAX_TRADES_PER_DAY = 100  # Allow many micro trades for compounding
    CAPITAL_PER_TRADE_PCT = 2.0  # Use only 2% per trade for safety
