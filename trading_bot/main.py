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
        self.trading_mode = "paper" # Default
        self.paper_balance = 1000.0
        self.active_exchange_id = "binance"
        
        # Initial load from DB
        self._sync_state_from_db()
        self.exchange = self._init_exchange()

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
                val = row[0] if row and row[0] else None
                return val if val else default

            binance_key = get_val('binance_api_key', Config.BINANCE_API_KEY)
            binance_secret = get_val('binance_secret_key', Config.BINANCE_SECRET_KEY)
            bitget_key = get_val('bitget_api_key', Config.BITGET_API_KEY)
            bitget_secret = get_val('bitget_secret_key', Config.BITGET_SECRET_KEY)
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
            bitget_secret = Config.BITGET_SECRET_KEY
            bitget_pwd = Config.BITGET_PASSPHRASE

        if exch_id == 'binance':
            return ccxt.binance({
                'apiKey': binance_key,
                'secret': binance_secret,
                'enableRateLimit': True,
                'options': {'defaultType': 'future'} # Default to futures for binance if available, or spot
            })
        elif exch_id == 'bitget':
            return ccxt.bitget({
                'apiKey': bitget_key,
                'secret': bitget_secret,
                'password': bitget_pwd,
                'enableRateLimit': True,
                'options': {'defaultType': 'spot'}
            })
        else:
            raise ValueError(f"Unsupported exchange: {exch_id}")

    def get_usdt_balance(self):
        balance = 0.0
        if self.trading_mode == "paper":
            balance = self.paper_balance
        else:
            try:
                bal_data = self.exchange.fetch_balance()
                # Debug log the keys to troubleshoot Bitget structure
                logger.debug(f"Balance keys: {list(bal_data.keys())}")
                
                # CCXT usually normalizes to 'USDT', but we check just in case
                usdt_data = bal_data.get('USDT') or bal_data.get('usdt') or {}
                
                # Check total, free, or just the value if it's a simple float (though CCXT uses a dict)
                balance = float(usdt_data.get('total', usdt_data.get('free', 0.0)))
                
                logger.info(f"Fetched real {self.exchange.id} balance: {balance} USDT")
                
                # Sync real balance back to DB for Dashboard visibility
                self.db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ("real_balance", str(balance)))
                # Set initial if it is 0
                cursor = self.db.conn.execute("SELECT value FROM bot_state WHERE key = 'initial_real_balance'")
                row = cursor.fetchone()
                if not row or row[0] == '0' or row[0] == '0.0':
                    self.db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ("initial_real_balance", str(balance)))
                self.db.conn.commit()
            except Exception as e:
                logger.error(f"Error fetching balance from {self.exchange.id}: {e}")
                balance = 0.0
        return balance

    def calculate_quantity(self, symbol, price):
        balance = self.get_usdt_balance()
        if balance <= 0:
            logger.warning(f"No {self.trading_mode} balance available for quantity calculation.")
            return 0.0
            
        alloc_usdt = balance * (Config.CAPITAL_PER_TRADE_PCT / 100)
        quantity = alloc_usdt / price
        return quantity 

    def execute_trade(self, symbol, signal):
        if signal['action'] == "HOLD":
            return
            
        price = signal['entry']
        quantity = self.calculate_quantity(symbol, price)
        
        if quantity <= 0:
            logger.warning(f"Quantity 0 for {symbol}, capital setting might be too low.")
            return

        logger.info(f"🚀 [{self.trading_mode.upper()}] Executing {signal['action']} | {symbol} | Price: {price} | Qty: {quantity}")
        
        if self.trading_mode == "real":
            try:
                # Real Execution via CCXT
                if signal['action'] == 'BUY':
                    order = self.exchange.create_market_buy_order(symbol, quantity)
                else:
                    order = self.exchange.create_market_sell_order(symbol, quantity)
                logger.info(f"✅ Real Order Success: {order['id']}")
            except Exception as e:
                logger.error(f"❌ Exchange Order Error: {e}")
                return
        else:
            # Paper Trading: Deduct from virtual balance
            if signal['action'] == 'BUY':
                cost = quantity * price
                self.paper_balance -= cost
            else:
                credit = quantity * price
                self.paper_balance += credit
            
            # Update DB for paper balance persistence
            self.db.conn.execute("UPDATE bot_state SET value = ? WHERE key = 'paper_balance'", (str(self.paper_balance),))
            self.db.conn.commit()
            logger.info(f"🧪 Paper Executed. New virtual balance: {self.paper_balance}")
        
        trade_id = self.db.log_trade({
            "symbol": symbol,
            "action": signal['action'],
            "entry": price,
            "quantity": quantity,
            "tp": signal['tp'],
            "sl": signal['sl'],
            "strategy": self.current_strategy,
            "exchange": self.exchange.id,
            "mode": self.trading_mode
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

    def get_market_data(self, symbol):
        try:
            # Fetch OHLCV data (1h timeframe, 100 limit)
            ohlcv = self.exchange.fetch_ohlcv(symbol, timeframe='1h', limit=100)
            df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            return df
        except Exception as e:
            logger.error(f"Error fetching market data for {symbol}: {e}")
            # Special handling for restricted locations (451 error) in Paper Trading
            if self.trading_mode == 'paper' and ('451' in str(e) or 'Eligibility' in str(e)):
                try:
                    price = self.get_fallback_price(symbol)
                    if price:
                        logger.info(f"Using fallback price for {symbol}: {price}")
                        # Create dummy OHLCV for strategy compatibility
                        now = pd.Timestamp.now()
                        data = {
                            'timestamp': [now],
                            'open': [price], 'high': [price], 'low': [price], 'close': [price], 'volume': [0]
                        }
                        return pd.DataFrame(data)
                except Exception as fe:
                    logger.error(f"Fallback market data failed: {fe}")
            return pd.DataFrame()

    def get_fallback_price(self, symbol):
        try:
            # Map symbol to coingecko id
            mapping = {
                "BTCUSDT": "bitcoin",
                "ETHUSDT": "ethereum",
                "BNBUSDT": "binancecoin",
                "SOLUSDT": "solana",
                "ADAUSDT": "cardano"
            }
            # Handle both formats symbol/usdt or symbolusdt
            clean_symbol = symbol.replace('/', '').upper()
            cg_id = mapping.get(clean_symbol)
            
            if not cg_id:
                cg_id = clean_symbol.replace('USDT', '').lower()

            url = f"https://api.coingecko.com/api/v3/simple/price?ids={cg_id}&vs_currencies=usd"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                return float(data[cg_id]['usd'])
        except Exception as e:
            logger.error(f"Could not fetch fallback price: {e}")
            return None

    def check_balance_thresholds(self, balance):
        if self.trading_mode != "real":
            return
            
        thresholds = [1000, 2000, 5000, 10000, 25000, 50000, 100000]
        try:
            last_notified_row = self.db.conn.execute("SELECT value FROM bot_state WHERE key = 'last_notified_threshold'").fetchone()
            last_notified = float(last_notified_row[0]) if last_notified_row else 0.0
            
            for t in thresholds:
                if balance >= t > last_notified:
                    msg = f"🎊 *MILESTONE REACHED*\n\nReal account balance has surpassed *${t:,.2f}*!\n\n*Current Balance:* ${balance:,.2f}"
                    TelegramManager.send_message(msg)
                    self.db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ("last_notified_threshold", str(t)))
                    self.db.conn.commit()
                    break
        except Exception as e:
            logger.error(f"Error checking balance thresholds: {e}")

    def run(self):
        logger.info("Bot logic ready...")
        last_balance_record = 0
        last_threshold_check = 0
        
        while True:
            # Refresh state every loop to detect Web Dashboard changes
            self._sync_state_from_db()
            
            # Re-init exchange if it changed in settings (id or keys)
            keys_changed = False
            try:
                binance_key = self.db.conn.execute("SELECT value FROM bot_state WHERE key = 'binance_api_key'").fetchone()
                binance_secret = self.db.conn.execute("SELECT value FROM bot_state WHERE key = 'binance_secret_key'").fetchone()
                bitget_key = self.db.conn.execute("SELECT value FROM bot_state WHERE key = 'bitget_api_key'").fetchone()
                bitget_secret = self.db.conn.execute("SELECT value FROM bot_state WHERE key = 'bitget_secret_key'").fetchone()
                bitget_pwd = self.db.conn.execute("SELECT value FROM bot_state WHERE key = 'bitget_passphrase'").fetchone()

                b_k = binance_key[0] if binance_key else Config.BINANCE_API_KEY
                b_s = binance_secret[0] if binance_secret else Config.BINANCE_SECRET_KEY
                bg_k = bitget_key[0] if bitget_key else Config.BITGET_API_KEY
                bg_s = bitget_secret[0] if bitget_secret else Config.BITGET_SECRET_KEY
                bg_p = bitget_pwd[0] if bitget_pwd else Config.BITGET_PASSPHRASE

                if (b_k != self.current_keys.get('binance_key') or 
                    b_s != self.current_keys.get('binance_secret') or
                    bg_k != self.current_keys.get('bitget_key') or
                    bg_s != self.current_keys.get('bitget_secret') or
                    bg_p != self.current_keys.get('bitget_pwd') or
                    self.active_exchange_id != self.current_keys.get('exch_id')):
                    keys_changed = True
            except:
                pass

            if not self.exchange or keys_changed:
                try:
                    self.exchange = self._init_exchange()
                except Exception as e:
                    logger.error(f"Failed to initialize/switch exchange: {e}")
                    time.sleep(10)
                    continue

            # Always sync balance to DB every loop if in real mode 
            # (Dashboard expects this)
            if self.trading_mode == "real":
                current_bal = self.get_usdt_balance()
                
                # Check thresholds
                if time.time() - last_threshold_check > Config.SCAN_INTERVAL:
                    self.check_balance_thresholds(current_bal)
                    last_threshold_check = time.time()

            if self.is_running:
                # Periodic balance history recording (every ~10 scans)
                if time.time() - last_balance_record > (Config.SCAN_INTERVAL * 10):
                    bal_to_record = self.get_usdt_balance()
                    self.db.conn.execute("INSERT INTO balance_history (mode, balance) VALUES (?, ?)", (self.trading_mode, bal_to_record))
                    self.db.conn.commit()
                    last_balance_record = time.time()

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
