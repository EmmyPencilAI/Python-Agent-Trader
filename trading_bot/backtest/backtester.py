import pandas as pd
import numpy as np
import logging
import ccxt
import time
from database.db import DatabaseManager
from strategies.base import ScalpingStrategy, SwingStrategy

logger = logging.getLogger("AegisBacktester")

class BacktestingEngine:
    def __init__(self, db_manager: DatabaseManager):
        self.db = db_manager
        self.strategies = {
            "scalping": ScalpingStrategy(),
            "swing": SwingStrategy()
        }

    def run_backtest(self, symbol: str = "BTC/USDT", timeframe: str = "1h", strategy_name: str = "scalping", days: int = 30, initial_capital: float = 1000.0) -> dict:
        """Run a backtest on historical data without credentials and save results to SQLite."""
        logger.info(f"[BACKTEST] Starting backtest for {symbol} | Timeframe: {timeframe} | Strategy: {strategy_name}")
        
        try:
            # 1. Fetch historical data from CCXT without credentials
            client = ccxt.binance()  # Safe public exchange endpoint
            limit = min(days * 24 if timeframe == "1h" else days * 1440, 1000)
            
            logger.info(f"[BACKTEST] Fetching {limit} historical candles from Binance public API...")
            ohlcv = client.fetch_ohlcv(symbol, timeframe, limit=limit)
            if not ohlcv:
                raise ValueError("No historical data returned from public API.")

            df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            
            # Initialize indicators
            strategy = self.strategies.get(strategy_name, ScalpingStrategy())
            
            # Backtest simulation loop
            capital = initial_capital
            position = 0.0  # Current position size in units
            entry_price = 0.0
            trades_logged = []
            equity_curve = [initial_capital]
            
            # Simple simulation tracking
            wins = 0
            losses = 0
            total_profit = 0.0
            max_equity = initial_capital
            max_drawdown = 0.0
            
            # Fee: standard 0.1% spot fee
            fee_rate = 0.001

            logger.info(f"[BACKTEST] Running strategy logic across {len(df)} bars...")
            for i in range(30, len(df)):
                sub_df = df.iloc[:i]
                current_bar = df.iloc[i]
                current_price = float(current_bar['close'])
                
                # Check for active positions exits (Take Profit or Stop Loss)
                if position > 0:
                    # Let's check stop loss/take profit
                    # In a simple backtest, we exit if strategy generates exit signal or SL/TP triggered
                    # For simplicity, let's check SL (2%) or TP (4%) or strategy reversal
                    sl_price = entry_price * 0.98
                    tp_price = entry_price * 1.04
                    
                    signal = strategy.generate_signal(sub_df)
                    
                    exit_triggered = False
                    exit_reason = ""
                    
                    if current_price <= sl_price:
                        exit_triggered = True
                        exit_price_actual = sl_price
                        exit_reason = "Stop Loss"
                    elif current_price >= tp_price:
                        exit_triggered = True
                        exit_price_actual = tp_price
                        exit_reason = "Take Profit"
                    elif signal['action'] == "SELL":
                        exit_triggered = True
                        exit_price_actual = current_price
                        exit_reason = "Strategy Signal"
                        
                    if exit_triggered:
                        gross_pnl = (exit_price_actual - entry_price) * position
                        trade_fee = exit_price_actual * position * fee_rate
                        net_pnl = gross_pnl - trade_fee
                        
                        capital += (position * exit_price_actual) - trade_fee
                        position = 0.0
                        
                        # Stats
                        roi = (net_pnl / (entry_price * (position if position > 0 else (capital / current_price)))) * 100.0 if entry_price > 0 else 0.0
                        if net_pnl > 0:
                            wins += 1
                        else:
                            losses += 1
                            
                        trades_logged.append({
                            'symbol': symbol,
                            'side': 'sell',
                            'entry_price': entry_price,
                            'exit_price': exit_price_actual,
                            'quantity': gross_pnl / (exit_price_actual - entry_price + 1e-10) if (exit_price_actual - entry_price) != 0 else 0.05,
                            'profit': net_pnl,
                            'roi': roi,
                            'reason': exit_reason,
                            'timestamp': str(current_bar['timestamp'])
                        })
                        
                else:
                    # Look for entry buy signals
                    signal = strategy.generate_signal(sub_df)
                    if signal['action'] == "BUY":
                        # Buy with 10% of active capital
                        allocation = capital * 0.1
                        trade_fee = allocation * fee_rate
                        position = (allocation - trade_fee) / current_price
                        entry_price = current_price
                        capital -= allocation
                        
                        trades_logged.append({
                            'symbol': symbol,
                            'side': 'buy',
                            'entry_price': entry_price,
                            'exit_price': None,
                            'quantity': position,
                            'profit': 0.0,
                            'roi': 0.0,
                            'reason': "Entry Signal",
                            'timestamp': str(current_bar['timestamp'])
                        })

                # Record equity
                current_equity = capital + (position * current_price if position > 0 else 0.0)
                equity_curve.append(current_equity)
                
                # Drawdown calculations
                if current_equity > max_equity:
                    max_equity = current_equity
                dd = ((max_equity - current_equity) / max_equity) * 100.0 if max_equity > 0 else 0.0
                if dd > max_drawdown:
                    max_drawdown = dd

            # Clean final open position
            if position > 0:
                final_price = float(df.iloc[-1]['close'])
                gross_pnl = (final_price - entry_price) * position
                trade_fee = final_price * position * fee_rate
                capital += (position * final_price) - trade_fee
                net_pnl = gross_pnl - trade_fee
                trades_logged.append({
                    'symbol': symbol,
                    'side': 'sell',
                    'entry_price': entry_price,
                    'exit_price': final_price,
                    'quantity': position,
                    'profit': net_pnl,
                    'roi': (net_pnl / (entry_price * position)) * 100.0,
                    'reason': "Backtest Ended",
                    'timestamp': str(df.iloc[-1]['timestamp'])
                })
                equity_curve.append(capital)

            total_trades = wins + losses
            win_rate = (wins / total_trades) * 100.0 if total_trades > 0 else 0.0
            net_profit = capital - initial_capital
            roi_pct = (net_profit / initial_capital) * 100.0
            
            # Save final summary metrics and raw trades directly to SQLite bot state for the dashboard UI to consume
            report = {
                'symbol': symbol,
                'timeframe': timeframe,
                'strategy': strategy_name,
                'total_trades': total_trades,
                'wins': wins,
                'losses': losses,
                'win_rate': win_rate,
                'net_profit': net_profit,
                'roi': roi_pct,
                'max_drawdown': max_drawdown,
                'initial_capital': initial_capital,
                'final_capital': capital,
                'timestamp': int(time.time() * 1000)
            }
            
            # Serialize and write to db state
            self.db.set_bot_state("backtest_report", json.dumps(report))
            self.db.set_bot_state("backtest_trades", json.dumps(trades_logged[:100])) # Keep last 100 backtest trades
            
            logger.info(f"✅ Backtest completed! Net Profit: ${net_profit:.2f} | Win Rate: {win_rate:.2f}% | Max Drawdown: {max_drawdown:.2f}%")
            return report
            
        except Exception as e:
            logger.error(f"Backtest execution failed: {e}")
            raise e
if __name__ == "__main__":
    import sys
    db = DatabaseManager()
    b = BacktestingEngine(db)
    
    symbol = sys.argv[1] if len(sys.argv) > 1 else "BTC/USDT"
    timeframe = sys.argv[2] if len(sys.argv) > 2 else "1h"
    strategy = sys.argv[3] if len(sys.argv) > 3 else "scalping"
    days = int(sys.argv[4]) if len(sys.argv) > 4 else 30
    capital = float(sys.argv[5]) if len(sys.argv) > 5 else 1000.0
    
    b.run_backtest(symbol=symbol, timeframe=timeframe, strategy_name=strategy, days=days, initial_capital=capital)
