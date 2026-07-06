import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import trading_bot.config as config_module
from trading_bot.balance_utils import extract_usdt_balance
from trading_bot.main import TradingEngine


def test_extracts_nested_bitget_balance_from_info_data():
    payload = {
        "info": {
            "data": [
                {"coinName": "USDT", "available": "42.5", "equity": "42.5"}
            ]
        }
    }
    assert extract_usdt_balance(payload) == 42.5


def test_extracts_unified_equity_from_bitget_info():
    payload = {"info": {"totalEquity": "1000.75", "usdtEquity": "1000.75"}}
    assert extract_usdt_balance(payload) == 1000.75


def test_extracts_top_level_usdt_balance():
    payload = {"USDT": {"free": "77.25", "total": "77.25"}}
    assert extract_usdt_balance(payload) == 77.25


def test_engine_uses_configured_real_mode_when_db_mode_is_missing(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setattr(config_module.Config, "DATABASE_NAME", str(db_path))
    monkeypatch.setattr(config_module.Config, "TRADING_MODE", "real")

    engine = TradingEngine()

    assert engine.trading_mode == "real"
    assert engine.paper_balance == 1000.0


def test_engine_prefers_configured_real_mode_over_persisted_paper_state(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setattr(config_module.Config, "DATABASE_NAME", str(db_path))
    monkeypatch.setattr(config_module.Config, "TRADING_MODE", "real")

    engine = TradingEngine()
    engine.db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ("mode", "paper"))
    engine.db.conn.commit()

    engine._sync_state_from_db()

    assert engine.trading_mode == "real"
