import time
import logging
import json
import pandas as pd
from datetime import datetime
from config import Config
from database.db import DatabaseManager
from exchanges.manager import ExchangeManager
from ai.lstm_gru import AegisAIEngine
from ai.self_learning import SelfLearningFeedbackLoop
from risk.risk_engine import RiskEngine
from notifications.telegram import TelegramManager
from strategies.base import ScalpingStrategy, SwingStrategy

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("AegisBotCore")

class TradingEngine:
    def __init__(self):
        # Initialize Core Managers
        self.db = DatabaseManager()
        self.exchange_mgr = ExchangeManager(self.db)
        self.ai = AegisAIEngine(self.db)
        self.self_learning = SelfLearningFeedbackLoop(self.db)
        self.risk = RiskEngine(self.db)
        
        # Strategies Setup
        self.strategies = {
            "scalping": ScalpingStrategy(),
            "swing": SwingStrategy()
        }
        self.current_strategy = "scalping"
        self.is_running = False
        self.trading_mode = "paper"
        
        # Sync Initial State
        self._sync_state_from_db()
        logger.info("🛡️ Quantum Aegis v2.0 Trading Engine Initialized Successfully.")

    def _sync_state_from_db(self):
        """Reload variables dynamically from SQLite state to catch dashboard adjustments."""
        try:
            self.is_running = self.db.get_bot_state("running", "stopped") == "running"
            self.trading_mode = self.db.get_bot_state("mode", "paper").lower()
            self.current_strategy = self.db.get_bot_state("current_strategy", "scalping").lower()
            
            # Risk engine reload
            self.risk.load_risk_limits()
            
            # Make sure exchange manager matches current DB state
            self.exchange_mgr.load_active_exchange()
        except Exception as e:
            logger.error(f"Error syncing bot state from DB: {e}")

    def get_usdt_balance(self) -> float:
        """Fetch balance from the active exchange adapter."""
        try:
            adapter = self.exchange_mgr.get_adapter()
            if not adapter:
                return 1000.0
            bal = adapter.get_balance()
            return float(bal['free'].get('USDT', 1000.0))
        except Exception as e:
            logger.error(f"Failed to fetch USDT balance: {e}")
            return 1000.0

    def calculate_quantity(self, symbol: str, price: float, balance: float) -> float:
        """Institutional Position Sizing Rules."""
        # Baseline minimum quantity
        base_size = 0.05
        
        # Milestone scaling logic:
        # Scale only after equity milestones: $1,000, $3,000, $5,000
        if balance >= 5000.0:
            base_size = 0.20
        elif balance >= 3000.0:
            base_size = 0.15
        elif balance >= 1000.0:
            base_size = 0.10
            
        # Apply custom caps from dashboard if set
        try:
            pos_limit_type = self.db.get_bot_state("pos_size_limit_type", "percentage")
            pos_limit_val = float(self.db.get_bot_state("pos_size_limit_value", "2.0"))
            
            if pos_limit_type == "percentage":
                cap_usdt = balance * (pos_limit_val / 100.0)
                cap_qty = cap_usdt / price
                if base_size > cap_qty:
                    base_size = cap_qty
            elif pos_limit_type == "absolute":
                cap_qty = pos_limit_val / price
                if base_size > cap_qty:
                    base_size = cap_qty
        except Exception as e:
            logger.error(f"Error checking position limits: {e}")

        # Final floor limits
        if base_size <= 0:
            base_size = 0.05
            
        # Exchange precision matching
        try:
            adapter = self.exchange_mgr.get_adapter()
            if adapter and adapter.client:
                adapter.client.load_markets()
                return float(adapter.client.amount_to_precision(symbol, base_size))
        except Exception:
            pass

        return round(base_size, 6)

    def execute_trade(self, symbol: str, signal: dict, balance: float):
        """Real trade execution with dynamic indicators and multi-gate validations."""
        if signal['action'] == "HOLD":
            return
            
        # Check active position limit
        try:
            cursor = self.db.conn.execute("""
                SELECT id FROM trades WHERE symbol = ? AND status = 'OPEN' AND mode = ?
            """, (symbol, self.trading_mode))
            if cursor.fetchone():
                logger.debug(f"Position already open for {symbol} in {self.trading_mode} mode. Skipping.")
                return
        except Exception as e:
            logger.error(f"Error checking existing position: {e}")
            return

        price = signal['entry']
        qty = self.calculate_quantity(symbol, price, balance)
        
        if qty <= 0:
            logger.warning(f"Quantity is zero for {symbol}. Skipping trade.")
            return

        # Pre-Trade Risk Checks
        order_value = qty * price
        if not self.risk.evaluate_pre_trade_risk(symbol, balance, order_value, self.trading_mode):
            logger.warning(f"Risk checks failed for {symbol}. Trade blocked.")
            return

        adapter = self.exchange_mgr.get_adapter()
        if not adapter:
            logger.error("No active exchange adapter loaded. Aborting trade.")
            return

        logger.info(f"⚡ [{self.trading_mode.upper()}] Routing Order: {signal['action']} {qty} {symbol} at ${price:.2f}")

        # Run AI prediction to save predicted direction and confidence
        ai_pred = self.ai.predict(self.get_market_data(symbol))
        ai_score = ai_pred['confidence']
        
        # Log Prediction to SQLite
        self.db.log_ai_prediction(symbol, "trend", ai_pred['direction'], ai_score)

        # Place Order (Real vs Paper Adapter abstraction)
        order_res = {}
        try:
            if signal['action'].lower() == 'buy':
                order_res = adapter.place_market_buy(symbol, qty)
            else:
                order_res = adapter.place_market_sell(symbol, qty)
        except Exception as err:
            logger.error(f"❌ Order Placement Failed on Exchange: {err}")
            self.db.log_system_event("ERROR", "EXECUTION", f"Failed order placement for {symbol}: {err}")
            return

        # Record trade in SQLite database
        trade_id = self.db.log_trade({
            'symbol': symbol,
            'side': signal['action'],
            'entry': price,
            'quantity': qty,
            'tp': signal['tp'],
            'sl': signal['sl'],
            'strategy': self.current_strategy,
            'exchange': adapter.exchange_id,
            'mode': self.trading_mode,
            'ai_score': ai_score,
            'fee': order_value * 0.001  # Standard estimated fee
        })

        # Update paper balance if in paper mode
        if self.trading_mode == "paper":
            new_bal = balance - (qty * price) if signal['action'].lower() == 'buy' else balance + (qty * price)
            self.db.set_bot_state("paper_balance", str(new_bal))

        logger.info(f"✅ Trade logged in database: ID {trade_id}")

        # Send telegram alert
        TelegramManager.send_trade_alert({
            'symbol': symbol,
            'action': signal['action'],
            'quantity': qty,
            'entry': price,
            'tp': signal['tp'],
            'sl': signal['sl'],
            'strategy': self.current_strategy,
            'confidence': ai_score,
            'mode': self.trading_mode
        })

    def monitor_positions(self):
        """Monitor open positions against TP / SL thresholds and trigger dynamic closures."""
        try:
            cursor = self.db.conn.execute("""
                SELECT * FROM trades WHERE status = 'OPEN' AND mode = ?
            """, (self.trading_mode,))
            open_trades = cursor.fetchall()

            adapter = self.exchange_mgr.get_adapter()
            if not adapter or not open_trades:
                return

            for trade in open_trades:
                tid = trade['id']
                symbol = trade['symbol']
                side = trade['side'].lower()
                entry = float(trade['entry_price'])
                qty = float(trade['quantity'])
                tp = float(trade['exit_price']) if trade['exit_price'] else entry * 1.04 # fallback TP
                # Note: TP/SL are sometimes recorded in exit_price temporarily or we compute based on trade logs
                # Let's read strategies TP/SL values stored
                tp = entry * 1.03 if side == 'buy' else entry * 0.97
                sl = entry * 0.98 if side == 'buy' else entry * 1.02

                # Fetch current market price
                price = adapter.get_market_price(symbol)
                if not price:
                    continue

                exit_triggered = False
                exit_price = price
                pnl = 0.0

                if side == 'buy':
                    if price >= tp:
                        exit_triggered = True
                        exit_price = tp
                    elif price <= sl:
                        exit_triggered = True
                        exit_price = sl
                elif side == 'sell':
                    if price <= tp:
                        exit_triggered = True
                        exit_price = tp
                    elif price >= sl:
                        exit_triggered = True
                        exit_price = sl

                if exit_triggered:
                    logger.info(f"🎯 Target hit for {symbol}: closing position at ${exit_price:.2f}")
                    
                    # Execute closure order on active exchange adapter
                    try:
                        if side == 'buy':
                            adapter.place_market_sell(symbol, qty)
                        else:
                            adapter.place_market_buy(symbol, qty)
                    except Exception as err:
                        logger.error(f"Failed to execute exit order on exchange: {err}")
                        continue  # Keep open if API execution fails

                    # Calculate PnL
                    pnl = (exit_price - entry) * qty if side == 'buy' else (entry - exit_price) * qty
                    
                    # Update trade in SQLite
                    self.db.update_trade(tid, exit_price, pnl, 'CLOSED')

                    # Update paper balance
                    if self.trading_mode == "paper":
                        curr_paper = float(self.db.get_bot_state("paper_balance", "1000.0"))
                        self.db.set_bot_state("paper_balance", str(curr_paper + pnl))

                    # Send Telegram notification
                    pnl_pct = ((exit_price - entry) / entry) * 100.0 if side == 'buy' else ((entry - exit_price) / entry) * 100.0
                    prefix = "💎 REAL" if self.trading_mode == "real" else "🧪 PAPER"
                    msg = (
                        f"🏁 *{prefix} POSITION LIQUIDATED*\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"*Pair:* `{symbol}`\n"
                        f"*Side:* `{side.upper()} EXIT`\n"
                        f"*Quantity:* `{qty}`\n"
                        f"*Entry:* `${entry:.2f}`\n"
                        f"*Exit Price:* `${exit_price:.2f}`\n"
                        f"*PnL:* `${pnl:+.2f}` ({pnl_pct:+.2f}%)\n"
                        f"*Status:* {'✅ PROFIT' if pnl > 0 else '❌ LOSS'}\n"
                        f"━━━━━━━━━━━━━━━━━━━━"
                    )
                    TelegramManager.send_message(msg)

        except Exception as e:
            logger.error(f"Error monitoring open positions: {e}")

    def get_market_data(self, symbol: str) -> pd.DataFrame:
        """Fetch historical candlesticks from active exchange adapter."""
        try:
            adapter = self.exchange_mgr.get_adapter()
            if not adapter:
                return pd.DataFrame()
                
            ohlcv = adapter.get_klines(symbol, timeframe='1m', limit=100)
            if not ohlcv:
                return pd.DataFrame()
                
            df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            return df
        except Exception as e:
            logger.error(f"Error fetching candles for {symbol}: {e}")
            return pd.DataFrame()

    def run(self):
        """Continuous execution scanner loop."""
        logger.info("⚡ Aegis Quantum Engine core loop has loaded. Engaging active listening.")
        last_self_learning_resolve = 0
        last_balance_record = 0
        
        while True:
            try:
                # Sync settings
                self._sync_state_from_db()

                # Get balance
                balance = self.get_usdt_balance()

                # Record Heartbeat Balance History
                if time.time() - last_balance_record > 300: # Every 5 minutes
                    self.db.execute_with_retry(
                        "INSERT INTO balance_history (mode, balance) VALUES (?, ?)",
                        (self.trading_mode, balance)
                    )
                    last_balance_record = time.time()

                # Self-Learning Resolution (Reconcile old predictions with outcomes)
                if time.time() - last_self_learning_resolve > 600: # Every 10 minutes
                    self.self_learning.resolve_predictions(self.exchange_mgr.get_adapter())
                    last_self_learning_resolve = time.time()

                if self.is_running:
                    # 1. Position monitoring check
                    self.monitor_positions()

                    # 2. Scanning cycle across indicators
                    strategy = self.strategies.get(self.current_strategy, ScalpingStrategy())
                    
                    for symbol in Config.SYMBOLS:
                        logger.info(f"🔍 Scanning {symbol} on {self.exchange_mgr.active_exchange_id.upper()}...")
                        df = self.get_market_data(symbol)
                        if df.empty:
                            logger.warning(f"No candlestick data returned for {symbol}. Skipping.")
                            continue

                        # Compute signals
                        signal = strategy.generate_signal(df)
                        if signal['action'] != 'HOLD':
                            signal['symbol'] = symbol
                            signal['entry'] = float(df.iloc[-1]['close'])
                            
                            # Route execution
                            self.execute_trade(symbol, signal, balance)

                else:
                    logger.debug("Core engine is idle (stopped via settings).")

                # Sleep scan interval (default 60s)
                time.sleep(Config.SCAN_INTERVAL)

            except Exception as e:
                logger.error(f"CRITICAL SYSTEM ERROR IN CORE RUN LOOP: {e}")
                time.sleep(10)

if __name__ == "__main__":
    import sys
    # Support command line flag fetches
    if len(sys.argv) > 1 and sys.argv[1] == "--fetch-balance":
        engine = TradingEngine()
        # Explicitly force the mode to 'real' in the database and engine, and reload the exchange adapter to ensure we fetch live funds.
        engine.db.set_bot_state("mode", "real")
        engine._sync_state_from_db() # This will load the exchange in real mode!
        real_bal = engine.get_usdt_balance()
        
        # Save the live balance to the database
        engine.db.set_bot_state("real_balance", str(real_bal))
        
        # Also initialize initial_real_balance to ensure performance stats calculate correctly from this baseline
        init_real = engine.db.get_bot_state("initial_real_balance", "0.0")
        if float(init_real) == 0.0 or init_real == "0" or init_real == "0.0":
            engine.db.set_bot_state("initial_real_balance", str(real_bal))
            
        print(f"SUCCESS_BALANCE: {real_bal}")
        sys.exit(0)
    else:
        engine = TradingEngine()
        engine.run()
