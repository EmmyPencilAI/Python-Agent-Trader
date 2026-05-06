import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    BINANCE_API_KEY = os.getenv("BINANCE_API_KEY")
    BINANCE_SECRET_KEY = os.getenv("BINANCE_SECRET_KEY")
    
    BITGET_API_KEY = os.getenv("BITGET_API_KEY")
    BITGET_SECRET_KEY = os.getenv("BITGET_SECRET_KEY")
    BITGET_PASSPHRASE = os.getenv("BITGET_PASSPHRASE") # Bitget requires a passphrase

    ACTIVE_EXCHANGE = os.getenv("ACTIVE_EXCHANGE", "binance").lower() # 'binance' or 'bitget'
    TRADING_MODE = os.getenv("TRADING_MODE", "paper").lower() # 'real' or 'paper'
    PAPER_BALANCE = float(os.getenv("PAPER_BALANCE", "1000.0"))
    
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
    TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
    API_SECRET_KEY = os.getenv("API_SECRET_KEY", "supersecurekey")
    
    SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "ADAUSDT"]
    SCAN_INTERVAL = 30  # seconds
    
    DATABASE_NAME = "database.sqlite"
    
    # Risk Management
    MAX_DAILY_LOSS_PCT = 10.0
    MAX_TRADES_PER_DAY = 1000
    CAPITAL_PER_TRADE_PCT = 20.0
