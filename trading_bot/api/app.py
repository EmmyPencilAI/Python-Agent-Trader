from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
from database.db import DatabaseManager
from config import Config

app = FastAPI()
db = DatabaseManager()

class ToggleRequest(BaseModel):
    action: str

class SettingsRequest(BaseModel):
    mode: Optional[str] = None
    exchange: Optional[str] = None
    paper_balance: Optional[float] = None

def verify_api_key(x_api_key: str):
    if x_api_key != Config.API_SECRET_KEY:
        raise HTTPException(status_code=401, detail="Invalid API Key")

@app.get("/status")
async def get_status():
    state_rows = db.conn.execute("SELECT key, value FROM bot_state").fetchall()
    state = {row[0]: row[1] for row in state_rows}
    
    return {
        "status": state.get('running', 'stopped'),
        "mode": state.get('mode', 'paper'),
        "exchange": state.get('exchange', 'binance'),
        "paper_balance": float(state.get('paper_balance', 1000)),
        "active_strategy": "Scalping"
    }

@app.get("/trades")
async def get_trades(limit: int = 50):
    return db.get_trades(limit)

@app.post("/bot/toggle")
async def toggle_bot(request: ToggleRequest, x_api_key: Optional[str] = Header(None)):
    verify_api_key(x_api_key)
    db.conn.execute("UPDATE bot_state SET value = ? WHERE key = 'running'", (request.action,))
    db.conn.commit()
    return {"success": True, "status": request.action}

@app.post("/bot/settings")
async def update_settings(request: SettingsRequest, x_api_key: Optional[str] = Header(None)):
    verify_api_key(x_api_key)
    if request.mode:
        db.conn.execute("UPDATE bot_state SET value = ? WHERE key = 'mode'", (request.mode,))
    if request.exchange:
        db.conn.execute("UPDATE bot_state SET value = ? WHERE key = 'exchange'", (request.exchange,))
    if request.paper_balance is not None:
        db.conn.execute("UPDATE bot_state SET value = ? WHERE key = 'paper_balance'", (str(request.paper_balance),))
    db.conn.commit()
    return {"success": True}
