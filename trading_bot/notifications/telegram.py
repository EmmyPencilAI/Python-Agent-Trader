import requests
import sqlite3
from config import Config

class TelegramManager:
    @staticmethod
    def _get_config():
        try:
            conn = sqlite3.connect(Config.DATABASE_NAME)
            cursor = conn.cursor()
            token_row = cursor.execute("SELECT value FROM bot_state WHERE key = 'telegram_bot_token'").fetchone()
            chat_id_row = cursor.execute("SELECT value FROM bot_state WHERE key = 'telegram_chat_id'").fetchone()
            conn.close()
            
            token = token_row[0] if token_row else Config.TELEGRAM_BOT_TOKEN
            chat_id = chat_id_row[0] if chat_id_row else Config.TELEGRAM_CHAT_ID
            return token, chat_id
        except:
            return Config.TELEGRAM_BOT_TOKEN, Config.TELEGRAM_CHAT_ID

    @staticmethod
    def send_message(message):
        token, chat_id = TelegramManager._get_config()
        if not token or not chat_id:
            print("Telegram not configured")
            return
            
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "Markdown"
        }
        
        try:
            requests.post(url, json=payload)
        except Exception as e:
            print(f"Error sending Telegram message: {e}")

    @staticmethod
    def send_trade_alert(trade_data):
        msg = f"""
🚀 *TRADE EXECUTED*
*Pair:* {trade_data['symbol']}
*Action:* {trade_data['action']}
*Entry:* ${trade_data['entry']:.4f}
*Quantity:* {trade_data.get('quantity', 'N/A')}
*TP:* ${trade_data['tp']:.4f}
*SL:* ${trade_data['sl']:.4f}
*Confidence:* {trade_data.get('confidence', 0)}%
*Balance:* ${trade_data.get('balance', 0):.2f}
"""
        TelegramManager.send_message(msg)

    @staticmethod
    def send_alert(message):
        """Send alert message for errors or warnings"""
        TelegramManager.send_message(message)
