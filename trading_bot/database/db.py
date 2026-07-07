import sqlite3
import json
import os
import time
from datetime import datetime
from config import Config

class DatabaseManager:
    def __init__(self):
        # Establish connection with thread-safe configuration and longer timeout
        self.db_path = Config.DATABASE_NAME
        self.conn = sqlite3.connect(self.db_path, timeout=60.0, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        
        # Enforce WAL mode and Foreign Keys
        try:
            self.conn.execute("PRAGMA journal_mode=WAL")
            self.conn.execute("PRAGMA foreign_keys=ON")
        except Exception as e:
            print(f"[DB] Error setting pragmas: {e}")
            
        self.create_tables()

    def execute_with_retry(self, query, params=(), max_retries=5, delay=0.5, commit=True):
        """Execute a query with retry logic on database lock / busy errors."""
        last_error = None
        for attempt in range(max_retries):
            try:
                cursor = self.conn.cursor()
                cursor.execute(query, params)
                if commit:
                    self.conn.commit()
                return cursor
            except sqlite3.OperationalError as e:
                last_error = e
                if "locked" in str(e).lower() or "busy" in str(e).lower():
                    time.sleep(delay * (2 ** attempt))  # Exponential backoff
                else:
                    raise e
        raise last_error

    def create_tables(self):
        cursor = self.conn.cursor()
        
        # Table 1: exchanges
        self.execute_with_retry("""
            CREATE TABLE IF NOT EXISTS exchanges (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'inactive',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Table 2: exchange_credentials
        self.execute_with_retry("""
            CREATE TABLE IF NOT EXISTS exchange_credentials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exchange_id TEXT NOT NULL,
                api_key TEXT NOT NULL,
                api_secret TEXT NOT NULL,
                passphrase TEXT,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (exchange_id) REFERENCES exchanges(id) ON DELETE CASCADE
            )
        """)

        # Table 3: trades (fully unified for dual python/node dashboard compatibility)
        self.execute_with_retry("""
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pair TEXT,
                symbol TEXT,
                action TEXT,
                side TEXT,
                entry_price REAL NOT NULL,
                exit_price REAL,
                quantity REAL NOT NULL,
                pnl REAL DEFAULT 0.0,
                profit REAL DEFAULT 0.0,
                roi REAL DEFAULT 0.0,
                fee REAL DEFAULT 0.0,
                status TEXT DEFAULT 'OPEN',
                tp REAL DEFAULT 0.0,
                sl REAL DEFAULT 0.0,
                strategy TEXT,
                exchange TEXT,
                exchange_id TEXT,
                mode TEXT DEFAULT 'paper',
                ai_score REAL DEFAULT 0.0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Index on trades for fast querying
        self.execute_with_retry("CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades (symbol)")
        self.execute_with_retry("CREATE INDEX IF NOT EXISTS idx_trades_pair ON trades (pair)")
        self.execute_with_retry("CREATE INDEX IF NOT EXISTS idx_trades_exchange ON trades (exchange_id)")
        self.execute_with_retry("CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades (timestamp)")

        # Table 4: ai_predictions
        self.execute_with_retry("""
            CREATE TABLE IF NOT EXISTS ai_predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                prediction_type TEXT NOT NULL, -- 'trend', 'momentum', 'volatility'
                predicted_direction TEXT NOT NULL, -- 'UP', 'DOWN', 'NEUTRAL'
                confidence_score REAL NOT NULL, -- 0 to 100
                actual_result TEXT,
                error_margin REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Table 5: ml_training_logs
        self.execute_with_retry("""
            CREATE TABLE IF NOT EXISTS ml_training_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_version TEXT NOT NULL,
                epoch INTEGER NOT NULL,
                loss REAL NOT NULL,
                val_loss REAL NOT NULL,
                accuracy REAL NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Table 6: bot_state (key/value with compatibility for dashboard and engine)
        self.execute_with_retry("""
            CREATE TABLE IF NOT EXISTS bot_state (
                key TEXT PRIMARY KEY,
                value TEXT,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Table 7: logs
        self.execute_with_retry("""
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                level TEXT NOT NULL,
                module TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Table 8: balance_history (historical equity curves)
        self.execute_with_retry("""
            CREATE TABLE IF NOT EXISTS balance_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mode TEXT,
                balance REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Seed initial exchange records if not exist
        exchanges = [
            ('bitget', 'Bitget', 'active'),
            ('binance', 'Binance', 'inactive'),
            ('bybit', 'Bybit', 'inactive'),
            ('okx', 'OKX', 'inactive'),
            ('mexc', 'MEXC', 'inactive')
        ]
        for exch_id, exch_name, exch_status in exchanges:
            self.execute_with_retry("""
                INSERT OR IGNORE INTO exchanges (id, name, status) 
                VALUES (?, ?, ?)
            """, (exch_id, exch_name, exch_status))

        # Seed initial bot state values if missing
        default_states = [
            ('running', 'stopped'),
            ('mode', 'paper'),
            ('active_exchange', 'bitget'),
            ('paper_balance', '1000.0'),
            ('initial_paper_balance', '1000.0'),
            ('activated', 'false'),
            ('max_drawdown', '5.0'),
            ('pos_size_limit_type', 'percentage'),
            ('pos_size_limit_value', '2.0'),
            ('max_daily_loss', '5.0'),
            ('max_trades_per_day', '100'),
            ('disable_safety_stops', 'false')
        ]
        for key, val in default_states:
            self.execute_with_retry("""
                INSERT OR IGNORE INTO bot_state (key, value)
                VALUES (?, ?)
            """, (key, val))

    def log_trade(self, trade_data):
        """Log a new trade into the trades table (supports backward and new format)."""
        # Map fields for flexibility
        symbol = trade_data.get('symbol') or trade_data.get('pair', 'BTC/USDT')
        side = trade_data.get('side') or trade_data.get('action', 'buy')
        # Standardize side to lowercase 'buy' or 'sell'
        side = side.lower()
        if 'buy' in side:
            side = 'buy'
        elif 'sell' in side:
            side = 'sell'
            
        entry_price = float(trade_data.get('entry') or trade_data.get('entry_price', 0.0))
        quantity = float(trade_data.get('quantity', 0.05))
        tp = float(trade_data.get('tp', 0.0))
        sl = float(trade_data.get('sl', 0.0))
        strategy = trade_data.get('strategy', 'scalping')
        exchange_id = trade_data.get('exchange') or trade_data.get('exchange_id', 'bitget')
        mode = trade_data.get('mode', 'paper')
        ai_score = float(trade_data.get('ai_score', 0.0))
        fee = float(trade_data.get('fee', 0.0))

        cursor = self.execute_with_retry("""
            INSERT INTO trades (
                exchange_id, exchange, symbol, pair, side, action, 
                entry_price, quantity, fee, strategy, ai_score, status, mode, tp, sl
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (exchange_id, exchange_id, symbol, symbol, side, side.upper(), entry_price, quantity, fee, strategy, ai_score, 'OPEN', mode, tp, sl))
        
        return cursor.lastrowid

    def update_trade(self, trade_id, exit_price, pnl, status='CLOSED', fee=0.0):
        """Update an existing trade with exit price, PnL, status and calculate ROI."""
        # Retrieve the entry price to calculate ROI
        cursor = self.execute_with_retry("SELECT entry_price, quantity FROM trades WHERE id = ?", (trade_id,), commit=False)
        row = cursor.fetchone()
        roi = 0.0
        if row:
            entry = row['entry_price']
            if entry > 0:
                roi = ((exit_price - entry) / entry) * 100.0
                # Correct sign based on side if needed, let's assume PnL is signed
                # PnL = quantity * (exit - entry) for buy
        
        self.execute_with_retry("""
            UPDATE trades 
            SET exit_price = ?, profit = ?, pnl = ?, roi = ?, status = ?, fee = fee + ?
            WHERE id = ?
        """, (exit_price, pnl, pnl, roi, status, fee, trade_id))

    def get_trades(self, limit=50):
        """Retrieve trades ordered by timestamp."""
        cursor = self.execute_with_retry("SELECT * FROM trades ORDER BY timestamp DESC LIMIT ?", (limit,), commit=False)
        return [dict(row) for row in cursor.fetchall()]

    def set_bot_state(self, key, value):
        """Set a bot configuration state."""
        self.execute_with_retry("""
            INSERT OR REPLACE INTO bot_state (key, value, last_updated) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
        """, (key, str(value)))

    def get_bot_state(self, key, default=None):
        """Get a bot configuration state."""
        cursor = self.execute_with_retry("SELECT value FROM bot_state WHERE key = ?", (key,), commit=False)
        row = cursor.fetchone()
        return row['value'] if row else default

    def log_system_event(self, level, module, message):
        """Log a system message to the SQLite log table."""
        self.execute_with_retry("""
            INSERT INTO logs (level, module, message)
            VALUES (?, ?, ?)
        """, (level.upper(), module, message))

    def log_ai_prediction(self, symbol, pred_type, direction, confidence, actual=None, error=None):
        """Log an AI prediction for self-learning analysis."""
        self.execute_with_retry("""
            INSERT INTO ai_predictions (symbol, prediction_type, predicted_direction, confidence_score, actual_result, error_margin)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (symbol, pred_type, direction, confidence, actual, error))

    def log_ml_training(self, version, epoch, loss, val_loss, accuracy):
        """Log a training epoch metrics of machine learning model."""
        self.execute_with_retry("""
            INSERT INTO ml_training_logs (model_version, epoch, loss, val_loss, accuracy)
            VALUES (?, ?, ?, ?, ?)
        """, (version, epoch, loss, val_loss, accuracy))
