from exchanges.ccxt_adapter import CcxtExchangeAdapter

class BinanceAdapter(CcxtExchangeAdapter):
    def __init__(self, **kwargs):
        super().__init__(exchange_id='binance', **kwargs)
