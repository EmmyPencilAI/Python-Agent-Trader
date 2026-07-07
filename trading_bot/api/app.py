from fastapi import FastAPI, Header, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import json
import logging
from database.db import DatabaseManager
from config import Config
from exchanges.manager import ExchangeManager
from backtest.backtester import BacktestingEngine
from ai.lstm_gru import AegisAIEngine

# Configure logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AegisAPI")

app = FastAPI(title="Aegis Quantum API", version="2.0")
db = DatabaseManager()
exch_mgr = ExchangeManager(db)
backtest_engine = BacktestingEngine(db)
ai_engine = AegisAIEngine(db)

class ToggleRequest(BaseModel):
    action: str

class SettingsRequest(BaseModel):
    mode: Optional[str] = None
    exchange: Optional[str] = None
    paper_balance: Optional[float] = None
    current_strategy: Optional[str] = None
    max_drawdown: Optional[float] = None
    max_daily_loss: Optional[float] = None
    max_trades_per_day: Optional[int] = None
    pos_size_limit_type: Optional[str] = None
    pos_size_limit_value: Optional[float] = None
    disable_safety_stops: Optional[str] = None

class CredentialsRequest(BaseModel):
    exchange: str
    api_key: str
    api_secret: str
    passphrase: Optional[str] = ""

class BacktestRequest(BaseModel):
    symbol: Optional[str] = "BTC/USDT"
    timeframe: Optional[str] = "1h"
    strategy: Optional[str] = "scalping"
    days: Optional[int] = 30
    initial_capital: Optional[float] = 1000.0

def verify_api_key(x_api_key: str):
    if x_api_key != Config.API_SECRET_KEY:
        raise HTTPException(status_code=401, detail="Invalid API Key")

@app.get("/status")
async def get_status():
    try:
        state_rows = db.conn.execute("SELECT key, value FROM bot_state").fetchall()
        state = {row['key']: row['value'] for row in state_rows}
        
        # Load accuracy metrics
        recent_acc = ai_engine.get_recent_accuracy()
        
        return {
            "status": state.get('running', 'stopped'),
            "mode": state.get('mode', 'paper'),
            "exchange": state.get('active_exchange', 'bitget'),
            "paper_balance": float(state.get('paper_balance', 1000.0)),
            "initial_paper_balance": float(state.get('initial_paper_balance', 1000.0)),
            "real_balance": float(state.get('real_balance', 0.0)),
            "initial_real_balance": float(state.get('initial_real_balance', 0.0)),
            "active_strategy": state.get('current_strategy', 'scalping'),
            
            # Risk limits
            "max_drawdown": float(state.get('max_drawdown', 5.0)),
            "max_daily_loss": float(state.get('max_daily_loss', 5.0)),
            "max_trades_per_day": int(state.get('max_trades_per_day', 100)),
            "pos_size_limit_type": state.get('pos_size_limit_type', 'percentage'),
            "pos_size_limit_value": float(state.get('pos_size_limit_value', 2.0)),
            "disable_safety_stops": state.get('disable_safety_stops', 'false') == 'true',
            
            # AI Model Metrics
            "ai_accuracy": recent_acc,
            "model_version": ai_engine.model_version,
            "is_training": ai_engine.is_running_training()
        }
    except Exception as e:
        logger.error(f"Error fetching status: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/trades")
async def get_trades(limit: int = 50):
    try:
        return db.get_trades(limit)
    except Exception as e:
        return {"error": str(e)}

@app.post("/bot/toggle")
async def toggle_bot(request: ToggleRequest, x_api_key: Optional[str] = Header(None)):
    verify_api_key(x_api_key)
    db.set_bot_state("running", request.action)
    return {"success": True, "status": request.action}

@app.post("/bot/settings")
async def update_settings(request: SettingsRequest, x_api_key: Optional[str] = Header(None)):
    verify_api_key(x_api_key)
    
    if request.mode:
        db.set_bot_state("mode", request.mode)
    if request.exchange:
        db.set_bot_state("active_exchange", request.exchange)
        exch_mgr.switch_exchange(request.exchange)
    if request.paper_balance is not None:
        db.set_bot_state("paper_balance", str(request.paper_balance))
    if request.current_strategy:
        db.set_bot_state("current_strategy", request.current_strategy)
    if request.max_drawdown is not None:
        db.set_bot_state("max_drawdown", str(request.max_drawdown))
    if request.max_daily_loss is not None:
        db.set_bot_state("max_daily_loss", str(request.max_daily_loss))
    if request.max_trades_per_day is not None:
        db.set_bot_state("max_trades_per_day", str(request.max_trades_per_day))
    if request.pos_size_limit_type:
        db.set_bot_state("pos_size_limit_type", request.pos_size_limit_type)
    if request.pos_size_limit_value is not None:
        db.set_bot_state("pos_size_limit_value", str(request.pos_size_limit_value))
    if request.disable_safety_stops:
        db.set_bot_state("disable_safety_stops", request.disable_safety_stops)

    return {"success": True}

@app.post("/bot/credentials")
async def save_credentials(request: CredentialsRequest, x_api_key: Optional[str] = Header(None)):
    verify_api_key(x_api_key)
    success = exch_mgr.save_credentials(
        exchange_id=request.exchange,
        api_key=request.api_key,
        api_secret=request.api_secret,
        passphrase=request.passphrase
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to encrypt and store credentials")
    return {"success": True}

@app.post("/bot/backtest")
async def trigger_backtest(request: BacktestRequest, x_api_key: Optional[str] = Header(None)):
    verify_api_key(x_api_key)
    try:
        report = backtest_engine.run_backtest(
            symbol=request.symbol,
            timeframe=request.timeframe,
            strategy_name=request.strategy,
            days=request.days,
            initial_capital=request.initial_capital
        )
        return {"success": True, "report": report}
    except Exception as e:
        logger.error(f"Backtest API error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/bot/train")
async def trigger_training(background_tasks: BackgroundTasks, x_api_key: Optional[str] = Header(None)):
    verify_api_key(x_api_key)
    try:
        # Load historical candles offline for training
        import pandas as pd
        import ccxt
        client = ccxt.binance()
        ohlcv = client.fetch_ohlcv("BTC/USDT", "1h", limit=500)
        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        
        # Trigger training as background task
        background_tasks.add_task(ai_engine.trigger_background_training, df)
        return {"success": True, "message": "Neural network model self-learning training routine initialized in background thread."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/predictions")
async def get_predictions(limit: int = 50):
    try:
        cursor = db.conn.execute("""
            SELECT * FROM ai_predictions ORDER BY timestamp DESC LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        return {"error": str(e)}

@app.get("/training-logs")
async def get_training_logs(limit: int = 50):
    try:
        cursor = db.conn.execute("""
            SELECT * FROM ml_training_logs ORDER BY timestamp DESC LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        return {"error": str(e)}

@app.get("/logs")
async def get_system_logs(limit: int = 50):
    try:
        cursor = db.conn.execute("""
            SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        return {"error": str(e)}
