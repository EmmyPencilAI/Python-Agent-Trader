import logging
from datetime import datetime
from database.db import DatabaseManager

logger = logging.getLogger("AegisSelfLearning")

class SelfLearningFeedbackLoop:
    def __init__(self, db_manager: DatabaseManager):
        self.db = db_manager

    def resolve_predictions(self, exchange_adapter):
        """Reconcile previous AI predictions with actual market results to refine models."""
        try:
            # Fetch outstanding unresolved predictions (unresolved predictions have actual_result is NULL)
            cursor = self.db.conn.execute("""
                SELECT id, symbol, predicted_direction, timestamp FROM ai_predictions
                WHERE actual_result IS NULL
                ORDER BY timestamp ASC LIMIT 50
            """)
            unresolved = cursor.fetchall()
            
            if not unresolved:
                return

            logger.info(f"[SELF-LEARNING] Resolving {len(unresolved)} pending AI predictions...")
            
            for pred in unresolved:
                pred_id = pred['id']
                symbol = pred['symbol']
                predicted = pred['predicted_direction']
                
                # Fetch recent market prices (e.g. klines or market price) to see actual movement
                # We can fetch 5m/15m klines to find the price movement since prediction timestamp
                try:
                    klines = exchange_adapter.get_klines(symbol, timeframe='1m', limit=5)
                    if not klines or len(klines) < 2:
                        continue
                        
                    start_price = float(klines[0][4]) # Close of the oldest candle in set
                    end_price = float(klines[-1][4])   # Close of the newest candle
                    
                    price_change = end_price - start_price
                    pct_change = (price_change / start_price) * 100.0 if start_price > 0 else 0.0
                    
                    actual = 'NEUTRAL'
                    if pct_change > 0.05:
                        actual = 'UP'
                    elif pct_change < -0.05:
                        actual = 'DOWN'
                        
                    error_margin = abs(pct_change)
                    
                    # Log resolved prediction
                    self.db.execute_with_retry("""
                        UPDATE ai_predictions
                        SET actual_result = ?, error_margin = ?
                        WHERE id = ?
                    """, (actual, error_margin, pred_id))
                    
                    logger.debug(f"[SELF-LEARNING] Pred #{pred_id} ({symbol}): Predicted={predicted} | Actual={actual} | Error={error_margin:.4f}%")
                except Exception as e:
                    logger.warning(f"Failed to resolve prediction {pred_id}: {e}")
                    
        except Exception as err:
            logger.error(f"Self-learning resolution loop error: {err}")
