from exchanges.ccxt_adapter import CcxtExchangeAdapter

class BitgetAdapter(CcxtExchangeAdapter):
    def __init__(self, **kwargs):
        super().__init__(exchange_id='bitget', **kwargs)
