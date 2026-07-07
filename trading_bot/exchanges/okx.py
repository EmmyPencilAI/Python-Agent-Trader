from exchanges.ccxt_adapter import CcxtExchangeAdapter

class OkxAdapter(CcxtExchangeAdapter):
    def __init__(self, **kwargs):
        super().__init__(exchange_id='okx', **kwargs)
