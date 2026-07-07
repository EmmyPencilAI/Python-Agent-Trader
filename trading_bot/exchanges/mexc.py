from exchanges.ccxt_adapter import CcxtExchangeAdapter

class MexcAdapter(CcxtExchangeAdapter):
    def __init__(self, **kwargs):
        super().__init__(exchange_id='mexc', **kwargs)
