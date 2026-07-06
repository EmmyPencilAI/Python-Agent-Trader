def extract_usdt_balance(balance_payload):
    if not balance_payload:
        return 0.0

    if isinstance(balance_payload, dict):
        for key in ("USDT", "usdt"):
            value = balance_payload.get(key)
            if isinstance(value, dict):
                total = value.get("total")
                free = value.get("free")
                if total is not None:
                    return float(total)
                if free is not None:
                    return float(free)

        info = balance_payload.get("info")
        if isinstance(info, dict):
            total_equity = info.get("totalEquity")
            if total_equity is not None:
                return float(total_equity)

            usdt_equity = info.get("usdtEquity")
            if usdt_equity is not None:
                return float(usdt_equity)

            data = info.get("data")
            if isinstance(data, list):
                for asset in data:
                    if isinstance(asset, dict):
                        coin_name = asset.get("coinName") or asset.get("coin") or asset.get("currency") or asset.get("asset")
                        if str(coin_name).upper() == "USDT":
                            total = asset.get("balance") or asset.get("total") or asset.get("available")
                            free = asset.get("available") or asset.get("free") or asset.get("equity")
                            if total is not None:
                                return float(total)
                            if free is not None:
                                return float(free)

        if isinstance(info, list):
            for asset in info:
                if isinstance(asset, dict):
                    coin_name = asset.get("coinName") or asset.get("coin") or asset.get("currency") or asset.get("asset")
                    if str(coin_name).upper() == "USDT":
                        total = asset.get("balance") or asset.get("total") or asset.get("available")
                        free = asset.get("available") or asset.get("free") or asset.get("equity")
                        if total is not None:
                            return float(total)
                        if free is not None:
                            return float(free)

    return 0.0
