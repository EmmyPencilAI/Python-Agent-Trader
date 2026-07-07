from exchanges.ccxt_adapter import CcxtExchangeAdapter

class BybitAdapter(CcxtExchangeAdapter):
    def __init__(self, **kwargs):
        super().__init__(exchange_id='bybit', **kwargs)
