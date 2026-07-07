import ccxt
import time
import threading
import logging
from exchanges.base import BaseExchangeAdapter

logger = logging.getLogger("AegisExchange")

class CcxtExchangeAdapter(BaseExchangeAdapter):
    def __init__(self, exchange_id: str, api_key: str = "", api_secret: str = "", passphrase: str = "", paper_mode: bool = True, paper_balance: float = 1000.0):
        self.exchange_id = exchange_id.lower()
        self.api_key = api_key
        self.api_secret = api_secret
        self.passphrase = passphrase
        self.paper_mode = paper_mode
        self.paper_balance = paper_balance
        self.client = None
        self.is_connected = False
        self._streams = []
        self._stream_threads = []
        self._stream_running = False

    def connect(self):
        if self.paper_mode:
            logger.info(f"Connecting to {self.exchange_id} in VIRTUAL / PAPER mode.")
            self.is_connected = True
            return True

        logger.info(f"Initializing real ccxt.{self.exchange_id} connection.")
        # Load exchange class dynamically
        try:
            exchange_class = getattr(ccxt, self.exchange_id)
        except AttributeError:
            raise ValueError(f"Exchange {self.exchange_id} not supported by CCXT.")

        config = {
            'apiKey': self.api_key,
            'secret': self.api_secret,
            'enableRateLimit': True,
        }
        if self.passphrase:
            config['password'] = self.passphrase

        # Specific adjustments for different exchanges
        if self.exchange_id == 'bitget':
            config['options'] = {'defaultType': 'spot', 'adjustForTimeDifference': True}
        elif self.exchange_id == 'binance':
            config['options'] = {'adjustForTimeDifference': True}
        elif self.exchange_id == 'bybit':
            config['options'] = {'adjustForTimeDifference': True}
        elif self.exchange_id == 'okx':
            config['options'] = {'defaultType': 'spot'}

        self.client = exchange_class(config)
        self.client.load_markets()
        self.is_connected = True
        return True

    def disconnect(self):
        self._stream_running = False
        self.is_connected = False
        logger.info(f"Disconnected from {self.exchange_id}.")

    def health_check(self) -> bool:
        if self.paper_mode:
            return True
        try:
            if not self.client:
                return False
            self.client.fetch_time()
            return True
        except Exception as e:
            logger.error(f"Health check failed for {self.exchange_id}: {e}")
            return False

    def validate_credentials(self) -> bool:
        if self.paper_mode:
            return True
        try:
            if not self.client:
                self.connect()
            self.client.fetch_balance()
            return True
        except Exception as e:
            logger.error(f"Credential validation failed for {self.exchange_id}: {e}")
            return False

    def sync_server_time(self) -> int:
        if self.paper_mode:
            return int(time.time() * 1000)
        try:
            return self.client.fetch_time()
        except Exception as e:
            logger.error(f"Failed to sync server time: {e}")
            return int(time.time() * 1000)

    def get_balance(self) -> dict:
        if self.paper_mode:
            return {
                'total': {'USDT': self.paper_balance},
                'free': {'USDT': self.paper_balance},
                'used': {'USDT': 0.0}
            }
        try:
            raw_bal = self.client.fetch_balance()
            # Clean/Standardize balance formatting
            balance = {'total': {}, 'free': {}, 'used': {}}
            for currency in ['USDT', 'BTC', 'ETH', 'SOL']:
                if currency in raw_bal:
                    balance['total'][currency] = float(raw_bal[currency].get('total', 0.0))
                    balance['free'][currency] = float(raw_bal[currency].get('free', 0.0))
                    balance['used'][currency] = float(raw_bal[currency].get('used', 0.0))
                else:
                    balance['total'][currency] = 0.0
                    balance['free'][currency] = 0.0
                    balance['used'][currency] = 0.0
            return balance
        except Exception as e:
            logger.error(f"Failed to fetch balance from {self.exchange_id}: {e}")
            raise e

    def get_symbols(self) -> list:
        if self.paper_mode:
            return ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "ADA/USDT"]
        try:
            markets = self.client.load_markets()
            return [symbol for symbol in markets.keys() if '/USDT' in symbol]
        except Exception as e:
            logger.error(f"Failed to fetch symbols: {e}")
            return ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "ADA/USDT"]

    def get_market_price(self, symbol: str) -> float:
        if self.paper_mode:
            # Fallback ticker fetch from public endpoints
            try:
                # Polling public CCXT ticker is safe in paper mode
                if not self.client:
                    self.client = getattr(ccxt, self.exchange_id)()
                ticker = self.client.fetch_ticker(symbol)
                return float(ticker['last'])
            except Exception:
                # Offline hardcoded fallbacks
                prices = {'BTC/USDT': 65200.0, 'ETH/USDT': 3450.0, 'SOL/USDT': 142.5, 'BNB/USDT': 580.0, 'ADA/USDT': 0.45}
                return prices.get(symbol, 1.0)
        try:
            ticker = self.client.fetch_ticker(symbol)
            return float(ticker['last'])
        except Exception as e:
            logger.error(f"Failed to fetch market price for {symbol}: {e}")
            raise e

    def get_orderbook(self, symbol: str, limit: int = 20) -> dict:
        try:
            if self.paper_mode and not self.client:
                self.client = getattr(ccxt, self.exchange_id)()
            return self.client.fetch_order_book(symbol, limit)
        except Exception as e:
            logger.error(f"Failed to fetch order book: {e}")
            return {'bids': [], 'asks': []}

    def get_klines(self, symbol: str, timeframe: str = '1m', limit: int = 100) -> list:
        try:
            # Public ccxt client is fine for klines
            client = self.client if self.client else getattr(ccxt, self.exchange_id)()
            ohlcv = client.fetch_ohlcv(symbol, timeframe, limit=limit)
            return ohlcv
        except Exception as e:
            logger.error(f"Failed to fetch klines for {symbol}: {e}")
            return []

    def place_market_buy(self, symbol: str, quantity: float) -> dict:
        if self.paper_mode:
            price = self.get_market_price(symbol)
            order_id = f"paper-buy-{int(time.time() * 1000)}"
            logger.info(f"[PAPER ORDER] Market BUY {quantity} {symbol} at {price}")
            return {
                'id': order_id,
                'symbol': symbol,
                'side': 'buy',
                'type': 'market',
                'price': price,
                'amount': quantity,
                'status': 'closed',
                'filled': quantity,
                'timestamp': int(time.time() * 1000)
            }
        try:
            order = self.client.create_market_buy_order(symbol, quantity)
            return order
        except Exception as e:
            logger.error(f"Market BUY failed: {e}")
            raise e

    def place_market_sell(self, symbol: str, quantity: float) -> dict:
        if self.paper_mode:
            price = self.get_market_price(symbol)
            order_id = f"paper-sell-{int(time.time() * 1000)}"
            logger.info(f"[PAPER ORDER] Market SELL {quantity} {symbol} at {price}")
            return {
                'id': order_id,
                'symbol': symbol,
                'side': 'sell',
                'type': 'market',
                'price': price,
                'amount': quantity,
                'status': 'closed',
                'filled': quantity,
                'timestamp': int(time.time() * 1000)
            }
        try:
            order = self.client.create_market_sell_order(symbol, quantity)
            return order
        except Exception as e:
            logger.error(f"Market SELL failed: {e}")
            raise e

    def place_limit_buy(self, symbol: str, price: float, quantity: float) -> dict:
        if self.paper_mode:
            order_id = f"paper-limit-buy-{int(time.time() * 1000)}"
            return {
                'id': order_id,
                'symbol': symbol,
                'side': 'buy',
                'type': 'limit',
                'price': price,
                'amount': quantity,
                'status': 'open',
                'filled': 0.0,
                'timestamp': int(time.time() * 1000)
            }
        try:
            order = self.client.create_limit_buy_order(symbol, quantity, price)
            return order
        except Exception as e:
            logger.error(f"Limit BUY failed: {e}")
            raise e

    def place_limit_sell(self, symbol: str, price: float, quantity: float) -> dict:
        if self.paper_mode:
            order_id = f"paper-limit-sell-{int(time.time() * 1000)}"
            return {
                'id': order_id,
                'symbol': symbol,
                'side': 'sell',
                'type': 'limit',
                'price': price,
                'amount': quantity,
                'status': 'open',
                'filled': 0.0,
                'timestamp': int(time.time() * 1000)
            }
        try:
            order = self.client.create_limit_sell_order(symbol, quantity, price)
            return order
        except Exception as e:
            logger.error(f"Limit SELL failed: {e}")
            raise e

    def cancel_order(self, symbol: str, order_id: str) -> dict:
        if self.paper_mode:
            return {'id': order_id, 'status': 'canceled'}
        try:
            return self.client.cancel_order(order_id, symbol)
        except Exception as e:
            logger.error(f"Failed to cancel order: {e}")
            raise e

    def cancel_all_orders(self, symbol: str) -> dict:
        if self.paper_mode:
            return {'status': 'all canceled'}
        try:
            if hasattr(self.client, 'cancel_all_orders'):
                return self.client.cancel_all_orders(symbol)
            else:
                orders = self.get_open_orders(symbol)
                for order in orders:
                    self.cancel_order(symbol, order['id'])
                return {'status': 'all canceled'}
        except Exception as e:
            logger.error(f"Failed to cancel all orders: {e}")
            raise e

    def get_order(self, symbol: str, order_id: str) -> dict:
        if self.paper_mode:
            return {'id': order_id, 'symbol': symbol, 'status': 'closed', 'filled': 1.0}
        try:
            return self.client.fetch_order(order_id, symbol)
        except Exception as e:
            logger.error(f"Failed to fetch order: {e}")
            raise e

    def get_trade_history(self, symbol: str, limit: int = 50) -> list:
        if self.paper_mode:
            return []
        try:
            return self.client.fetch_my_trades(symbol, limit=limit)
        except Exception as e:
            logger.error(f"Failed to fetch trade history: {e}")
            return []

    def get_open_orders(self, symbol: str) -> list:
        if self.paper_mode:
            return []
        try:
            return self.client.fetch_open_orders(symbol)
        except Exception as e:
            logger.error(f"Failed to fetch open orders: {e}")
            return []

    def get_account_info(self) -> dict:
        if self.paper_mode:
            return {'status': 'active', 'mode': 'paper', 'exchange': self.exchange_id}
        try:
            return self.client.fetch_status() if hasattr(self.client, 'fetch_status') else {'status': 'ok'}
        except Exception as e:
            logger.error(f"Failed to fetch account info: {e}")
            return {'status': 'error', 'error': str(e)}

    # Stream Subscriptions (using a background thread to call callbacks on dynamic ticker changes)
    def subscribe_market_stream(self, callback):
        self._stream_running = True
        def poll_loop():
            logger.info(f"[STREAM] Starting market stream simulation thread for {self.exchange_id}")
            symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
            while self._stream_running:
                for symbol in symbols:
                    try:
                        price = self.get_market_price(symbol)
                        callback({
                            'event': 'ticker',
                            'symbol': symbol,
                            'price': price,
                            'timestamp': int(time.time() * 1000)
                        })
                    except Exception:
                        pass
                time.sleep(2)  # Update stream every 2 seconds
        
        t = threading.Thread(target=poll_loop, daemon=True)
        t.start()
        self._stream_threads.append(t)

    def subscribe_private_stream(self, callback):
        self._stream_running = True
        def poll_loop():
            logger.info(f"[STREAM] Starting private stream simulation thread for {self.exchange_id}")
            while self._stream_running:
                try:
                    if not self.paper_mode:
                        bal = self.get_balance()
                        callback({
                            'event': 'balance',
                            'exchange_id': self.exchange_id,
                            'balance': bal,
                            'timestamp': int(time.time() * 1000)
                        })
                except Exception:
                    pass
                time.sleep(10)  # Update private metrics every 10 seconds
        
        t = threading.Thread(target=poll_loop, daemon=True)
        t.start()
        self._stream_threads.append(t)
