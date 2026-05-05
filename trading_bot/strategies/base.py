import pandas as pd
import pandas_ta as ta

class Strategy:
    def generate_signal(self, df):
        raise NotImplementedError

class ScalpingStrategy(Strategy):
    def generate_signal(self, df):
        # RSI (14)
        df['rsi'] = ta.rsi(df['close'], length=14)
        
        # MACD
        macd = ta.macd(df['close'])
        df['macd'] = macd['MACD_12_26_9']
        df['macd_signal'] = macd['MACDs_12_26_9']
        
        last_row = df.iloc[-1]
        prev_row = df.iloc[-2]
        
        action = "HOLD"
        confidence = 0
        
        # Simple crossover logic
        if last_row['rsi'] < 30 and last_row['macd'] > last_row['macd_signal']:
            action = "BUY"
            confidence = 80
        elif last_row['rsi'] > 70 and last_row['macd'] < last_row['macd_signal']:
            action = "SELL"
            confidence = 80
            
        return {
            "action": action,
            "confidence": confidence,
            "tp": last_row['close'] * 1.02 if action == "BUY" else last_row['close'] * 0.98,
            "sl": last_row['close'] * 0.99 if action == "BUY" else last_row['close'] * 1.01
        }

class SwingStrategy(Strategy):
    def generate_signal(self, df):
        # EMA crossover
        df['ema9'] = ta.ema(df['close'], length=9)
        df['ema21'] = ta.ema(df['close'], length=21)
        
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
