import sqlite3
import json
from datetime import datetime
from config import Config

class DatabaseManager:
    def __init__(self):
        self.conn = sqlite3.connect(Config.DATABASE_NAME, check_same_thread=False)
        self.create_tables()

    def create_tables(self):
        cursor = self.conn.cursor()
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
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bot_state (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        self.conn.commit()

    def log_trade(self, trade_data):
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO trades (pair, action, entry_price, quantity, status, tp, sl, strategy, exchange)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            trade_data['symbol'], 
            trade_data['action'], 
            trade_data['entry'], 
            trade_data['quantity'], 
            'OPEN', 
            trade_data['tp'], 
            trade_data['sl'],
            trade_data['strategy'],
            trade_data.get('exchange', 'unknown')
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
