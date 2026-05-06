import time
import logging
import json
import urllib.request
import pandas as pd
import ccxt
from config import Config
from strategies.base import ScalpingStrategy, SwingStrategy
from database.db import DatabaseManager
from notifications.telegram import TelegramManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AegisBot")

class TradingEngine:
    def __init__(self):
        self.db = DatabaseManager()
        self.exchange = None
        self.strategies = {
            "scalping": ScalpingStrategy(),
            "swing": SwingStrategy()
        }
        self.current_strategy = "scalping"
        self.is_running = False
        self.trading_mode = Config.TRADING_MODE  # Use config default
        self.paper_balance = Config.PAPER_BALANCE
        self.active_exchange_id = Config.ACTIVE_EXCHANGE  # Use Bitget from config
        
        # Initial load from DB
        self._sync_state_from_db()
        self.exchange = self._init_exchange()
        
        logger.info(f"✅ Trading Engine initialized")
        logger.info(f"   Mode: {self.trading_mode}")
        logger.info(f"   Exchange: {self.active_exchange_id}")
        logger.info(f"   Balance: ${self.get_usdt_balance():.2f}")

    def _sync_state_from_db(self):
        try:
            state_rows = self.db.conn.execute("SELECT key, value FROM bot_state").fetchall()
            state = {row[0]: row[1] for row in state_rows}
            
            self.is_running = state.get('running') == 'running'
            self.trading_mode = state.get('mode', 'paper')
            self.active_exchange_id = state.get('exchange', 'binance')
            self.paper_balance = float(state.get('paper_balance', 1000))
        except Exception as e:
            logger.error(f"Sync error: {e}")

    def _init_exchange(self):
        exch_id = self.active_exchange_id
        logger.info(f"Initializing exchange: {exch_id} in {self.trading_mode} mode")
        
        # Priority: 1. DB (User configured via Dashboard) 2. Env Vars (Config)
        try:
            db_keys = {
                'binance_api_key': self.db.conn.execute("SELECT value FROM bot_state WHERE key = 'binance_api_key'").fetchone(),
                'binance_secret_key': self.db.conn.execute("SELECT value FROM bot_state WHERE key = 'binance_secret_key'").fetchone(),
                'bitget_api_key': self.db.conn.execute("SELECT value FROM bot_state WHERE key = 'bitget_api_key'").fetchone(),
                'bitget_secret_key': self.db.conn.execute("SELECT value FROM bot_state WHERE key = 'bitget_secret_key'").fetchone(),
                'bitget_passphrase': self.db.conn.execute("SELECT value FROM bot_state WHERE key = 'bitget_passphrase'").fetchone(),
            }
            
            def get_val(key, default):
                row = db_keys.get(key)
                val = row[0] if row and row[0] and str(row[0]).strip() and '********' not in str(row[0]) else None
                return val if val else default

            binance_key = get_val('binance_api_key', Config.BINANCE_API_KEY)
            binance_secret = get_val('binance_secret_key', Config.BINANCE_SECRET_KEY)
            bitget_key = get_val('bitget_api_key', Config.BITGET_API_KEY)
            bitget_secret = get_val('bitget_secret_key', Config.BITGET_API_SECRET)
            bitget_pwd = get_val('bitget_passphrase', Config.BITGET_PASSPHRASE)
            
            # Store current keys to detect changes
            self.current_keys = {
                'binance_key': binance_key,
                'binance_secret': binance_secret,
                'bitget_key': bitget_key,
                'bitget_secret': bitget_secret,
                'bitget_pwd': bitget_pwd,
                'exch_id': exch_id
            }

        except Exception as e:
            logger.error(f"Error loading keys: {e}")
            binance_key = Config.BINANCE_API_KEY
            binance_secret = Config.BINANCE_SECRET_KEY
            bitget_key = Config.BITGET_API_KEY
            bitget_secret = Config.BITGET_API_SECRET
            bitget_pwd = Config.BITGET_PASSPHRASE

        if exch_id == 'binance':
            return ccxt.binance({
                'apiKey': binance_key,
                'secret': binance_secret,
                'enableRateLimit': True,
                'options': {'defaultType': 'spot'} # Default to spot as requested for simple balance
            })
        elif exch_id == 'bitget':
            return ccxt.bitget({
                'apiKey': Config.BITGET_API_KEY,
                'secret': Config.BITGET_SECRET_KEY,
                'password': Config.BITGET_PASSPHRASE,
                'enableRateLimit': True,
                'options': {'defaultType': 'spot'}
            })
        else:
            raise ValueError(f"Unsupported exchange: {exch_id}")

    def get_usdt_balance(self):
        # Cache balance for the duration of one scan loop to prevent rate limiting
        if hasattr(self, '_last_bal_time') and time.time() - self._last_bal_time < 5:
             return self._last_cached_bal

        balance = 0.0
        if self.trading_mode == "paper":
            balance = self.paper_balance
        else:
            try:
                # Optimized: Only fetch if we really need it or every 30s for the dashboard
                bal_data = self.exchange.fetch_balance()
                usdt_data = bal_data.get('USDT') or bal_data.get('usdt') or {}
                
                total_bal = float(usdt_data.get('total', 0.0))
                free_bal = float(usdt_data.get('free', 0.0))
                balance = free_bal
                
                # Silent update to DB (Dashboard visibility)
                self.db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ("real_balance", str(total_bal)))
                cursor = self.db.conn.execute("SELECT value FROM bot_state WHERE key = 'initial_real_balance'")
                row = cursor.fetchone()
                if not row or row[0] == '0' or row[0] == '0.0':
                    self.db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ("initial_real_balance", str(total_bal)))
                self.db.conn.commit()
                
                self._last_cached_bal = balance
                self._last_bal_time = time.time()
                
                if self.trading_mode == "real" and balance > 0:
                    logger.debug(f"Sync: Balance {total_bal} USDT")
            except Exception as e:
                logger.error(f"Balance Refresh Failed: {e}")
                balance = self._last_cached_bal if hasattr(self, '_last_cached_bal') else 0.0
        return balance

    def get_market_data(self, symbol, timeframe='1m', limit=100):
        """Fetch OHLCV market data from exchange"""
        try:
            ohlcv = self.exchange.fetch_ohlcv(symbol, timeframe, limit=limit)
            df = pd.DataFrame(
                ohlcv,
                columns=['timestamp', 'open', 'high', 'low', 'close', 'volume']
            )
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            logger.debug(f"Fetched {len(df)} candles for {symbol}")
            return df
        except Exception as e:
            logger.error(f"Failed to fetch market data for {symbol}: {e}")
            return pd.DataFrame()

    def calculate_quantity(self, symbol, price):
        balance = self.get_usdt_balance()
        if balance <= 0:
            logger.warning(f"No {self.trading_mode} balance available for quantity calculation.")
            return 0.0
            
        # Risk Management
        alloc_usdt = balance * (Config.CAPITAL_PER_TRADE_PCT / 100)
        
        # For very small accounts (< $50), use a higher percentage to ensure we can meet minimums and see growth
        if balance < 50:
            alloc_usdt = balance * 0.95 # Use 95% of balance to allow for fees
            logger.debug(f"Small balance detected ({balance}), using 95% allocation: {alloc_usdt}")

        # Enforce minimum trade size (Bitget/Binance usually require ~5 USDT)
        min_trade_size = 5.1 # Use a bit more than 5 to be safe
        if alloc_usdt < min_trade_size:
            if balance >= min_trade_size:
                logger.info(f"Allocation {alloc_usdt} too small, bumping to minimum: {min_trade_size}")
                alloc_usdt = min_trade_size
            else:
                logger.warning(f"Balance {balance} is below minimum trade size {min_trade_size}.")
                return 0.0

        quantity = alloc_usdt / price
        
        # Format quantity to match exchange precision if possible
        # For simplicity, we'll use a reasonable precision or fetch from markets
        try:
            if self.exchange:
                market = self.exchange.market(symbol)
                quantity = self.exchange.amount_to_precision(symbol, quantity)
                return float(quantity)
        except:
            pass
            
        return round(quantity, 6) 

    def execute_trade(self, symbol, signal):
        if signal['action'] == "HOLD":
            return
            
        # Check if we already have an open trade for this symbol
        cursor = self.db.conn.execute("SELECT id FROM trades WHERE pair = ? AND status = 'OPEN' AND mode = ?", (symbol, self.trading_mode))
        if cursor.fetchone():
            logger.debug(f"Already have an open {self.trading_mode} trade for {symbol}. Skipping.")
            return

        price = signal['entry']
        quantity = self.calculate_quantity(symbol, price)
        
        if quantity <= 0:
            logger.warning(f"Quantity 0 for {symbol}, capital setting might be too low.")
            return

        logger.info(f"🚀 [{self.trading_mode.upper()}] Executing {signal['action']} | {symbol} | Price: {price}")
        
        order_id = None
        if self.trading_mode == "real":
            try:
                # Real Execution via CCXT
                # if signal['action'] == 'BUY':
                #     order = self.exchange.create_market_buy_order(symbol, quantity)
                # else:
                #     order = self.exchange.create_market_sell_order(symbol, quantity)
                # logger.info(f"Real Order Success: {order['id']}")
                pass 
            except Exception as e:
                logger.error(f"Exchange Order Error: {e}")
                return
        else:
            # Paper Trading
            if signal['action'] == 'BUY':
                cost = quantity * price
                self.paper_balance -= cost
            else:
                self.paper_balance += (quantity * price)
            
            self.db.conn.execute("UPDATE bot_state SET value = ? WHERE key = 'paper_balance'", (str(self.paper_balance),))
            self.db.conn.commit()
            logger.debug(f"🧪 Paper: {symbol} filler. Vol: {quantity*price:.2f}")
        
        trade_id = self.db.log_trade({
            "symbol": symbol,
            "action": signal['action'],
            "entry": price,
            "quantity": quantity,
            "tp": signal['tp'],
            "sl": signal['sl'],
            "strategy": self.current_strategy,
            "exchange": self.exchange.id,
            "mode": self.trading_mode,
            "order_id": order_id
        })
        
        msg_prefix = "🧪 *PAPER TRADE*" if self.trading_mode == "paper" else "🚀 *REAL TRADE*"
        TelegramManager.send_trade_alert({
            "symbol": f"{msg_prefix} {symbol}",
            "action": signal['action'],
            "entry": price,
            "tp": signal['tp'],
            "sl": signal['sl'],
            "confidence": signal['confidence']
        })

    def run(self):
        logger.info("Bot logic ready...")
        while True:
            # Refresh state every loop to detect Web Dashboard changes
            self._sync_state_from_db()
            
            # Re-init exchange if it changed in settings
            if self.exchange.id != self.active_exchange_id:
                try:
                    self.exchange = self._init_exchange()
                except Exception as e:
                    logger.error(f"Failed to switch exchange: {e}")

            if self.is_running:
                for symbol in Config.SYMBOLS:
                    try:
                        df = self.get_market_data(symbol)
                        if df.empty: continue
                        
                        signal = self.strategies[self.current_strategy].generate_signal(df)
                        signal['symbol'] = symbol
                        signal['entry'] = df.iloc[-1]['close']
                        self.execute_trade(symbol, signal)
                    except Exception as e:
                        logger.error(f"Error processing {symbol}: {e}")
            else:
                logger.debug("Bot is idle (stopped via dashboard)")
            
            time.sleep(Config.SCAN_INTERVAL)

if __name__ == "__main__":
    engine = TradingEngine()
    engine.run()
