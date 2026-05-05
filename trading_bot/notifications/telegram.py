import requests
from config import Config

class TelegramManager:
    @staticmethod
    def send_message(message):
        if not Config.TELEGRAM_BOT_TOKEN or not Config.TELEGRAM_CHAT_ID:
            print("Telegram not configured")
            return
            
        url = f"https://api.telegram.org/bot{Config.TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": Config.TELEGRAM_CHAT_ID,
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
*Entry:* {trade_data['entry']}
*TP:* {trade_data['tp']}
*SL:* {trade_data['sl']}
*Confidence:* {trade_data.get('confidence', 0)}%
"""
        TelegramManager.send_message(msg)
