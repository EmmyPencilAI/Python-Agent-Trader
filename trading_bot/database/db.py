import sqlite3
import json
from datetime import datetime

try:
    from config import Config
except ModuleNotFoundError:
    from trading_bot.config import Config

class DatabaseManager:
    def __init__(self):
        self.conn = sqlite3.connect(Config.DATABASE_NAME, timeout=30.0, check_same_thread=False)
        try:
            self.conn.execute("PRAGMA journal_mode=WAL")
        except:
            pass
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
                mode TEXT DEFAULT 'paper',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        if 'mode' not in columns:
            try:
                cursor.execute("ALTER TABLE trades ADD COLUMN mode TEXT DEFAULT 'paper'")
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

    def log_trade(self, trade_data):
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO trades (pair, action, entry_price, quantity, status, tp, sl, strategy, exchange, mode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            trade_data.get('mode', 'paper')
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

    def set_bot_state(self, key, value):
        cursor = self.conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", (key, str(value)))
        self.conn.commit()
