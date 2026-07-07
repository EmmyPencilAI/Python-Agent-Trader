from abc import ABC, abstractmethod

class BaseExchangeAdapter(ABC):
    @abstractmethod
    def connect(self):
        pass

    @abstractmethod
    def disconnect(self):
        pass

    @abstractmethod
    def health_check(self) -> bool:
        pass

    @abstractmethod
    def validate_credentials(self) -> bool:
        pass

    @abstractmethod
    def sync_server_time(self) -> int:
        pass

    @abstractmethod
    def get_balance(self) -> dict:
        pass

    @abstractmethod
    def get_symbols(self) -> list:
        pass

    @abstractmethod
    def get_market_price(self, symbol: str) -> float:
        pass

    @abstractmethod
    def get_orderbook(self, symbol: str, limit: int = 20) -> dict:
        pass

    @abstractmethod
    def get_klines(self, symbol: str, timeframe: str = '1m', limit: int = 100) -> list:
        pass

    @abstractmethod
    def place_market_buy(self, symbol: str, quantity: float) -> dict:
        pass

    @abstractmethod
    def place_market_sell(self, symbol: str, quantity: float) -> dict:
        pass

    @abstractmethod
    def place_limit_buy(self, symbol: str, price: float, quantity: float) -> dict:
        pass

    @abstractmethod
    def place_limit_sell(self, symbol: str, price: float, quantity: float) -> dict:
        pass

    @abstractmethod
    def cancel_order(self, symbol: str, order_id: str) -> dict:
        pass

    @abstractmethod
    def cancel_all_orders(self, symbol: str) -> dict:
        pass

    @abstractmethod
    def get_order(self, symbol: str, order_id: str) -> dict:
        pass

    @abstractmethod
    def get_trade_history(self, symbol: str, limit: int = 50) -> list:
        pass

    @abstractmethod
    def get_open_orders(self, symbol: str) -> list:
        pass

    @abstractmethod
    def get_account_info(self) -> dict:
        pass

    @abstractmethod
    def subscribe_market_stream(self, callback):
        pass

    @abstractmethod
    def subscribe_private_stream(self, callback):
        pass
