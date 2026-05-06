#!/usr/bin/env python
"""
Main entry point to run both the trading bot and FastAPI server
"""
import threading
import time
import logging
from main import TradingEngine
from api.app import app
import uvicorn
from config import Config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("BotRunner")

def run_trading_engine():
    """Run the trading engine in a separate thread"""
    logger.info("Starting Trading Engine...")
    try:
        engine = TradingEngine()
        logger.info(f"Trading Engine initialized - Mode: {engine.trading_mode}, Exchange: {engine.active_exchange_id}")
        engine.run()
    except Exception as e:
        logger.error(f"Trading Engine Error: {e}", exc_info=True)

def run_api_server():
    """Run the FastAPI server"""
    logger.info("Starting API Server...")
    try:
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="info"
        )
    except Exception as e:
        logger.error(f"API Server Error: {e}", exc_info=True)

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("🚀 CRYPTO TRADING BOT STARTING")
    logger.info("=" * 60)
    logger.info(f"Exchange: {Config.ACTIVE_EXCHANGE}")
    logger.info(f"Trading Mode: {Config.TRADING_MODE}")
    logger.info(f"Capital Per Trade: {Config.CAPITAL_PER_TRADE_PCT}%")
    logger.info(f"Symbols: {', '.join(Config.SYMBOLS)}")
    logger.info("=" * 60)
    
    # Start trading engine in background thread
    bot_thread = threading.Thread(target=run_trading_engine, daemon=False)
    bot_thread.start()
    
    # Give bot a moment to initialize
    time.sleep(2)
    
    # Run API server on main thread
    run_api_server()
