import pandas as pd
import numpy as np

class Strategy:
    def generate_signal(self, df):
        raise NotImplementedError

class ScalpingStrategy(Strategy):
    def generate_signal(self, df):
        if len(df) < 30: return {"action": "HOLD", "confidence": 0, "tp": 0, "sl": 0}

        # RSI (14) using pure pandas
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        # Avoid division by zero
        loss = loss.replace(0, 0.00001)
        rs = gain / loss
        df['rsi'] = 100 - (100 / (1 + rs))
        
        # MACD (12, 26, 9)
        exp1 = df['close'].ewm(span=12, adjust=False).mean()
        exp2 = df['close'].ewm(span=26, adjust=False).mean()
        df['macd'] = exp1 - exp2
        df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()

        # Trend Filter: 50 EMA for medium trend
        df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
        
        last_row = df.iloc[-1]
        
        action = "HOLD"
        confidence = 0
        
        # Strategy: High-Frequency Scalping for Small Accounts
        # Indicators: RSI (14), MACD (12,26,9), EMA 20 & 50
        df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
        df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()

        last_row = df.iloc[-1]
        prev_row = df.iloc[-2]
        
        action = "HOLD"
        confidence = 0
        
        # PRIMARY SIGNAL: RSI Mean Reversion + MACD momentum
        # Relaxed RSI for more "Real Mode" action
        is_bullish_trend = last_row['close'] > last_row['ema50']
        
        # BUY Condition: RSI oversold OR MACD Cross + Bullish Trend
        if (last_row['rsi'] < 45 and last_row['macd'] > last_row['macd_signal'] and prev_row['macd'] <= prev_row['macd_signal']):
            action = "BUY"
            confidence = 85
        elif last_row['rsi'] < 30: # Extreme oversold
            action = "BUY"
            confidence = 75
            
        # SELL/EXIT Condition
        elif last_row['rsi'] > 65 or (last_row['macd'] < last_row['macd_signal'] and prev_row['macd'] >= prev_row['macd_signal']):
            action = "SELL"
            confidence = 80

        # Small balance optimization: Precise exits to clear 0.1% fees
        # Target 0.8% profit (0.6% net after fees), 0.4% stop loss
        tp_mult = 1.008 if action == "BUY" else 0.992
        sl_mult = 0.996 if action == "BUY" else 1.004
            
        return {
            "action": action,
            "confidence": confidence,
            "tp": last_row['close'] * tp_mult,
            "sl": last_row['close'] * sl_mult
        }

class SwingStrategy(Strategy):
    def generate_signal(self, df):
        # EMA crossover (9, 21)
        df['ema9'] = df['close'].ewm(span=9, adjust=False).mean()
        df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
        
        last_row = df.iloc[-1]
        prev_row = df.iloc[-2]
        
        action = "HOLD"
        if prev_row['ema9'] <= prev_row['ema21'] and last_row['ema9'] > last_row['ema21']:
            action = "BUY"
        elif prev_row['ema9'] >= prev_row['ema21'] and last_row['ema9'] < last_row['ema21']:
            action = "SELL"
            
        return {
            "action": action,
            "confidence": 70,
            "tp": last_row['close'] * 1.05 if action == "BUY" else last_row['close'] * 0.95,
            "sl": last_row['close'] * 0.97 if action == "BUY" else last_row['close'] * 1.03
        }
