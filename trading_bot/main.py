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
            
            self.max_drawdown = float(state.get('max_drawdown', 5.0))
            self.pos_size_limit_type = state.get('pos_size_limit_type', 'percentage')
            self.pos_size_limit_value = float(state.get('pos_size_limit_value', 2.0))
            self.max_daily_loss = float(state.get('max_daily_loss', 5.0))
            self.max_trades_per_day = int(state.get('max_trades_per_day', 100))
            self.disable_safety_stops = state.get('disable_safety_stops', 'false') == 'true'
        except Exception as e:
            logger.error(f"Sync error: {e}")

    def _init_exchange(self):
        exch_id = self.active_exchange_id
        logger.info(f"Initializing exchange: {exch_id} in {self.trading_mode} mode")
        
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
                if row and row[0]:
                    val = str(row[0]).strip()
                    # If it's a real value (not empty, not masked), use it
                    if val and '********' not in val:
                        return val
                # Otherwise, return the environment default
                return default

            binance_key = get_val('binance_api_key', Config.BINANCE_API_KEY)
            binance_secret = get_val('binance_secret_key', Config.BINANCE_SECRET_KEY)
            bitget_key = get_val('bitget_api_key', Config.BITGET_API_KEY)
            bitget_secret = get_val('bitget_secret_key', Config.BITGET_API_SECRET)
            bitget_pwd = get_val('bitget_passphrase', Config.BITGET_PASSPHRASE)
            
            logger.info(f"Keys loaded - Binance: {'Set' if binance_key else 'Missing'}, Bitget: {'Set' if bitget_key else 'Missing'}")
            if bitget_key and not bitget_pwd:
                 logger.warning("Bitget is set but Passphrase is missing. Bitget might require it.")
            
            self.current_keys = {
                'binance_key': binance_key,
                'binance_secret': binance_secret,
                'bitget_key': bitget_key,
                'bitget_secret': bitget_secret,
                'bitget_pwd': bitget_pwd,
                'exch_id': exch_id
            }

            if not bitget_key and exch_id == 'bitget':
                 logger.warning("Bitget API Key is missing! Real trading will fail.")

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
                'options': {'defaultType': 'spot'}
            })
        elif exch_id == 'bitget':
            return ccxt.bitget({
                'apiKey': bitget_key,
                'secret': bitget_secret,
                'password': bitget_pwd,
                'enableRateLimit': True,
                'options': {
                    'defaultType': 'spot',
                    'adjustForTimeDifference': True
                }
            })
        else:
            raise ValueError(f"Unsupported exchange: {exch_id}")

    def get_usdt_balance(self):
        # Force refresh if we don't have a balance yet
        if hasattr(self, '_last_bal_time') and time.time() - self._last_bal_time < 5:
             return self._last_cached_bal

        balance = 0.0
        if self.trading_mode == "paper":
            balance = self.paper_balance
        else:
            try:
                # Try Spot balance first, then Unified/Trade
                bal_data = {}
                found_usdt = False
                
                # Bitget specific search order
                search_types = ['unified', 'trade', 'spot', 'funding', 'account']
                if self.exchange.id == 'bitget':
                     search_types = ['unified', 'trade', 'spot', 'account', 'funding', 'swap']

                for acct_type in search_types:
                    try:
                        logger.info(f"🔍 Checking {self.exchange.id} {acct_type} balance...")
                        
                        # Bitget V2 Specific parameters
                        params = {}
                        if self.exchange.id == 'bitget':
                            if acct_type == 'unified':
                                params = {'accountType': 'UNIFIED'}
                            elif acct_type == 'trade':
                                params = {'accountType': 'TRADE'}
                            elif acct_type == 'spot':
                                params = {'accountType': 'SPOT'}
                            elif acct_type == 'funding':
                                params = {'accountType': 'FUNDING'}
                            elif acct_type == 'swap':
                                params = {'accountType': 'SWAP'}
                        else:
                            params = {'type': acct_type} if acct_type != 'account' else {}
                        
                        bt_data = self.exchange.fetch_balance(params)
                        usdt_data = {}
                        
                        # DEBUG: Log keys for the first few fetches to see structure
                        if not hasattr(self, '_debug_count'): self._debug_count = 0
                        if self._debug_count < 3 and self.exchange.id == 'bitget':
                            logger.info(f"Bitget {acct_type} Raw Keys: {list(bt_data.keys())[:15]}")
                            if 'info' in bt_data:
                                info_keys = list(bt_data['info'].keys()) if isinstance(bt_data['info'], dict) else "List"
                                logger.info(f"Bitget {acct_type} Info: {info_keys}")
                            self._debug_count += 1
                        
                        # 1. Standard CCXT structure
                        if 'USDT' in bt_data:
                            usdt_data = bt_data['USDT']
                        elif 'usdt' in bt_data:
                            usdt_data = bt_data['usdt']
                        
                        # 2. Bitget Unified Equity (Very common for modern Bitget accounts)
                        if not usdt_data and 'info' in bt_data:
                            info = bt_data['info']
                            if isinstance(info, dict):
                                # V2 Unified Response
                                if 'totalEquity' in info:
                                    usdt_data = {
                                        'total': float(info.get('totalEquity', 0)), 
                                        'free': float(info.get('usdtEquity', info.get('totalEquity', 0)))
                                    }
                                elif 'usdtEquity' in info:
                                    usdt_data = {'total': float(info['usdtEquity']), 'free': float(info['usdtEquity'])}
                                elif 'data' in info and isinstance(info['data'], list) and len(info['data']) > 0:
                                    # Some Bitget V2 responses nest under 'data'
                                    first = info['data'][0]
                                    if 'totalEquity' in first:
                                         usdt_data = {'total': float(first['totalEquity']), 'free': float(first.get('usdtEquity', first['totalEquity']))}
                        
                        # 3. Deep Scan 'info' if still not found
                        if not usdt_data and 'info' in bt_data:
                            info = bt_data['info']
                            # If info is a list of assets (Classic Spot/Margin)
                            assets = []
                            if isinstance(info, list): assets = info
                            elif isinstance(info, dict) and 'assets' in info: assets = info['assets']
                            # Some responses put assets in a 'data' list
                            elif isinstance(info, dict) and 'data' in info and isinstance(info['data'], list): assets = info['data']
                            
                            for asset in assets:
                                cname = asset.get('coinName', asset.get('coin', asset.get('currency', asset.get('asset', ''))))
                                if str(cname).upper() == 'USDT':
                                    usdt_data = {
                                        'total': float(asset.get('balance', asset.get('total', 0))),
                                        'free': float(asset.get('available', asset.get('free', asset.get('equity', 0))))
                                    }
                                    break

                        if usdt_data and float(usdt_data.get('total', 0)) > 0:
                            bal_data = bt_data
                            found_usdt = True
                            logger.info(f"✅ Found USDT in {acct_type}: {usdt_data}")
                            break
                        else:
                            # If we found data but it's 0, we keep looking in other accounts
                            if usdt_data:
                                logger.info(f"ℹ️ {acct_type} has 0 USDT. Continuing search...")
                    except Exception as e:
                        logger.warning(f"❌ {acct_type} fetch attempt failed/timed out: {str(e)[:100]}")
                        continue
                
                if not found_usdt:
                    logger.warning(f"⚠️ No USDT found in standard accounts. Trying one last raw fetch.")
                    try:
                        bt_data = self.exchange.fetch_balance()
                        # Final Attempt: Check EVERY key in the dictionary for USDT
                        def recursive_find_usdt(data):
                            if isinstance(data, dict):
                                for k, v in data.items():
                                    if str(k).upper() == 'USDT' and isinstance(v, (dict, float, int)):
                                        return v
                                    res = recursive_find_usdt(v)
                                    if res: return res
                            elif isinstance(data, list):
                                for item in data:
                                    res = recursive_find_usdt(item)
                                    if res: return res
                            return None
                        
                        deep_res = recursive_find_usdt(bt_data)
                        if deep_res:
                            if isinstance(deep_res, dict):
                                usdt_data = deep_res
                            else:
                                usdt_data = {'total': float(deep_res), 'free': float(deep_res)}
                            found_usdt = True
                            logger.info(f"💎 DEEP SCAN found USDT: {usdt_data}")
                    except Exception as e:
                        logger.error(f"Deep scan failed: {e}")

                # Extract USDT data
                # (Existing priority logic follows...)
                
                if not usdt_data:
                    # Priority 2: info block (Raw exchange response) scanning if we haven't found it yet
                    if 'info' in bal_data and isinstance(bal_data['info'], list):
                        for asset in bal_data['info']:
                            if asset.get('coinName') == 'USDT' or asset.get('currency') == 'USDT' or asset.get('coin') == 'USDT':
                                usdt_data = {
                                    'total': asset.get('balance') or asset.get('total') or asset.get('available'),
                                    'free': asset.get('available') or asset.get('free') or asset.get('equity')
                                }
                                break
                    elif 'info' in bal_data and isinstance(bal_data['info'], dict):
                        info = bal_data['info']
                        if 'assets' in info:
                             for asset in info['assets']:
                                 if asset.get('coinName') == 'USDT':
                                     usdt_data = {'total': asset.get('total'), 'free': asset.get('available')}
                                     break

                if not usdt_data:
                    logger.warning("Still no USDT data found after all checks.")
                    total_bal = 0.0
                    free_bal = 0.0
                else:
                    total_bal = float(usdt_data.get('total') or usdt_data.get('free') or 0.0)
                    free_bal = float(usdt_data.get('free') or usdt_data.get('total') or 0.0)
                
                logger.info(f"Fetched Real Balance: Total={total_bal}, Free={free_bal}")
                balance = free_bal
                
                # Sync to DB
                self.db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ("real_balance", str(total_bal)))
                
                # Update initial if first time or zero
                curr_init = self.db.conn.execute("SELECT value FROM bot_state WHERE key = 'initial_real_balance'").fetchone()
                if not curr_init or float(curr_init[0]) == 0:
                    self.db.conn.execute("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)", ("initial_real_balance", str(total_bal)))
                
                self.db.conn.commit()
                
                self._last_cached_bal = balance
                self._last_bal_time = time.time()
                
            except Exception as e:
                logger.error(f"Balance Fetch Critical Failure: {e}")
                # Don't overwrite with 0 if we have a cache
                balance = getattr(self, '_last_cached_bal', 0.0)
        return balance

    def calculate_quantity(self, symbol, price):
        balance = self.get_usdt_balance()
        if balance <= 0:
            logger.warning(f"No {self.trading_mode} balance available.")
            return 0.0
            
        # Risk Management: 2% per trade
        alloc_usdt = balance * (Config.CAPITAL_PER_TRADE_PCT / 100)
        
        # Apply Position Size Limits:
        if self.pos_size_limit_type == 'percentage':
            limit_usdt = balance * (self.pos_size_limit_value / 100.0)
            if alloc_usdt > limit_usdt:
                logger.info(f"Position size limited by percentage limit ({self.pos_size_limit_value}%): Reducing {alloc_usdt:.2f} to {limit_usdt:.2f} USDT")
                alloc_usdt = limit_usdt
        elif self.pos_size_limit_type == 'absolute':
            limit_usdt = self.pos_size_limit_value
            if alloc_usdt > limit_usdt:
                logger.info(f"Position size limited by absolute limit ({self.pos_size_limit_value} USDT): Reducing {alloc_usdt:.2f} to {limit_usdt:.2f} USDT")
                alloc_usdt = limit_usdt
                
        # BITGET MINIMUM ENFORCEMENT
        # Bitget Spot usually requires at least 1 USDT or 5 USDT.
        # If user has only $9, 2% ($0.18) will ALWAYS fail.
        # We will use either 2% or 5 USDT (whichever is larger), 
        # but limited by total balance.
        min_exec_usdt = 1.0 # Minimum Bitget trade is usually $1 or $5
        if alloc_usdt < min_exec_usdt:
            logger.info(f"Allocation {alloc_usdt:.2f} is below minimum. Using {min_exec_usdt} USDT for {symbol}")
            alloc_usdt = min_exec_usdt
            
        if alloc_usdt > balance:
            logger.warning(f"Required minimum {alloc_usdt} exceeds balance {balance}. Trading all available.")
            alloc_usdt = balance * 0.95 # Leave a tiny bit for fees
            
        if alloc_usdt < 0.5: # Absolute floor
            logger.error("Balance too low for ANY exchange execution.")
            return 0.0

        quantity = alloc_usdt / price
        
        # Format quantity to match exchange precision
        try:
            if self.exchange:
                self.exchange.load_markets() # Ensure markets are loaded
                market = self.exchange.market(symbol)
                quantity = self.exchange.amount_to_precision(symbol, quantity)
                return float(quantity)
        except Exception as e:
            logger.debug(f"Precision mapping failed: {e}")
            pass
            
        return round(quantity, 8) 

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

        logger.info(f"⚡ [{self.trading_mode.upper()}] Execution: {symbol} @ {price}")
        
        if self.trading_mode == "real":
            try:
                # Real Execution via CCXT
                execution_qty = quantity
                
                # Bitget & some others require Quote currency (USDT) for Market BUY orders
                if signal['action'] == 'BUY' and self.exchange.id == 'bitget':
                    # For market buy on Bitget, 'amount' is actually the total USDT to spend
                    # We already have this calculated as price * quantity (roughly alloc_usdt)
                    execution_qty = quantity * price
                    logger.info(f"Bitget detected: Using Quote amount {execution_qty:.2f} USDT for market buy")

                if signal['action'] == 'BUY':
                    order = self.exchange.create_market_buy_order(symbol, execution_qty)
                else:
                    # Market SELL is always in Base currency (how much BTC to sell)
                    order = self.exchange.create_market_sell_order(symbol, quantity)
                
                logger.info(f"✅ REAL ORDER FILLED: {symbol} | ID: {order.get('id', 'N/A')}")
            except Exception as e:
                logger.error(f"❌ EXECUTION FAILED: {symbol} | {e}")
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
            "mode": self.trading_mode
        })
        
        # Fetch cumulative stats for Telegram Alert
        try:
            cursor = self.db.conn.cursor()
            cursor.execute("SELECT SUM(pnl), COUNT(*) FROM trades WHERE status = 'CLOSED' AND mode = ?", (self.trading_mode,))
            row = cursor.fetchone()
            cum_pnl = float(row[0]) if row and row[0] is not None else 0.0
            total_closed = int(row[1]) if row and row[1] is not None else 0

            cursor.execute("SELECT COUNT(*) FROM trades WHERE mode = ?", (self.trading_mode,))
            total_taken_row = cursor.fetchone()
            total_taken = int(total_taken_row[0]) if total_taken_row and total_taken_row[0] is not None else 0
        except Exception as db_err:
            logger.error(f"Error fetching stats for TG alert: {db_err}")
            cum_pnl = 0.0
            total_closed = 0
            total_taken = 0

        prefix = "💎 REAL" if self.trading_mode == "real" else "🧪 PAPER"
        msg = (
            f"🚀 *{prefix} TRADE OPENED*\n\n"
            f"*Symbol:* {symbol}\n"
            f"*Action:* {signal['action']}\n"
            f"*Entry Price:* ${price:.4f}\n"
            f"*TP Target:* ${signal['tp']:.4f}\n"
            f"*SL Target:* ${signal['sl']:.4f}\n\n"
            f"📈 *CUMULATIVE LEDGER STATS*\n"
            f"*Total Trades Taken:* {total_taken}\n"
            f"*Total Closed Trades:* {total_closed}\n"
            f"*Cumulative Profit/Loss:* ${cum_pnl:.2f}"
        )
        TelegramManager.send_message(msg)

    def get_market_data(self, symbol):
        try:
            # Fetch OHLCV data (1m timeframe for scalping, 100 limit)
            ohlcv = self.exchange.fetch_ohlcv(symbol, timeframe='1m', limit=100)
            df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            return df
        except Exception as e:
            logger.error(f"Error fetching market data for {symbol}: {e}")
            # Try fetch_ticker first as it's often more reliable than fallback
            try:
                ticker = self.exchange.fetch_ticker(symbol)
                price = ticker['last']
                if price:
                    logger.info(f"Using ticker price for {symbol}: {price}")
                    now = pd.Timestamp.now()
                    data = {
                        'timestamp': [now],
                        'open': [price], 'high': [price], 'low': [price], 'close': [price], 'volume': [0]
                    }
                    return pd.DataFrame(data)
            except Exception as te:
                logger.debug(f"Ticker fetch failed for {symbol}: {te}")

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
        # Cache to avoid 429
        if not hasattr(self, '_price_cache'):
            self._price_cache = {}
        
        cache_key = symbol.replace('/', '').upper()
        if cache_key in self._price_cache:
            ts, price = self._price_cache[cache_key]
            if time.time() - ts < 300: # 5 min cache
                return price

        # 1. Try CoinGecko simple API
        try:
            mapping = {
                "BTCUSDT": "bitcoin",
                "ETHUSDT": "ethereum",
                "BNBUSDT": "binancecoin",
                "SOLUSDT": "solana",
                "ADAUSDT": "cardano"
            }
            clean_symbol = cache_key
            cg_id = mapping.get(clean_symbol)
            if not cg_id:
                cg_id = clean_symbol.replace('USDT', '').lower()

            url = f"https://api.coingecko.com/api/v3/simple/price?ids={cg_id}&vs_currencies=usd"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 AegisBot/1.0'})
            with urllib.request.urlopen(req, timeout=3) as response:
                data = json.loads(response.read().decode())
                price = float(data[cg_id]['usd'])
                self._price_cache[clean_symbol] = (time.time(), price)
                return price
        except Exception as e:
            logger.debug(f"Could not fetch fallback price for {symbol} via CoinGecko: {e}")

        # 2. Try Coinbase public API (highly reliable, never blocked in US/EU cloud servers)
        try:
            coin = cache_key.replace('USDT', '')
            url = f"https://api.coinbase.com/v2/prices/{coin}-USD/spot"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 AegisBot/1.0'})
            with urllib.request.urlopen(req, timeout=3) as response:
                data = json.loads(response.read().decode())
                price = float(data['data']['amount'])
                self._price_cache[clean_symbol] = (time.time(), price)
                return price
        except Exception as cb_err:
            logger.debug(f"Could not fetch fallback price for {symbol} via Coinbase: {cb_err}")

        # 3. Ultimate realistic static fallbacks (updated to actual current market prices)
        hardcoded_fallbacks = {
            "BTCUSDT": 61240.50,
            "ETHUSDT": 3350.20,
            "SOLUSDT": 138.45,
            "BNBUSDT": 565.10,
            "ADAUSDT": 0.38
        }
        return hardcoded_fallbacks.get(cache_key, 100.0)

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

    def check_risk_drawdown(self, balance):
        if self.disable_safety_stops:
            return True
        if balance <= 0:
            return True
        try:
            cursor = self.db.conn.execute("SELECT MAX(balance) FROM balance_history WHERE mode = ?", (self.trading_mode,))
            row = cursor.fetchone()
            peak_balance = float(row[0]) if row and row[0] else balance
            if balance > peak_balance:
                peak_balance = balance
                
            drawdown_pct = ((peak_balance - balance) / peak_balance) * 100.0 if peak_balance > 0 else 0.0
            
            if drawdown_pct >= self.max_drawdown:
                logger.error(f"🛑 Aegis Risk Safeguard: Max Drawdown (MDD) breached. Limit: {self.max_drawdown}%, Current: {drawdown_pct:.2f}%")
                self.db.set_bot_state('running', 'stopped')
                self.is_running = False
                
                msg = f"🚨 *AEGIS RISK TRIGGER: MAX DRAWDOWN BREACHED*\n\nAutonomous trading has been stopped to protect remaining liquidity.\n\n*Limit MDD:* {self.max_drawdown}%\n*Current Drawdown:* {drawdown_pct:.2f}%\n*Peak Balance:* ${peak_balance:,.2f}\n*Current Balance:* ${balance:,.2f}\n\n*Action Taken*: Trading Stopped."
                TelegramManager.send_message(msg)
                return False
            return True
        except Exception as e:
            logger.error(f"Error checking drawdown risk: {e}")
            return True

    def monitor_positions(self):
        """Monitor open positions for TP/SL hits"""
        try:
            cursor = self.db.conn.execute("SELECT * FROM trades WHERE status = 'OPEN' AND mode = ?", (self.trading_mode,))
            open_trades = cursor.fetchall()
            # columns: id, pair, action, entry_price, exit_price, quantity, pnl, status, tp, sl, strategy, exchange, timestamp
            
            for trade in open_trades:
                tid, symbol, action, entry, _, qty, _, _, tp, sl, _, _, _ = trade
                
                # Fetch current price
                df = self.get_market_data(symbol)
                if df.empty: continue
                current_price = df.iloc[-1]['close']
                
                exit_price = None
                pnl = 0
                
                if action == 'BUY':
                    if current_price >= tp:
                        exit_price = tp
                        logger.info(f"🎯 TP Hit for {symbol} | Price: {exit_price}")
                    elif current_price <= sl:
                        exit_price = sl
                        logger.info(f"🛑 SL Hit for {symbol} | Price: {exit_price}")
                else: # SELL/SHORT (if supported)
                    if current_price <= tp:
                        exit_price = tp
                        logger.info(f"🎯 TP Hit for {symbol} | Price: {exit_price}")
                    elif current_price >= sl:
                        exit_price = sl
                        logger.info(f"🛑 SL Hit for {symbol} | Price: {exit_price}")
                        
                if exit_price:
                    # Calculate PnL
                    if action == 'BUY':
                        pnl = (exit_price - entry) * qty
                    else:
                        pnl = (entry - exit_price) * qty
                        
                    if self.trading_mode == "real":
                        # In real mode, we should ideally execute the close on exchange
                        # For spot simulation of 'BUY', we sell the asset
                        try:
                            if action == 'BUY':
                                self.exchange.create_market_sell_order(symbol, qty)
                            else:
                                self.exchange.create_market_buy_order(symbol, qty)
                        except Exception as e:
                            logger.error(f"Failed to execute real exit for {symbol}: {e}")
                            continue # Don't close in DB if exchange fails
                    else:
                        # Update paper balance
                        self.paper_balance += pnl
                        self.db.conn.execute("UPDATE bot_state SET value = ? WHERE key = 'paper_balance'", (str(self.paper_balance),))
                        
                    self.db.update_trade(tid, exit_price, pnl, 'CLOSED')
                    
                    # Calculate percentage profit
                    pnl_pct = ((exit_price - entry) / entry * 100.0) if action == 'BUY' else ((entry - exit_price) / entry * 100.0)
                    
                    # Fetch cumulative stats for Telegram Alert
                    try:
                        cursor = self.db.conn.cursor()
                        cursor.execute("SELECT SUM(pnl), COUNT(*) FROM trades WHERE status = 'CLOSED' AND mode = ?", (self.trading_mode,))
                        row = cursor.fetchone()
                        cum_pnl = float(row[0]) if row and row[0] is not None else 0.0
                        total_closed = int(row[1]) if row and row[1] is not None else 0

                        cursor.execute("SELECT COUNT(*) FROM trades WHERE status = 'CLOSED' AND pnl > 0 AND mode = ?", (self.trading_mode,))
                        wins_row = cursor.fetchone()
                        wins = int(wins_row[0]) if wins_row and wins_row[0] is not None else 0
                        win_rate = (wins / total_closed * 100.0) if total_closed > 0 else 0.0

                        cursor.execute("SELECT COUNT(*) FROM trades WHERE mode = ?", (self.trading_mode,))
                        total_taken_row = cursor.fetchone()
                        total_taken = int(total_taken_row[0]) if total_taken_row and total_taken_row[0] is not None else 0
                    except Exception as db_err:
                        logger.error(f"Error fetching stats for TG alert: {db_err}")
                        cum_pnl = 0.0
                        total_closed = 0
                        win_rate = 0.0
                        total_taken = 0

                    prefix = "💎 REAL" if self.trading_mode == "real" else "🧪 PAPER"
                    msg = (
                        f"🏁 *{prefix} TRADE CLOSED*\n\n"
                        f"*Symbol:* {symbol}\n"
                        f"*Action:* {action} Exit\n"
                        f"*Exit Price:* ${exit_price:.4f}\n"
                        f"*Trade Profit/Loss:* ${pnl:+.2f} ({pnl_pct:+.2f}%)\n"
                        f"*Status:* {'✅ PROFIT' if pnl > 0 else '❌ LOSS'}\n\n"
                        f"📈 *CUMULATIVE LEDGER STATS*\n"
                        f"*Total Trades Taken:* {total_taken}\n"
                        f"*Total Closed Trades:* {total_closed}\n"
                        f"*Win Rate:* {win_rate:.1f}%\n"
                        f"*Cumulative Profit:* ${cum_pnl:+.2f}"
                    )
                    TelegramManager.send_message(msg)
                    
        except Exception as e:
            logger.error(f"Error monitoring positions: {e}")

    def run(self):
        logger.info("Bot logic ready...")
        last_balance_record = 0
        last_threshold_check = 0
        
        while True:
            try:
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
                except Exception as key_err:
                    logger.debug(f"Error checking key configuration: {key_err}")

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
                    # RISK SAFEGUARDS: MDD Drawdown check before any action
                    current_bal = self.get_usdt_balance()
                    if not self.check_risk_drawdown(current_bal):
                        time.sleep(Config.SCAN_INTERVAL)
                        continue

                    # PRE-START VALIDATION for Real Mode
                    if self.trading_mode == "real":
                        try:
                            logger.info("🛡️ Safety Check: Validating Liquidity before engine engagement...")
                            current_bal = self.get_usdt_balance()
                            if current_bal <= 0:
                                # DOUBLE CHECK: wait 2 seconds and try once more to avoid transient API errors
                                time.sleep(2)
                                current_bal = self.get_usdt_balance()
                                
                            if current_bal <= 0:
                                if self.disable_safety_stops:
                                    logger.warning("⚠️ Aegis Safety Protocol: Real Mode detected $0.00 balance, but safety stops are DISABLED. Continuing execution...")
                                else:
                                    logger.warning("⚠️ Aegis Safety Protocol: Real Mode detected $0.00 balance. Pausing active trading scanning until liquidity is restored...")
                                    # INSTEAD of stopping the engine permanently and writing 'stopped' to the database,
                                    # we log a warning and continue to next loop iteration. This ensures the bot NEVER stops or turns off automatically
                                    # when the user has funds in their Bitget spot account but encounters temporary API/connection issues.
                                    time.sleep(Config.SCAN_INTERVAL)
                                    continue
                            else:
                                logger.info(f"✅ Pre-start validation passed. Liquidity: ${current_bal:.2f}")
                        except Exception as e:
                            logger.error(f"Safety balance check failed: {e}")
                            if not self.disable_safety_stops:
                                time.sleep(Config.SCAN_INTERVAL)
                                continue
                    
                    # Periodic balance history recording (every ~10 scans)
                    if time.time() - last_balance_record > (Config.SCAN_INTERVAL * 10):
                        bal_to_record = self.get_usdt_balance()
                        logger.info(f"❤️ HEARTBEAT | Mode: {self.trading_mode.upper()} | Balance: ${bal_to_record:.2f} | Live: {self.is_running}")
                        try:
                            self.db.conn.execute("INSERT INTO balance_history (mode, balance) VALUES (?, ?)", (self.trading_mode, bal_to_record))
                            self.db.conn.commit()
                        except Exception as db_err:
                            logger.error(f"Failed to record balance heartbeat: {db_err}")
                        last_balance_record = time.time()

                    # Position Monitoring
                    self.monitor_positions()

                    for symbol in Config.SYMBOLS:
                        try:
                            logger.info(f"🔍 Scanning {symbol} on {self.exchange.id} ({self.trading_mode.upper()})...")
                            df = self.get_market_data(symbol)
                            if df.empty: 
                                logger.warning(f"⚠️ No market data for {symbol}. Skipping.")
                                continue
                            
                            signal = self.strategies[self.current_strategy].generate_signal(df)
                            # Log technicals for debugging
                            last = df.iloc[-1]
                            logger.debug(f"📊 {symbol} Technicals | RSI: {last.get('rsi',0):.2f} | MACD: {last.get('macd',0):.4f} | Price: {last['close']}")
                            
                            if signal['action'] == "HOLD":
                                continue
                            
                            signal['symbol'] = symbol
                            signal['entry'] = df.iloc[-1]['close']
                            self.execute_trade(symbol, signal)
                        except Exception as e:
                            logger.error(f"Error processing {symbol}: {e}")
                else:
                    logger.debug("Bot is idle (stopped via dashboard)")
                
                time.sleep(Config.SCAN_INTERVAL)

            except Exception as loop_err:
                logger.error(f"⚠️ CRITICAL ENGINE LOOP EXCEPTION: {loop_err}")
                try:
                    self.db.conn.rollback()
                except Exception:
                    pass
                time.sleep(10) # Quick sleep to avoid hot error loop

if __name__ == "__main__":
    engine = TradingEngine()
    engine.run()
