import os
import base64
import logging
from cryptography.fernet import Fernet
from database.db import DatabaseManager

# Import adapters
from exchanges.bitget import BitgetAdapter
from exchanges.binance import BinanceAdapter
from exchanges.bybit import BybitAdapter
from exchanges.okx import OkxAdapter
from exchanges.mexc import MexcAdapter

logger = logging.getLogger("ExchangeManager")

class ExchangeManager:
    def __init__(self, db_manager: DatabaseManager):
        self.db = db_manager
        self.current_adapter = None
        self.active_exchange_id = "bitget"
        self.encryption_key = self._get_or_create_key()
        self.cipher = Fernet(self.encryption_key)
        
        # Load the active exchange
        self.load_active_exchange()

    def _get_or_create_key(self):
        """Get encryption key from env or derive a stable one from fallback secret."""
        key = os.getenv("ENCRYPTION_KEY")
        if not key:
            # Derive a stable, valid URL-safe base64 32-byte key from API_SECRET_KEY or fallback
            fallback = os.getenv("API_SECRET_KEY", "Cybunk2.0X-AegisQuantumTradingSystemKey")
            # Pad or slice to make sure it's 32 bytes, then base64 encode
            derived = fallback.encode('utf-8').ljust(32, b'x')[:32]
            return base64.urlsafe_b64encode(derived)
        try:
            # Ensure key is valid base64
            base64.urlsafe_b64decode(key)
            return key.encode('utf-8')
        except Exception:
            derived = key.encode('utf-8').ljust(32, b'x')[:32]
            return base64.urlsafe_b64encode(derived)

    def encrypt_secret(self, raw_text: str) -> str:
        """Encrypt sensitive credentials at rest."""
        if not raw_text:
            return ""
        return self.cipher.encrypt(raw_text.encode('utf-8')).decode('utf-8')

    def decrypt_secret(self, encrypted_text: str) -> str:
        """Decrypt sensitive credentials."""
        if not encrypted_text or '********' in encrypted_text:
            return ""
        try:
            return self.cipher.decrypt(encrypted_text.encode('utf-8')).decode('utf-8')
        except Exception as e:
            logger.error(f"Decryption error: {e}")
            return encrypted_text  # Fallback to plain if not encrypted properly

    def load_active_exchange(self, paper_balance: float = 1000.0) -> bool:
        """Load and connect to the active exchange from DB settings."""
        try:
            # 1. Fetch active exchange from bot state
            self.active_exchange_id = self.db.get_bot_state("active_exchange", "bitget").lower()
            mode = self.db.get_bot_state("mode", "paper").lower()
            paper_mode = (mode == "paper" or mode == "backtest")
            
            # Save actual balance setting
            paper_balance_val = float(self.db.get_bot_state("paper_balance", paper_balance))

            logger.info(f"[EXCH_MGR] Selected Exchange: {self.active_exchange_id.upper()} | Mode: {mode.upper()}")

            # 2. Retrieve credentials if not in paper mode
            api_key, api_secret, passphrase = "", "", ""
            if not paper_mode:
                # 2.1 Retrieve from Environment Variables first
                env_prefix = self.active_exchange_id.upper()
                api_key = os.getenv(f"{env_prefix}_API_KEY") or os.getenv("BITGET_API_KEY") or ""
                api_secret = os.getenv(f"{env_prefix}_API_SECRET") or os.getenv(f"{env_prefix}_SECRET_KEY") or os.getenv("BITGET_API_SECRET") or os.getenv("BITGET_SECRET_KEY") or ""
                passphrase = os.getenv(f"{env_prefix}_PASSPHRASE") or os.getenv("BITGET_PASSPHRASE") or ""

                if "your_actual" in api_key or "your_actual" in api_secret:
                    api_key, api_secret, passphrase = "", "", ""

                # 2.2 Retrieve from dashboard bot_state if empty
                if not api_key:
                    db_k = self.db.get_bot_state(f"{self.active_exchange_id}_api_key") or self.db.get_bot_state("bitget_api_key")
                    db_s = self.db.get_bot_state(f"{self.active_exchange_id}_secret_key") or self.db.get_bot_state("bitget_secret_key")
                    db_p = self.db.get_bot_state(f"{self.active_exchange_id}_passphrase") or self.db.get_bot_state("bitget_passphrase")
                    
                    if db_k and not db_k.startswith("*****"):
                        api_key = db_k
                    if db_s and not db_s.startswith("*****"):
                        api_secret = db_s
                    if db_p and not db_p.startswith("*****"):
                        passphrase = db_p

                # 2.3 Retrieve from exchange_credentials table if still empty
                if not api_key:
                    cursor = self.db.conn.execute("""
                        SELECT api_key, api_secret, passphrase FROM exchange_credentials
                        WHERE exchange_id = ? AND is_active = 1
                        ORDER BY id DESC LIMIT 1
                    """, (self.active_exchange_id,))
                    row = cursor.fetchone()
                    if row:
                        api_key = self.decrypt_secret(row['api_key'])
                        api_secret = self.decrypt_secret(row['api_secret'])
                        passphrase = self.decrypt_secret(row['passphrase']) if row['passphrase'] else ""

            # 3. Create adapter dynamically
            adapters_map = {
                'bitget': BitgetAdapter,
                'binance': BinanceAdapter,
                'bybit': BybitAdapter,
                'okx': OkxAdapter,
                'mexc': MexcAdapter
            }
            
            adapter_cls = adapters_map.get(self.active_exchange_id, BitgetAdapter)
            
            if self.current_adapter:
                self.current_adapter.disconnect()

            self.current_adapter = adapter_cls(
                api_key=api_key,
                api_secret=api_secret,
                passphrase=passphrase,
                paper_mode=paper_mode,
                paper_balance=paper_balance_val
            )
            
            self.current_adapter.connect()
            return True
            
        except Exception as e:
            logger.error(f"[EXCH_MGR] Failed to load active exchange: {e}")
            return False

    def save_credentials(self, exchange_id: str, api_key: str, api_secret: str, passphrase: str = "") -> bool:
        """Encrypt and persist exchange credentials safely to SQLite."""
        try:
            enc_key = self.encrypt_secret(api_key)
            enc_secret = self.encrypt_secret(api_secret)
            enc_passphrase = self.encrypt_secret(passphrase) if passphrase else ""

            # Deactivate old credentials for this exchange
            self.db.execute_with_retry("""
                UPDATE exchange_credentials SET is_active = 0 WHERE exchange_id = ?
            """, (exchange_id,))

            # Insert new credentials
            self.db.execute_with_retry("""
                INSERT INTO exchange_credentials (exchange_id, api_key, api_secret, passphrase, is_active)
                VALUES (?, ?, ?, ?, 1)
            """, (exchange_id, enc_key, enc_secret, enc_passphrase))

            # Set status to active in exchanges table
            self.db.execute_with_retry("""
                UPDATE exchanges SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?
            """, (exchange_id,))
            
            logger.info(f"[EXCH_MGR] Credentials secured for {exchange_id.upper()}")
            return True
        except Exception as e:
            logger.error(f"[EXCH_MGR] Failed to save credentials: {e}")
            return False

    def switch_exchange(self, exchange_id: str) -> bool:
        """Switch the current active exchange dynamically."""
        try:
            exchange_id = exchange_id.lower()
            self.db.set_bot_state("active_exchange", exchange_id)
            self.load_active_exchange()
            return True
        except Exception as e:
            logger.error(f"[EXCH_MGR] Failed to switch exchange: {e}")
            return False

    def get_adapter(self):
        """Returns the active, connected adapter."""
        return self.current_adapter
