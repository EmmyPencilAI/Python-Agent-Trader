import time
import logging
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
        
        if exch_id == 'binance':
            return ccxt.binance({
                'apiKey': Config.BINANCE_API_KEY,
                'secret': Config.BINANCE_SECRET_KEY,
                'enableRateLimit': True,
            })
        elif exch_id == 'bitget':
            return ccxt.bitget({
                'apiKey': Config.BITGET_API_KEY,
                'secret': Config.BITGET_SECRET_KEY,
                'password': Config.BITGET_PASSPHRASE,
                'enableRateLimit': True,
            })
        else:
            raise ValueError(f"Unsupported exchange: {exch_id}")

    def get_usdt_balance(self):
        if self.trading_mode == "paper":
            return self.paper_balance
        
        try:
            balance = self.exchange.fetch_balance()
            return float(balance.get('USDT', {}).get('free', 0.0))
        except Exception as e:
            logger.error(f"Error fetching balance from {self.exchange.id}: {e}")
            return 0.0

    def calculate_quantity(self, symbol, price):
        balance = self.get_usdt_balance()
        if balance <= 0:
            logger.warning(f"No {self.trading_mode} balance available.")
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
            return

        logger.info(f"🚀 [{self.trading_mode.upper()}] Executing {signal['action']} | {symbol} | Price: {price}")
        
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
            logger.info(f"Paper Executed. New virtual balance: {self.paper_balance}")
        
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
