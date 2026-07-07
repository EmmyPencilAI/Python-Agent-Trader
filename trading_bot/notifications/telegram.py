import requests
import sqlite3
import logging
from config import Config

logger = logging.getLogger("AegisTelegram")

class TelegramManager:
    @staticmethod
    def _get_config():
        try:
            # Connect directly using the configured database
            conn = sqlite3.connect(Config.DATABASE_NAME)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Retrieve Telegram configs
            token_row = cursor.execute("SELECT value FROM bot_state WHERE key = 'telegram_bot_token'").fetchone()
            chat_id_row = cursor.execute("SELECT value FROM bot_state WHERE key = 'telegram_chat_id'").fetchone()
            conn.close()
            
            token_val = token_row[0] if token_row else None
            chat_id_val = chat_id_row[0] if chat_id_row else None
            
            token = token_val if (token_val and '********' not in str(token_val)) else Config.TELEGRAM_BOT_TOKEN
            chat_id = chat_id_val if (chat_id_val and '********' not in str(chat_id_val)) else Config.TELEGRAM_CHAT_ID
            return token, chat_id
        except Exception as e:
            logger.error(f"Error loading Telegram settings from DB: {e}")
            return Config.TELEGRAM_BOT_TOKEN, Config.TELEGRAM_CHAT_ID

    @staticmethod
    def validate_telegram_settings(token: str, chat_id: str) -> bool:
        """Verify real Telegram Bot Token and Chat ID connection."""
        if not token or not chat_id:
            return False
        url = f"https://api.telegram.org/bot{token}/getChat"
        try:
            res = requests.post(url, json={"chat_id": chat_id}, timeout=10.0)
            if res.status_code == 200:
                data = res.json()
                return data.get('ok', False)
            return False
        except Exception as e:
            logger.error(f"Telegram verification failed: {e}")
            return False

    @staticmethod
    def send_message(message: str) -> bool:
        """Send a real-time Markdown-formatted Telegram notification with response verification."""
        token, chat_id = TelegramManager._get_config()
        if not token or not chat_id or 'your_actual' in str(token):
            logger.warning("[TELEGRAM] Message skipped: Credentials not fully configured.")
            return False
            
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "Markdown"
        }
        
        try:
            res = requests.post(url, json=payload, timeout=10.0)
            if res.status_code == 200:
                logger.info("[TELEGRAM] Message delivered successfully!")
                return True
            else:
                logger.error(f"[TELEGRAM] Delivery failure: Code {res.status_code} | {res.text}")
                return False
        except Exception as e:
            logger.error(f"[TELEGRAM] Connection error during send: {e}")
            return False

    @staticmethod
    def send_trade_alert(trade_data: dict):
        """Dispatches an institutional trade alert layout to the Telegram channel."""
        side_emoji = "🟢" if "buy" in trade_data.get('action', 'buy').lower() else "🔴"
        msg = f"""
{side_emoji} *AEGIS QUANTUM EXECUTION*
━━━━━━━━━━━━━━━━━━━━
*Pair:* `{trade_data.get('symbol', 'BTC/USDT')}`
*Action:* `{trade_data.get('action', 'BUY').upper()}`
*Sizing:* `{trade_data.get('quantity', 0.05)}`
*Entry Price:* `${trade_data.get('entry', 0.0):,.2f}`
*Take Profit (TP):* `${trade_data.get('tp', 0.0):,.2f}`
*Stop Loss (SL):* `${trade_data.get('sl', 0.0):,.2f}`
*Strategy:* `{trade_data.get('strategy', 'Scalping').upper()}`
*AI Confidence:* `{trade_data.get('confidence', 75.0):.1f}%`
*Time:* `{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} UTC`
━━━━━━━━━━━━━━━━━━━━
_Aegis Core active in {trade_data.get('mode', 'paper').upper()} mode._
"""
        TelegramManager.send_message(msg)
