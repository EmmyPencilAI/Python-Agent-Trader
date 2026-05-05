import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const db = new Database('database.sqlite');

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pair TEXT,
    action TEXT,
    entry_price REAL,
    exit_price REAL,
    quantity REAL,
    pnl REAL,
    status TEXT,
    tp REAL,
    sl REAL,
    strategy TEXT,
    exchange TEXT,
    mode TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS bot_state (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS strategy_config (
    strategy_id TEXT PRIMARY KEY,
    rsi_period INTEGER DEFAULT 14,
    ema_short INTEGER DEFAULT 9,
    ema_long INTEGER DEFAULT 21,
    macd_fast INTEGER DEFAULT 12,
    macd_slow INTEGER DEFAULT 26
  );
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('running', 'stopped');
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('mode', 'paper');
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('exchange', 'binance');
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('paper_balance', '1000');
  INSERT OR IGNORE INTO strategy_config (strategy_id) VALUES ('default');
`);

// High-Frequency Trade Simulation Logic
function simulateTrade(db: any) {
  const stateRows = db.prepare('SELECT * FROM bot_state').all();
  const state: any = {};
  stateRows.forEach((row: any) => state[row.key] = row.value);

  if (state.running !== 'running') return;

  const mode = state.mode || 'paper';
  const balance = mode === 'paper' ? parseFloat(state.paper_balance || '1000') : 0;
  
  if (balance <= 0) return;

  const riskPerTrade = 0.005; // 0.5% risk
  const targetProfit = 0.15; // 15% profit goal
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT'];
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];
  const isWin = Math.random() > 0.45; // 55% win rate for the simulation
  const pnl = isWin ? (balance * targetProfit * 0.1) : -(balance * riskPerTrade); // Scaled for higher frequency

  const trade = {
    pair: symbol,
    action: Math.random() > 0.5 ? 'BUY' : 'SELL',
    entry_price: 60000 + (Math.random() * 5000),
    status: 'CLOSED',
    pnl: parseFloat(pnl.toFixed(2)),
    timestamp: new Date().toISOString()
  };

  db.prepare('INSERT INTO trades (pair, action, entry_price, status, pnl, timestamp) VALUES (?, ?, ?, ?, ?, ?)')
    .run(trade.pair, trade.action, trade.entry_price, trade.status, trade.pnl, trade.timestamp);

  if (mode === 'paper') {
    const newBalance = balance + pnl;
    db.prepare('UPDATE bot_state SET value = ? WHERE key = "paper_balance"').run(newBalance.toString());
  }
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());

  // API Middleware
  const apiKeyGuard = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.API_SECRET_KEY && process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };

  // API Routes
  app.get('/api/status', (req, res) => {
    try {
      const stateRows = db.prepare('SELECT key, value FROM bot_state').all();
      const state: any = {};
      stateRows.forEach((row: any) => state[row.key] = row.value);
      
      const config = db.prepare('SELECT * FROM strategy_config WHERE strategy_id = "default"').get();

      // Logic: Real account is empty unless we have an API key (mocking exchange check)
      const hasApiKey = process.env.BINANCE_API_KEY || process.env.BITGET_API_KEY;
      const realBalance = hasApiKey ? 12450.50 : 0.00;

      res.json({
        status: state.running || 'stopped',
        mode: state.mode || 'paper',
        exchange: state.exchange || 'binance',
        paper_balance: parseFloat(state.paper_balance || '1000'),
        real_balance: realBalance,
        active_strategy: state.active_strategy || 'Scalping Elite',
        algo_settings: config,
        uptime: '24h 15m'
      });
    } catch (err) {
      console.error('API Status Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/api/bot/strategy', apiKeyGuard, (req, res) => {
    try {
      const { rsi_period, ema_short, ema_long, macd_fast, macd_slow } = req.body;
      const stmt = db.prepare(`
        UPDATE strategy_config 
        SET rsi_period = ?, ema_short = ?, ema_long = ?, macd_fast = ?, macd_slow = ?
        WHERE strategy_id = "default"
      `);
      stmt.run(rsi_period, ema_short, ema_long, macd_fast, macd_slow);
      res.json({ success: true });
    } catch (err) {
      console.error('API Strategy Config Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/api/bot/settings', apiKeyGuard, (req, res) => {
    try {
      const { mode, exchange, paper_balance } = req.body;
      if (mode) db.prepare('UPDATE bot_state SET value = ? WHERE key = "mode"').run(mode);
      if (exchange) db.prepare('UPDATE bot_state SET value = ? WHERE key = "exchange"').run(exchange);
      if (paper_balance !== undefined) db.prepare('UPDATE bot_state SET value = ? WHERE key = "paper_balance"').run(paper_balance.toString());
      res.json({ success: true });
    } catch (err) {
      console.error('API Settings Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/trades', (req, res) => {
    try {
      const trades = db.prepare('SELECT * FROM trades ORDER BY timestamp DESC LIMIT 50').all();
      res.json(trades);
    } catch (err) {
      console.error('API Trades Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/performance', (req, res) => {
    try {
      const stats = db.prepare(`
        SELECT 
          COUNT(*) as total_trades,
          SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
          SUM(pnl) as total_pnl
        FROM trades
        WHERE status = 'CLOSED'
      `).get();
      res.json(stats);
    } catch (err) {
      console.error('API Performance Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/api/bot/toggle', apiKeyGuard, (req, res) => {
    try {
      const { action } = req.body;
      db.prepare('INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)').run('running', action);
      res.json({ success: true, status: action });
    } catch (err) {
      console.error('API Toggle Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Start periodic high-frequency trade simulation (Targets 200 trades/day goal)
  setInterval(() => simulateTrade(db), 15000); 

  // WebSocket handling
  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    
    // Simulate live data stream
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'PRICE_UPDATE',
          data: {
            BTCUSDT: 65000 + Math.random() * 100,
            ETHUSDT: 3500 + Math.random() * 10
          }
        }));
      }
    }, 2000);

    ws.on('close', () => clearInterval(interval));
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
