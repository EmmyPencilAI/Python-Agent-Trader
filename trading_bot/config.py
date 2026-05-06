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
    TRADING_MODE = os.getenv("TRADING_MODE", "paper").lower() # 'real' or 'paper'
    PAPER_BALANCE = float(os.getenv("PAPER_BALANCE", "1000.0"))
    
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
    TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
    API_SECRET_KEY = os.getenv("API_SECRET_KEY")
    DATABASE_NAME = "database.sqlite"
    
    SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "ADA/USDT"]
    SCAN_INTERVAL = 60  # 60 seconds for production scalping
    
    CAPITAL_PER_TRADE_PCT = 2.0 # 2% allocation for micro-compounding
    
    # Risk Management
    MAX_DAILY_LOSS_PCT = 5.0
    MAX_TRADES_PER_DAY = 100
