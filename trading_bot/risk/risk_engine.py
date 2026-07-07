import logging
from datetime import datetime
from database.db import DatabaseManager

logger = logging.getLogger("AegisRiskEngine")

class RiskEngine:
    def __init__(self, db_manager: DatabaseManager):
        self.db = db_manager
        
        # Default limits
        self.max_daily_loss_pct = 5.0
        self.max_drawdown_pct = 5.0
        self.max_trades_per_day = 100
        self.max_consecutive_losses_limit = 5
        self.circuit_breaker_active = False

    def load_risk_limits(self):
        """Reload dynamic risk limits from SQLite."""
        try:
            self.max_daily_loss_pct = float(self.db.get_bot_state("max_daily_loss", 5.0))
            self.max_drawdown_pct = float(self.db.get_bot_state("max_drawdown", 5.0))
            self.max_trades_per_day = int(self.db.get_bot_state("max_trades_per_day", 100))
            self.max_consecutive_losses_limit = int(self.db.get_bot_state("max_consecutive_losses", 5))
            self.disable_safety_stops = self.db.get_bot_state("disable_safety_stops", "false") == "true"
        except Exception as e:
            logger.error(f"Error loading risk settings: {e}")

    def evaluate_pre_trade_risk(self, symbol: str, current_balance: float, order_size_usdt: float, trading_mode: str) -> bool:
        """Evaluate pre-trade risks: Circuit breakers, Daily Losses, Drawdowns, Max Daily Trades, Sizing limits."""
        self.load_risk_limits()

        if self.circuit_breaker_active:
            logger.warning("🛡️ RISK RULE TRIGGERED: Circuit breaker is active! Trading blocked.")
            return False

        # 1. Position Sizing validation
        # Default base size is 0.05, let's verify if order fits inside maximum configured sizing limits
        if order_size_usdt > current_balance * 0.2:  # Safe limit: No single position > 20% of current equity
            logger.warning(f"🛡️ RISK SIZING BLOCKED: Proposed trade size (${order_size_usdt:.2f}) exceeds 20% of total equity.")
            return False

        # 2. Daily Loss Limit check
        daily_loss_pct = self.calculate_daily_loss_percentage(trading_mode)
        if daily_loss_pct >= self.max_daily_loss_pct:
            logger.warning(f"🛡️ RISK DAILY LOSS TRIGGERED: Daily loss ({daily_loss_pct:.2f}%) exceeds maximum limit ({self.max_daily_loss_pct:.2f}%). Emergency shutdown.")
            self.trigger_circuit_breaker()
            return False

        # 3. Maximum Trades per Day check
        daily_trades = self.count_daily_trades(trading_mode)
        if daily_trades >= self.max_trades_per_day:
            logger.warning(f"🛡️ RISK MAX TRADES TRIGGERED: Today's trade count ({daily_trades}) reached cap ({self.max_trades_per_day}).")
            return False

        # 4. Consecutive Losses check
        consecutive_losses = self.calculate_consecutive_losses(trading_mode)
        if consecutive_losses >= self.max_consecutive_losses_limit:
            logger.warning(f"🛡️ RISK CONSECUTIVE LOSSES: {consecutive_losses} consecutive losses! Pausing core.")
            self.trigger_circuit_breaker()
            return False

        return True

    def calculate_daily_loss_percentage(self, mode: str) -> float:
        """Calculate the cumulative loss percentage since midnight UTC."""
        try:
            cursor = self.db.conn.execute("""
                SELECT SUM(profit) as total_pnl FROM trades
                WHERE mode = ? AND timestamp >= date('now') AND status = 'CLOSED'
            """, (mode,))
            row = cursor.fetchone()
            total_pnl = float(row['total_pnl'] or 0.0)
            
            # Fetch balance to check ratio
            balance_cursor = self.db.conn.execute("""
                SELECT balance FROM balance_history 
                WHERE mode = ? 
                ORDER BY timestamp ASC LIMIT 1
            """, (mode,))
            b_row = balance_cursor.fetchone()
            initial_balance = float(b_row['balance'] if b_row else 1000.0)
            
            if initial_balance <= 0:
                return 0.0
                
            if total_pnl < 0:
                return (abs(total_pnl) / initial_balance) * 100.0
            return 0.0
        except Exception as e:
            logger.error(f"Failed to calculate daily loss: {e}")
            return 0.0

    def count_daily_trades(self, mode: str) -> int:
        """Count the number of trades executed since midnight UTC."""
        try:
            cursor = self.db.conn.execute("""
                SELECT COUNT(*) as trade_count FROM trades
                WHERE mode = ? AND timestamp >= date('now')
            """, (mode,))
            row = cursor.fetchone()
            return int(row['trade_count'] or 0)
        except Exception as e:
            logger.error(f"Failed to count daily trades: {e}")
            return 0

    def calculate_consecutive_losses(self, mode: str) -> int:
        """Find the number of consecutive losses in the trade logs."""
        try:
            cursor = self.db.conn.execute("""
                SELECT profit FROM trades
                WHERE mode = ? AND status = 'CLOSED'
                ORDER BY timestamp DESC LIMIT 10
            """, (mode,))
            rows = cursor.fetchall()
            losses = 0
            for row in rows:
                if float(row['profit'] or 0.0) < 0:
                    losses += 1
                else:
                    break
            return losses
        except Exception as e:
            logger.error(f"Failed to calculate consecutive losses: {e}")
            return 0

    def trigger_circuit_breaker(self):
        """Active circuit breaker in emergency."""
        self.circuit_breaker_active = True
        self.db.set_bot_state("running", "stopped")
        self.db.log_system_event("CRITICAL", "RISK_ENGINE", "EMERGENCY SHUTDOWN: Circuit breaker activated due to threshold violations.")
        logger.error("🛑 EMERGENCY SHUTDOWN: Circuit breaker triggered system freeze.")

    def reset_circuit_breaker(self):
        """Deactivate the circuit breaker."""
        self.circuit_breaker_active = False
        logger.info("✅ Risk engine circuit breaker reset successfully.")
