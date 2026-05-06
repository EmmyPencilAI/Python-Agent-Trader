import sqlite3
import json
from datetime import datetime
from trading_bot.config import Config

class DatabaseManager:
    def __init__(self):
        self.conn = sqlite3.connect(Config.DATABASE_NAME, check_same_thread=False)
        self.create_tables()

    def create_tables(self):
        cursor = self.conn.cursor()
        # Check if mode column exists, if not add it (for existing DBs)
        cursor.execute("PRAGMA table_info(trades)")
        columns = [col[1] for col in cursor.fetchall()]
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pair TEXT,
                action TEXT,
                entry_price REAL,
                exit_price REAL,
                quantity REAL,
                pnl REAL,
                status TEXT,
                tp REAL,
                sl REAL,
                strategy TEXT,
                exchange TEXT,
                mode TEXT,
                order_id TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        if 'mode' not in columns:
            try:
                cursor.execute("ALTER TABLE trades ADD COLUMN mode TEXT DEFAULT 'paper'")
            except:
                pass
        
        if 'order_id' not in columns:
            try:
                cursor.execute("ALTER TABLE trades ADD COLUMN order_id TEXT")
            except:
                pass
                
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bot_state (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS balance_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mode TEXT,
                balance REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.conn.commit()
        
        # Initialize default bot state if not exists
        self._init_default_state()

    def _init_default_state(self):
        """Initialize default bot state on first run"""
        cursor = self.conn.cursor()
        defaults = {
            'running': 'stopped',
            'mode': 'real',
            'exchange': 'bitget',
            'paper_balance': '1000.0',
            'real_balance': '0.0'
        }
        
        for key, value in defaults.items():
            cursor.execute("INSERT OR IGNORE INTO bot_state (key, value) VALUES (?, ?)", (key, value))
        
        self.conn.commit()

    def log_trade(self, trade_data):
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO trades (pair, action, entry_price, quantity, status, tp, sl, strategy, exchange, mode, order_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            trade_data['symbol'], 
            trade_data['action'], 
            trade_data['entry'], 
            trade_data['quantity'], 
            'OPEN', 
            trade_data['tp'], 
            trade_data['sl'],
            trade_data['strategy'],
            trade_data.get('exchange', 'unknown'),
            trade_data.get('mode', 'paper'),
            trade_data.get('order_id', None)
        ))
        self.conn.commit()
        return cursor.lastrowid

    def update_trade(self, trade_id, exit_price, pnl, status='CLOSED'):
        cursor = self.conn.cursor()
        cursor.execute("""
            UPDATE trades 
            SET exit_price = ?, pnl = ?, status = ?
            WHERE id = ?
        """, (exit_price, pnl, status, trade_id))
        self.conn.commit()

    def get_trades(self, limit=50):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM trades ORDER BY timestamp DESC LIMIT ?", (limit,))
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
