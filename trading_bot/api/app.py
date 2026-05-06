from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from trading_bot.database.db import DatabaseManager
from trading_bot.config import Config
import logging

logger = logging.getLogger("API")

app = FastAPI()

# CORS Configuration - Allow frontend to communicate securely
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Frontend URLs only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db = DatabaseManager()

class ToggleRequest(BaseModel):
    action: str

class SettingsRequest(BaseModel):
    mode: Optional[str] = None
    exchange: Optional[str] = None
    paper_balance: Optional[float] = None

class StrategyRequest(BaseModel):
    rsi_period: Optional[int] = None
    ema_short: Optional[int] = None
    ema_long: Optional[int] = None
    macd_fast: Optional[int] = None
    macd_slow: Optional[int] = None

def verify_api_key(x_api_key: str):
    """Verify API key from header"""
    if x_api_key != Config.API_SECRET_KEY:
        logger.warning(f"Unauthorized API access attempt")
        raise HTTPException(status_code=401, detail="Invalid API Key")

@app.get("/status")
async def get_status(x_api_key: Optional[str] = Header(None)):
    """Get bot status - DOES NOT expose sensitive env variables"""
    verify_api_key(x_api_key)
    try:
        state_rows = db.conn.execute("SELECT key, value FROM bot_state").fetchall()
        state = {row[0]: row[1] for row in state_rows}
        
        return {
            "status": state.get('running', 'stopped'),
            "mode": state.get('mode', 'paper'),
            "exchange": state.get('exchange', 'bitget'),
            "paper_balance": float(state.get('paper_balance', 1000)),
            "real_balance": float(state.get('real_balance', 0)),
            "active_strategy": "Scalping"
        }
    except Exception as e:
        logger.error(f"Error getting status: {e}")
        raise HTTPException(status_code=500, detail="Failed to get status")

@app.get("/trades")
async def get_trades(limit: int = 50, x_api_key: Optional[str] = Header(None)):
    """Get recent trades - NO env variables exposed"""
    verify_api_key(x_api_key)
    try:
        trades = db.get_trades(limit)
        return {"trades": trades, "count": len(trades)}
    except Exception as e:
        logger.error(f"Error fetching trades: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch trades")

@app.post("/bot/toggle")
async def toggle_bot(request: ToggleRequest, x_api_key: Optional[str] = Header(None)):
    """Toggle bot on/off"""
    verify_api_key(x_api_key)
    try:
        if request.action not in ['running', 'stopped']:
            raise HTTPException(status_code=400, detail="Invalid action")
        
        db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ('running', request.action))
        db.conn.commit()
        logger.info(f"Bot toggled to: {request.action}")
        return {"success": True, "status": request.action}
    except Exception as e:
        logger.error(f"Error toggling bot: {e}")
        raise HTTPException(status_code=500, detail="Failed to toggle bot")

@app.post("/bot/settings")
async def update_settings(request: SettingsRequest, x_api_key: Optional[str] = Header(None)):
    """Update bot settings"""
    verify_api_key(x_api_key)
    try:
        if request.mode and request.mode in ['paper', 'real']:
            db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ('mode', request.mode))
            logger.info(f"Trading mode changed to: {request.mode}")
        
        if request.exchange and request.exchange in ['binance', 'bitget']:
            db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ('exchange', request.exchange))
            logger.info(f"Exchange changed to: {request.exchange}")
        
        if request.paper_balance is not None and request.paper_balance > 0:
            db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ('paper_balance', str(request.paper_balance)))
            logger.info(f"Paper balance updated to: {request.paper_balance}")
        
        db.conn.commit()
        return {"success": True}
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to update settings")

@app.post("/bot/strategy")
async def update_strategy(request: StrategyRequest, x_api_key: Optional[str] = Header(None)):
    """Update strategy parameters for the bot"""
    verify_api_key(x_api_key)
    try:
        if request.rsi_period is not None:
            db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ('strategy_rsi_period', str(request.rsi_period)))
        if request.ema_short is not None:
            db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ('strategy_ema_short', str(request.ema_short)))
        if request.ema_long is not None:
            db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ('strategy_ema_long', str(request.ema_long)))
        if request.macd_fast is not None:
            db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ('strategy_macd_fast', str(request.macd_fast)))
        if request.macd_slow is not None:
            db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ('strategy_macd_slow', str(request.macd_slow)))

        db.conn.commit()
        return {"success": True}
    except Exception as e:
        logger.error(f"Error updating strategy: {e}")
        raise HTTPException(status_code=500, detail="Failed to update strategy")

@app.get("/config")
async def get_config(x_api_key: Optional[str] = Header(None)):
    """Get non-sensitive config for frontend (NO ENV VARIABLES!)"""
    verify_api_key(x_api_key)
    return {
        "symbols": Config.SYMBOLS,
        "scan_interval": Config.SCAN_INTERVAL,
        "max_daily_loss_pct": Config.MAX_DAILY_LOSS_PCT,
        "max_trades_per_day": Config.MAX_TRADES_PER_DAY,
        "capital_per_trade_pct": Config.CAPITAL_PER_TRADE_PCT
    }
