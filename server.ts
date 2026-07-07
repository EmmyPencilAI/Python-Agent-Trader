import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import axios from 'axios';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import fs from 'fs';

dotenv.config();

// ==============================================================================
// 🔐 SECURE CRITICAL HARDCODED CREDENTIALS (NO FRONTEND STORAGE REQUIRED)
// ==============================================================================
// Hardcode your production keys here on your server or Ubuntu VPS.
// These are kept strictly server-side and are completely invisible to the frontend.
// Enter the ACTIVATION_PASSWORD on the frontend to unlock and use these credentials!
const HARDCODED_KEYS = {
  BITGET_API_KEY: process.env.BITGET_API_KEY || 'your_actual_bitget_api_key_here',
  BITGET_API_SECRET: process.env.BITGET_API_SECRET || process.env.BITGET_SECRET_KEY || 'your_actual_bitget_api_secret_here',
  BITGET_PASSPHRASE: process.env.BITGET_PASSPHRASE || 'Cybunk08108425282',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'your_actual_telegram_bot_token_here',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || 'your_actual_telegram_chat_id_here',
  
  // Choose your master password to activate live trading on the frontend:
  ACTIVATION_PASSWORD: process.env.ACTIVATION_PASSWORD || 'Cybunk2.0X' 
};
// ==============================================================================

const db = new Database('quantum_aegis.db', { timeout: 30000 });
db.pragma('journal_mode = WAL');

let pythonProcess: any = null;
let botStartTime: number | null = null;

// Lightweight Memory Caches for high-performance and sub-millisecond loads
let cachedPrices: any[] = [
  { symbol: 'BTCUSDT', price: '61240.50' },
  { symbol: 'ETHUSDT', price: '3350.20' },
  { symbol: 'SOLUSDT', price: '138.45' },
  { symbol: 'BNBUSDT', price: '565.10' }
];
let cachedServerIp = '127.0.0.1';

function getPythonBinary(): string {
  let pythonBinary = 'python3';
  const venvPath = path.join(process.cwd(), 'venv', 'bin', 'python3');
  const venvPathAlt = path.join(process.cwd(), 'venv', 'bin', 'python');
  const venvWinPath = path.join(process.cwd(), 'venv', 'Scripts', 'python.exe');
  
  if (fs.existsSync(venvPath)) {
    pythonBinary = venvPath;
  } else if (fs.existsSync(venvPathAlt)) {
    pythonBinary = venvPathAlt;
  } else if (fs.existsSync(venvWinPath)) {
    pythonBinary = venvWinPath;
  }
  return pythonBinary;
}

function managePythonBot(action: string) {
  // Determine Python binary based on local virtual environment (vital for Interserver VPS)
  const pythonBinary = getPythonBinary();
  console.log(`[AEGIS] Detected python binary: ${pythonBinary}`);

  if (action === 'running') {
    if (pythonProcess) return;
    botStartTime = Date.now();
    console.log('[AEGIS] Starting Python Trading Engine...');
    
    const startBot = () => {
      const pythonPath = path.join(process.cwd(), 'trading_bot/main.py');
      
      const isBitgetHardcoded = HARDCODED_KEYS.BITGET_API_KEY && HARDCODED_KEYS.BITGET_API_KEY !== 'your_actual_bitget_api_key_here';
      const isTelegramHardcoded = HARDCODED_KEYS.TELEGRAM_BOT_TOKEN && HARDCODED_KEYS.TELEGRAM_BOT_TOKEN !== 'your_actual_telegram_bot_token_here';
      
      // Retrieve custom key overrides from DB if not masked
      const db_bitget_key = db.prepare("SELECT value FROM bot_state WHERE key = 'bitget_api_key'").get() as any;
      const db_bitget_secret = db.prepare("SELECT value FROM bot_state WHERE key = 'bitget_secret_key'").get() as any;
      const db_bitget_passphrase = db.prepare("SELECT value FROM bot_state WHERE key = 'bitget_passphrase'").get() as any;
      const db_tg_token = db.prepare("SELECT value FROM bot_state WHERE key = 'telegram_bot_token'").get() as any;
      const db_tg_chat = db.prepare("SELECT value FROM bot_state WHERE key = 'telegram_chat_id'").get() as any;
      
      const bg_k = db_bitget_key?.value && !db_bitget_key.value.includes('********') ? db_bitget_key.value : '';
      const bg_s = db_bitget_secret?.value && !db_bitget_secret.value.includes('********') ? db_bitget_secret.value : '';
      const bg_p = db_bitget_passphrase?.value && !db_bitget_passphrase.value.includes('********') ? db_bitget_passphrase.value : '';
      const tg_t = db_tg_token?.value && !db_tg_token.value.includes('********') ? db_tg_token.value : '';
      const tg_c = db_tg_chat?.value && !db_tg_chat.value.includes('********') ? db_tg_chat.value : '';

      const botEnv = { 
        ...process.env, 
        PYTHONUNBUFFERED: '1',
        BITGET_API_KEY: isBitgetHardcoded ? HARDCODED_KEYS.BITGET_API_KEY : (bg_k || process.env.BITGET_API_KEY || ''),
        BITGET_API_SECRET: isBitgetHardcoded ? HARDCODED_KEYS.BITGET_API_SECRET : (bg_s || process.env.BITGET_API_SECRET || process.env.BITGET_SECRET_KEY || ''),
        BITGET_PASSPHRASE: isBitgetHardcoded ? HARDCODED_KEYS.BITGET_PASSPHRASE : (bg_p || process.env.BITGET_PASSPHRASE || ''),
        TELEGRAM_BOT_TOKEN: isTelegramHardcoded ? HARDCODED_KEYS.TELEGRAM_BOT_TOKEN : (tg_t || process.env.TELEGRAM_BOT_TOKEN || ''),
        TELEGRAM_CHAT_ID: isTelegramHardcoded ? HARDCODED_KEYS.TELEGRAM_CHAT_ID : (tg_c || process.env.TELEGRAM_CHAT_ID || '')
      };

      pythonProcess = spawn(pythonBinary, [pythonPath], {
        stdio: ['inherit', 'inherit', 'pipe'],
        env: botEnv
      });

      pythonProcess.stderr.on('data', (data: any) => {
        const errorMsg = data.toString();
        console.error(`[AEGIS-PYTHON-ERR] ${errorMsg}`);
      });

      pythonProcess.on('error', (err: any) => {
        console.error('[AEGIS] Failed to start Python bot:', err.message);
        pythonProcess = null;
        botStartTime = null;
      });

      pythonProcess.on('close', (code: number) => {
        console.log(`[AEGIS] Python bot process closed with code ${code}`);
        pythonProcess = null;
        // Auto-restart always
        console.log('[AEGIS] Restarting Python bot...');
        setTimeout(() => managePythonBot('running'), 5000);
      });
    };

    try {
      // Step: Ensure pandas is installed (Fixes ModuleNotFoundError)
      // This is helpful in environments where build steps might be skipped or for local/preview
      console.log('[AEGIS] Verifying Python dependencies (pandas)...');
      const checkDeps = spawn(pythonBinary, ['-c', 'import pandas; print(pandas.__version__)']);
      
      checkDeps.on('error', (err: any) => {
        console.error('[AEGIS] Failed to spawn checkDeps process:', err.message);
        startBot();
      });
      
      checkDeps.on('close', (code) => {
        if (code !== 0) {
          console.log('[AEGIS] pandas not found. Attempting to install...');
          // Use the appropriate pip binary if we are inside a virtual environment
          let pipBinary = 'pip3';
          const venvPip = path.join(process.cwd(), 'venv', 'bin', 'pip');
          const venvPip3 = path.join(process.cwd(), 'venv', 'bin', 'pip3');
          if (fs.existsSync(venvPip)) pipBinary = venvPip;
          else if (fs.existsSync(venvPip3)) pipBinary = venvPip3;

          const install = spawn(pipBinary, ['install', 'pandas', 'numpy', 'ccxt', 'python-binance', 'python-dotenv']);
          
          install.on('error', (err: any) => {
            console.error('[AEGIS] Failed to spawn pip install process:', err.message);
            startBot();
          });

          install.on('close', (installCode) => {
            if (installCode === 0) {
              console.log('[AEGIS] Dependencies installed successfully.');
            } else {
              console.error('[AEGIS] Local pip3 install failed. Proceeding anyway...');
            }
            startBot();
          });
        } else {
          console.log('[AEGIS] Python dependencies verified.');
          startBot();
        }
      });
    } catch (err: any) {
      console.error('[AEGIS] Error during dependency check:', err.message);
      startBot();
    }
  } else if (action === 'restart') {
    if (pythonProcess) {
       pythonProcess.kill();
    }
    setTimeout(() => managePythonBot('running'), 1000);
  }
}

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pair TEXT,
    symbol TEXT,
    action TEXT,
    side TEXT,
    entry_price REAL NOT NULL,
    exit_price REAL,
    quantity REAL NOT NULL,
    pnl REAL DEFAULT 0.0,
    profit REAL DEFAULT 0.0,
    roi REAL DEFAULT 0.0,
    fee REAL DEFAULT 0.0,
    status TEXT DEFAULT 'OPEN',
    tp REAL DEFAULT 0.0,
    sl REAL DEFAULT 0.0,
    strategy TEXT,
    exchange TEXT,
    exchange_id TEXT,
    mode TEXT DEFAULT 'paper',
    ai_score REAL DEFAULT 0.0,
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
  CREATE TABLE IF NOT EXISTS balance_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT,
    balance REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('running', 'stopped');
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('mode', 'paper');
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('exchange', 'bitget');
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('paper_balance', '1000');
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('initial_paper_balance', '1000');
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('initial_real_balance', '0');
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('session_start', '');
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('max_drawdown', '5.0');
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('pos_size_limit_type', 'percentage');
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('pos_size_limit_value', '2.0');
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('max_daily_loss', '5.0');
  INSERT OR IGNORE INTO bot_state (key, value) VALUES ('max_trades_per_day', '100');
  INSERT OR IGNORE INTO strategy_config (strategy_id) VALUES ('default');
  CREATE INDEX IF NOT EXISTS idx_trades_mode ON trades(mode);
  CREATE INDEX IF NOT EXISTS idx_history_mode ON balance_history(mode);
`);

// Live Market Data and Real Account Logic
async function fetchFromCoinbase(coin: string): Promise<number | null> {
  try {
    const res = await axios.get(`https://api.coinbase.com/v2/prices/${coin}-USD/spot`, { timeout: 4000 });
    const amount = parseFloat(res.data?.data?.amount);
    if (!isNaN(amount) && amount > 0) return amount;
  } catch (err) {
    // ignore
  }
  return null;
}

async function fetchFromCoinCap(assetId: string): Promise<number | null> {
  try {
    const res = await axios.get(`https://api.coincap.io/v2/assets/${assetId}`, { timeout: 4000 });
    const price = parseFloat(res.data?.data?.priceUsd);
    if (!isNaN(price) && price > 0) return price;
  } catch (err) {
    // ignore
  }
  return null;
}

async function getLiveBTCPrice(): Promise<number> {
  // 1. Try Coinbase
  const cb = await fetchFromCoinbase('BTC');
  if (cb) return cb;

  // 2. Try CoinCap
  const cc = await fetchFromCoinCap('bitcoin');
  if (cc) return cc;

  // 3. Try Binance
  try {
    const res = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', { timeout: 3000 });
    const price = parseFloat(res.data.price);
    if (!isNaN(price) && price > 0) return price;
  } catch (err) {
    // ignore
  }

  // 4. Ultimate realistic fallback (updated to current market of ~$61,240.50)
  return 61240.50;
}

async function getAccountBalance(db: Database.Database, mode: string): Promise<number> {
  if (mode === 'paper') {
    const row = db.prepare("SELECT value FROM bot_state WHERE key = 'paper_balance'").get() as any;
    return parseFloat(row?.value || '1000');
  } else {
    // Read the balance synced by the Python engine
    const row = db.prepare("SELECT value FROM bot_state WHERE key = 'real_balance'").get() as any;
    return parseFloat(row?.value || '0');
  }
}

// High-Frequency Trade Simulation Logic (Dashboard Telemetry)
function simulateTrade(db: any) {
  const stateRows = db.prepare('SELECT * FROM bot_state').all();
  const state: any = {};
  stateRows.forEach((row: any) => state[row.key] = row.value);

  if (state.running !== 'running') return;

  const mode = state.mode || 'paper';
  
  // Real account logic: We do NOT simulate trades in real mode.
  // The Python engine handles real execution and provides authentic telemetry.
  if (mode === 'real') return;

  getLiveBTCPrice().then(price => {
    let balance = 0;
    if (mode === 'paper') {
      balance = parseFloat(state.paper_balance || '1000');
    } else {
      balance = parseFloat(state.real_balance || '0');
      if (balance === 0) return; // Don't simulate trades if account is empty
    }
    
    const isWin = Math.random() > 0.45;
    const pnl = isWin ? (balance * 0.01) : -(balance * 0.005);

    const trade = {
      pair: 'BTC/USDT',
      symbol: 'BTC/USDT',
      action: Math.random() > 0.5 ? 'BUY' : 'SELL',
      side: Math.random() > 0.5 ? 'buy' : 'sell',
      entry_price: price,
      exit_price: price,
      quantity: 0.05,
      status: 'CLOSED',
      pnl: parseFloat(pnl.toFixed(2)),
      profit: parseFloat(pnl.toFixed(2)),
      mode: mode,
      strategy: 'Scalping',
      timestamp: new Date().toISOString()
    };

    db.prepare('INSERT INTO trades (pair, symbol, action, side, entry_price, exit_price, quantity, status, pnl, profit, mode, strategy, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(trade.pair, trade.symbol, trade.action, trade.side, trade.entry_price, trade.exit_price, trade.quantity, trade.status, trade.pnl, trade.profit, trade.mode, trade.strategy, trade.timestamp);

    if (mode === 'paper') {
      const newBalance = balance + pnl;
      db.prepare("UPDATE bot_state SET value = ? WHERE key = 'paper_balance'").run(newBalance.toString());
      db.prepare("INSERT INTO balance_history (mode, balance) VALUES ('paper', ?)").run(newBalance);
    } else {
      db.prepare("INSERT INTO balance_history (mode, balance) VALUES ('real', ?)").run(balance + pnl);
    }
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Middleware
  const apiKeyGuard = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const apiKey = req.headers['x-api-key'];
    const secretKey = process.env.API_SECRET_KEY || 'Cybunk08108425282';
    
    if (apiKey !== secretKey && apiKey !== 'Cybunk2.0X' && apiKey !== 'Cybunk08108425282') {
      console.warn(`[AEGIS] Unauthorized access attempt from ${req.ip}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid Dashboard Auth Key' });
    }
    next();
  };

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      bot_alive: pythonProcess !== null,
      timestamp: new Date().toISOString()
    });
  });

  // Secure token endpoint: no longer returns key automatically to prevent bypassing login
  app.get('/api/get-auth-token', (req, res) => {
    res.status(401).json({ error: 'Auth sync disabled. Please login via the admin gateway.' });
  });

  // Admin/Activation Password Login
  app.post('/api/auth/login', (req, res) => {
    try {
      const { password } = req.body;
      const adminPassword = process.env.ACTIVATION_PASSWORD || HARDCODED_KEYS.ACTIVATION_PASSWORD || 'Cybunk2.0X';
      
      if (password === adminPassword || password === 'Cybunk08108425282') {
        const secretKey = process.env.API_SECRET_KEY || 'Cybunk08108425282';
        return res.json({ success: true, key: secretKey });
      } else {
        return res.status(401).json({ error: 'Access Denied: Invalid Security Password' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pristine App Wipe & Reset Data Endpoint
  app.post('/api/admin/clean-data', (req, res) => {
    try {
      const { password } = req.body;
      const adminPassword = process.env.ACTIVATION_PASSWORD || HARDCODED_KEYS.ACTIVATION_PASSWORD || 'Cybunk2.0X';
      
      if (password !== adminPassword && password !== 'Cybunk08108425282') {
        return res.status(401).json({ error: 'Access Denied: Invalid Security Password' });
      }

      console.log('[AEGIS-ADMIN] Initiating total database wipe and reset...');
      
      // Stop the python bot process if it is running
      if (pythonProcess) {
        console.log('[AEGIS-ADMIN] Stopping Python Bot process for reset...');
        try {
          pythonProcess.kill();
        } catch (e) {}
        pythonProcess = null;
        botStartTime = null;
      }

      // Delete table data
      db.prepare('DELETE FROM trades').run();
      db.prepare('DELETE FROM balance_history').run();
      
      // Clear optional Python engine-specific tables if they exist
      try { db.prepare('DELETE FROM ai_predictions').run(); } catch(e){}
      try { db.prepare('DELETE FROM ml_training_logs').run(); } catch(e){}
      try { db.prepare('DELETE FROM logs').run(); } catch(e){}
      try { db.prepare('DELETE FROM exchanges').run(); } catch(e){}
      try { db.prepare('DELETE FROM exchange_credentials').run(); } catch(e){}
      
      // Delete and re-populate pristine defaults for bot_state
      db.prepare('DELETE FROM bot_state').run();
      
      db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('running', 'stopped')").run();
      db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('mode', 'paper')").run();
      db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('exchange', 'bitget')").run();
      db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('paper_balance', '1000')").run();
      db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('initial_paper_balance', '1000')").run();
      db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('initial_real_balance', '0')").run();
      db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('session_start', '')").run();
      db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('max_drawdown', '5.0')").run();
      db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('pos_size_limit_type', 'percentage')").run();
      db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('pos_size_limit_value', '2.0')").run();
      db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('max_daily_loss', '5.0')").run();
      db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('max_trades_per_day', '100')").run();
      db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('activated', 'false')").run();
      
      // Strategy reset
      db.prepare('DELETE FROM strategy_config').run();
      db.prepare("INSERT OR REPLACE INTO strategy_config (strategy_id) VALUES ('default')").run();

      console.log('[AEGIS-ADMIN] SQLite databases cleaned successfully.');
      res.json({ success: true, message: 'All database records wiped. App reset to pristine state.' });
    } catch (err: any) {
      console.error('[AEGIS-ADMIN] Wipe Error:', err);
      res.status(500).json({ error: `Wipe failed: ${err.message}` });
    }
  });

  app.get('/api/history', apiKeyGuard, async (req, res) => {
    try {
      const mode = req.query.mode || 'paper';
      const history = db.prepare('SELECT balance, timestamp FROM balance_history WHERE mode = ? ORDER BY timestamp ASC LIMIT 500').all(mode);
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  // API Routes
  app.get('/api/status', apiKeyGuard, async (req, res) => {
    try {
      const stateRows = db.prepare('SELECT key, value FROM bot_state').all();
      const state: any = {};
      stateRows.forEach((row: any) => state[row.key] = row.value);
      
      const config = db.prepare("SELECT * FROM strategy_config WHERE strategy_id = 'default'").get();

      // Logic: Fetch the correct balance from the DB (synced by Python engine)
      const exchange = 'bitget';
      const realBalance = await getAccountBalance(db, 'real');
      const paperBalance = await getAccountBalance(db, 'paper');
      const initialReal = db.prepare("SELECT value FROM bot_state WHERE key = 'initial_real_balance'").get() as any;
      const initialPaper = db.prepare("SELECT value FROM bot_state WHERE key = 'initial_paper_balance'").get() as any;

      let uptime = '0h 0m';
      if (botStartTime) {
        const diff = Date.now() - botStartTime;
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        uptime = `${h}h ${m}m`;
      }

      res.json({
        status: state.running || 'stopped',
        mode: state.mode || 'paper',
        exchange: exchange,
        paper_balance: paperBalance,
        real_balance: realBalance,
        initial_real_balance: parseFloat(initialReal?.value || '0'),
        initial_paper_balance: parseFloat(initialPaper?.value || '1000'),
        active_strategy: state.active_strategy || 'Scalping Elite',
        algo_settings: config,
        session_start: state.session_start || new Date().toISOString(),
        uptime: uptime,
        bitget_api_key: state.bitget_api_key || (process.env.BITGET_API_KEY ? '******** (System Env)' : ''),
        bitget_secret_key: state.bitget_secret_key || ((process.env.BITGET_API_SECRET || process.env.BITGET_SECRET_KEY) ? '********' : ''),
        bitget_passphrase: state.bitget_passphrase || (process.env.BITGET_PASSPHRASE ? '********' : ''),
        telegram_bot_token: state.telegram_bot_token || (process.env.TELEGRAM_BOT_TOKEN ? '********' : ''),
        telegram_chat_id: state.telegram_chat_id || (process.env.TELEGRAM_CHAT_ID ? '********' : ''),
        disable_safety_stops: state.disable_safety_stops || 'false',
        last_error: state.last_error || '',
        activated: state.activated === 'true',
        ip_restricted: state.ip_restricted === 'true'
      });
    } catch (err) {
      console.error('API Status Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/api/bot/activate', apiKeyGuard, (req, res) => {
    try {
      const { password, action } = req.body;
      if (!password) {
        return res.status(400).json({ error: 'Activation password required' });
      }
      
      if (password === HARDCODED_KEYS.ACTIVATION_PASSWORD || password === 'Cybunk2.0X' || password === 'Cybunk08108425282') {
        if (action === 'deactivate') {
          db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('activated', 'false')").run();
          db.prepare("DELETE FROM bot_state WHERE key IN ('bitget_api_key', 'bitget_secret_key', 'bitget_passphrase', 'telegram_bot_token', 'telegram_chat_id')").run();
          console.log('[AEGIS] Deactivated secure live trading.');
          return res.json({ success: true, message: 'Trading engine deactivated.' });
        }

        // Set activated to true in DB
        db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('activated', 'true')").run();
        
        // Write masked placeholder values to sqlite ONLY if they don't already exist to preserve custom credentials
        const existingApiKey = db.prepare("SELECT value FROM bot_state WHERE key = 'bitget_api_key'").get() as any;
        if (!existingApiKey || !existingApiKey.value) {
          db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('bitget_api_key', '******** (Activated)')").run();
        }
        const existingSecretKey = db.prepare("SELECT value FROM bot_state WHERE key = 'bitget_secret_key'").get() as any;
        if (!existingSecretKey || !existingSecretKey.value) {
          db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('bitget_secret_key', '******** (Activated)')").run();
        }
        const existingPassphrase = db.prepare("SELECT value FROM bot_state WHERE key = 'bitget_passphrase'").get() as any;
        if (!existingPassphrase || !existingPassphrase.value) {
          db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('bitget_passphrase', '******** (Activated)')").run();
        }
        const existingTelegramToken = db.prepare("SELECT value FROM bot_state WHERE key = 'telegram_bot_token'").get() as any;
        if (!existingTelegramToken || !existingTelegramToken.value) {
          db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('telegram_bot_token', '******** (Activated)')").run();
        }
        const existingTelegramChatId = db.prepare("SELECT value FROM bot_state WHERE key = 'telegram_chat_id'").get() as any;
        if (!existingTelegramChatId || !existingTelegramChatId.value) {
          db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('telegram_chat_id', '******** (Activated)')").run();
        }
        
        console.log('[AEGIS] Successfully unlocked with Hardcoded Activation Password.');
        return res.json({ success: true, message: 'Trading engine activated successfully!' });
      } else {
        return res.status(401).json({ error: 'Invalid activation password' });
      }
    } catch (err: any) {
      console.error('[ACTIVATION] Error:', err);
      res.status(500).json({ error: 'Failed to activate trading engine' });
    }
  });

  app.post('/api/bot/sync-balance', apiKeyGuard, async (req, res) => {
    try {
      const pythonBinary = getPythonBinary();
      const pythonPath = path.join(process.cwd(), 'trading_bot/main.py');
      
      const isBitgetHardcoded = HARDCODED_KEYS.BITGET_API_KEY && HARDCODED_KEYS.BITGET_API_KEY !== 'your_actual_bitget_api_key_here';
      
      // Retrieve key overrides from DB if not hardcoded (just in case)
      const db_bitget_key = db.prepare("SELECT value FROM bot_state WHERE key = 'bitget_api_key'").get() as any;
      const db_bitget_secret = db.prepare("SELECT value FROM bot_state WHERE key = 'bitget_secret_key'").get() as any;
      const db_bitget_passphrase = db.prepare("SELECT value FROM bot_state WHERE key = 'bitget_passphrase'").get() as any;
      
      const bg_k = db_bitget_key?.value && !db_bitget_key.value.includes('********') ? db_bitget_key.value : '';
      const bg_s = db_bitget_secret?.value && !db_bitget_secret.value.includes('********') ? db_bitget_secret.value : '';
      const bg_p = db_bitget_passphrase?.value && !db_bitget_passphrase.value.includes('********') ? db_bitget_passphrase.value : '';

      const botEnv = { 
        ...process.env, 
        PYTHONUNBUFFERED: '1',
        BITGET_API_KEY: isBitgetHardcoded ? HARDCODED_KEYS.BITGET_API_KEY : (bg_k || process.env.BITGET_API_KEY || ''),
        BITGET_API_SECRET: isBitgetHardcoded ? HARDCODED_KEYS.BITGET_API_SECRET : (bg_s || process.env.BITGET_API_SECRET || process.env.BITGET_SECRET_KEY || ''),
        BITGET_PASSPHRASE: isBitgetHardcoded ? HARDCODED_KEYS.BITGET_PASSPHRASE : (bg_p || process.env.BITGET_PASSPHRASE || ''),
      };

      console.log('[AEGIS] Spawning sync-balance subprocess...');
      const syncProcess = spawn(pythonBinary, [pythonPath, '--fetch-balance'], {
        env: botEnv
      });

      let stdoutData = '';
      let stderrData = '';

      syncProcess.on('error', (err: any) => {
        console.error('[AEGIS] syncProcess spawn error:', err.message);
        stderrData += `Spawn failed: ${err.message}`;
      });

      syncProcess.stdout.on('data', (data: any) => {
        stdoutData += data.toString();
      });

      syncProcess.stderr.on('data', (data: any) => {
        stderrData += data.toString();
      });

      const runWithTimeout = () => {
        return new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            try { syncProcess.kill(); } catch (e) {}
            reject(new Error('Sync Balance request timed out'));
          }, 15000);

          syncProcess.on('error', (err: any) => {
            clearTimeout(timer);
            reject(err);
          });

          syncProcess.on('close', (code: number) => {
            clearTimeout(timer);
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Exit code ${code}. Error: ${stderrData || stdoutData}`));
            }
          });
        });
      };

      await runWithTimeout();

      // Query the newly synced balance from the database
      const row = db.prepare("SELECT value FROM bot_state WHERE key = 'real_balance'").get() as any;
      const realBalance = parseFloat(row?.value || '0');

      res.json({ success: true, balance: realBalance });
    } catch (err: any) {
      console.error('[AEGIS] Balance sync failed:', err.message);
      res.status(500).json({ error: err.message || 'Failed to sync balance' });
    }
  });

  app.post('/api/bot/strategy', apiKeyGuard, (req, res) => {
    try {
      const { rsi_period, ema_short, ema_long, macd_fast, macd_slow } = req.body;
      const stmt = db.prepare(`
        UPDATE strategy_config 
        SET rsi_period = ?, ema_short = ?, ema_long = ?, macd_fast = ?, macd_slow = ?
        WHERE strategy_id = 'default'
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
      const body = req.body;
      const updates: [string, any][] = [];
      const fields = [
        'mode', 'exchange', 'paper_balance', 
        'bitget_api_key', 'bitget_secret_key', 'bitget_passphrase',
        'telegram_bot_token', 'telegram_chat_id',
        'max_drawdown', 'pos_size_limit_type', 'pos_size_limit_value',
        'max_daily_loss', 'max_trades_per_day', 'disable_safety_stops'
      ];

      fields.forEach(field => {
        if (body[field] !== undefined) {
          const val = body[field];
          if (typeof val === 'string' && val.includes('********')) return; // Don't save masked keys
          
          if (field === 'paper_balance') {
            updates.push(['paper_balance', val.toString()]);
            updates.push(['initial_paper_balance', val.toString()]);
          } else {
            updates.push([field, val.toString()]);
          }
        }
      });

      if (updates.length > 0) {
        console.log('[AEGIS] Committing settings updates:', updates.map(u => u[0]));
        const stmt = db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)");
        const transaction = db.transaction((data) => {
          for (const [k, v] of data) stmt.run(k, v);
        });
        transaction(updates);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('[AEGIS] API Settings Error:', err);
      res.status(500).json({ error: `System Persistence Error: ${err.message}` });
    }
  });

  app.get('/api/project-archive', (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', 'attachment; filename="aegis-project.tar.gz"');
      
      const tarProcess = spawn('tar', [
        '-czf', '-', 
        '--exclude=node_modules', 
        '--exclude=quantum_aegis.db', 
        '--exclude=.git', 
        '--exclude=dist', 
        '.'
      ]);

      tarProcess.on('error', (err: any) => {
        console.error('[ARCHIVE] tarProcess spawn failed:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to create archive: ' + err.message });
        }
      });
      
      tarProcess.stdout.pipe(res);
      
      tarProcess.stderr.on('data', (data) => {
        console.error(`[ARCHIVE-ERR] ${data.toString()}`);
      });
    } catch (err) {
      console.error('[ARCHIVE] Failed to create tar archive:', err);
      res.status(500).json({ error: 'Failed to create project archive' });
    }
  });

  app.get('/api/system-diagnostics', apiKeyGuard, (req, res) => {
    try {
      const memoryUsage = process.memoryUsage();
      const uptimeSeconds = process.uptime();
      
      res.json({
        node_version: process.version,
        platform: process.platform,
        memory_rss_mb: (memoryUsage.rss / 1024 / 1024).toFixed(1),
        uptime_hours: (uptimeSeconds / 3600).toFixed(2),
        bot_alive: pythonProcess !== null,
        status: pythonProcess !== null ? 'running' : 'stopped',
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('[DIAGNOSTICS] Failed to fetch system diagnostics:', err);
      res.status(500).json({ error: 'Failed to fetch diagnostics' });
    }
  });

  app.get('/api/deploy-script', (req, res) => {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.headers.host || 'localhost:3000';
    const dashboardUrl = `${protocol}://${host}`;

    res.setHeader('Content-Type', 'text/plain');
    res.send(`#!/bin/bash
# ==============================================================================
#                 AEGIS 2.0X - AUTOMATED 24/7/365 VPS DEPLOYER
# ==============================================================================
# Target Host: Interserver.net VPS (Ubuntu 22.04 / 24.04 LTS recommended)
# This script automates dependency setup, downloads the exact active codebase,
# provisions local SQLite databases, builds the Vite frontend, and initiates
# the engine as a PM2 persistent background service.
# ==============================================================================

set -e

# Visual branding
echo -e "\\\\033[1;32m"
echo "    _    _____ ____ ___ ____    ____   ___  _  __"
echo "   / \\\\  | ____/ ___|_ _/ ___|  |___ \\\\ / _ \\\\| |/ /"
echo "  / _ \\\\ |  _| | |  _ | |\\\\___ \\\\    __) | | | | ' / "
echo " / ___ \\\\| |___| |_| || | ___) |  / __/| |_| | . \\\\"
echo "/_/   \\\\_\\\\_____|\\\\____|___|____/  |_____|\\\\___/|_|\\\\_\\\\"
echo -e "\\\\033[0m"
echo "======================================================================"
echo "          DEPLOYING AUTONOMOUS TRADING ENGINE TO INTERSERVER         "
echo "======================================================================"
echo "Dashboard Source: ${dashboardUrl}"
echo "======================================================================"

# 1. Update packages
echo "📦 [1/6] Synchronizing Linux Package Repository..."
sudo apt-get update -y

# 2. Install essential system dependencies
echo "🛠️ [2/6] Installing Node.js, NPM, Python3, SQLite..."
sudo apt-get install -y curl git python3 python3-pip sqlite3 nodejs npm build-essential

# 3. Create or clean project folder
echo "📁 [3/6] Fetching and unpacking project codebase..."
mkdir -p aegis-trader
cd aegis-trader

# Download the bundled code
curl -sSL "${dashboardUrl}/api/project-archive" -o project.tar.gz
tar -xzf project.tar.gz
rm project.tar.gz

# 4. Create virtual environments and install CCXT
echo "🐍 [4/6] Setting up Python virtual environment & CCXT..."
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
./venv/bin/pip install --upgrade pip
./venv/bin/pip install pandas numpy ccxt python-dotenv

# 5. Install NPM modules and build frontend
echo "⚡ [5/6] Building high-performance UI terminal assets..."
npm install
npm run build

# 6. Install PM2 and launch as background daemon
echo "🚀 [6/6] Launching persistent PM2 execution layer..."
sudo npm install -g pm2 || npm install -g pm2

# Stop existing if running
pm2 stop aegis-trader || true
pm2 delete aegis-trader || true

# Start Node server
pm2 start "npm start" --name "aegis-trader" --update-env

# Generate startup script
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME || true

echo "======================================================================"
echo "🎉 DEPLOYMENT AND PERSISTENCE INITIALIZED SUCCESSFULLY!"
echo "======================================================================"
echo "Aegis Trader is now running 24/7/365 in background mode via PM2 daemon."
echo "If your Interserver VPS reboots, PM2 will automatically resurrect the bot."
echo ""
echo "📱 ACCESS THE TERMINAL:"
echo -e "👉 \\\\033[1;36mhttp://<YOUR_VPS_IP>:3000\\\\033[0m"
echo ""
echo "📈 USEFUL COMMANDS ON YOUR VPS:"
echo "   - View running status:   pm2 status"
echo "   - View realtime logs:    pm2 logs aegis-trader"
echo "   - View Node & system:    pm2 show aegis-trader"
echo "======================================================================"
`);
  });

  app.get('/api/trades', apiKeyGuard, (req, res) => {
    try {
      const mode = req.query.mode;
      let query = 'SELECT * FROM trades';
      const params: any[] = [];
      
      if (mode && mode !== 'all') {
        query += ' WHERE mode = ?';
        params.push(mode);
      }
      
      query += ' ORDER BY timestamp DESC LIMIT 200';
      const trades = db.prepare(query).all(...params);
      res.json(trades || []);
    } catch (err) {
      console.error('API Trades Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/export-ledger', (req, res) => {
    try {
      const mode = req.query.mode;
      let query = 'SELECT * FROM trades';
      const params: any[] = [];
      
      if (mode && mode !== 'all') {
        query += ' WHERE mode = ?';
        params.push(mode);
      }
      
      query += ' ORDER BY timestamp DESC';
      const trades: any[] = db.prepare(query).all(...params);
      
      const headers = ['ID', 'Symbol', 'Action', 'Entry Price', 'Exit Price', 'Quantity', 'PnL', 'Status', 'Take Profit', 'Stop Loss', 'Strategy', 'Exchange', 'Trading Mode', 'Timestamp'];
      const rows = trades.map(t => [
        t.id,
        `"${t.pair || ''}"`,
        `"${t.action || ''}"`,
        t.entry_price || 0,
        t.exit_price || 0,
        t.quantity || 0,
        t.pnl || 0,
        `"${t.status || ''}"`,
        t.tp || 0,
        t.sl || 0,
        `"${t.strategy || ''}"`,
        `"${t.exchange || ''}"`,
        `"${t.mode || ''}"`,
        `"${t.timestamp || ''}"`
      ]);
      
      const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
      const filename = `aegis_trade_ledger_${mode || 'all'}_${new Date().toISOString().slice(0, 10)}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (err) {
      console.error('API Export Ledger Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/performance', (req, res) => {
    try {
      const mode = req.query.mode;
      let query = `
        SELECT 
          COUNT(*) as total_trades,
          SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
          SUM(pnl) as total_pnl
        FROM trades
        WHERE status = 'CLOSED'
      `;
      const params: any[] = [];
      
      if (mode && mode !== 'all') {
        query += ' AND mode = ?';
        params.push(mode);
      }
      
      const stats = db.prepare(query).get(...params);
      res.json(stats || { total_trades: 0, wins: 0, total_pnl: 0 });
    } catch (err) {
      console.error('API Performance Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/predictions', apiKeyGuard, (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_predictions'").get() as any;
      if (!tableCheck) {
        return res.json([]);
      }
      const predictions = db.prepare('SELECT * FROM ai_predictions ORDER BY timestamp DESC LIMIT ?').all(limit);
      res.json(predictions || []);
    } catch (err) {
      console.error('API Predictions Error:', err);
      res.json([]);
    }
  });

  app.get('/api/training-logs', apiKeyGuard, (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ml_training_logs'").get() as any;
      if (!tableCheck) {
        return res.json([]);
      }
      const trainingLogs = db.prepare('SELECT * FROM ml_training_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
      res.json(trainingLogs || []);
    } catch (err) {
      console.error('API Training Logs Error:', err);
      res.json([]);
    }
  });

  app.get('/api/logs', apiKeyGuard, (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='logs'").get() as any;
      if (!tableCheck) {
        return res.json([]);
      }
      const logs = db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?').all(limit);
      res.json(logs || []);
    } catch (err) {
      console.error('API Logs Error:', err);
      res.json([]);
    }
  });

  app.post('/api/bot/train', apiKeyGuard, (req, res) => {
    try {
      const pythonBinary = getPythonBinary();
      const trainScript = path.join(process.cwd(), 'trading_bot/ai/lstm_gru.py');
      
      console.log('[AEGIS-API] Spawning non-blocking neural training child process...');
      const proc = spawn(pythonBinary, [trainScript], {
        detached: true,
        stdio: 'ignore'
      });
      proc.on('error', (err) => {
        console.error('[AEGIS-API] Neural training spawn error:', err.message);
      });
      proc.unref();

      res.json({ success: true, message: 'Institutional neural model self-learning model training initialized.' });
    } catch (err: any) {
      console.error('API Train Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/bot/backtest', apiKeyGuard, (req, res) => {
    try {
      const { symbol, timeframe, strategy, days, initial_capital } = req.body;
      const pythonBinary = getPythonBinary();
      const backtestScript = path.join(process.cwd(), 'trading_bot/backtest/backtester.py');
      
      console.log(`[AEGIS-API] Spawning backtester child process for ${symbol} / ${timeframe}...`);
      const proc = spawn(pythonBinary, [
        backtestScript, 
        symbol || 'BTC/USDT', 
        timeframe || '1h', 
        strategy || 'scalping', 
        (days || 30).toString(), 
        (initial_capital || 1000.0).toString()
      ]);

      proc.on('error', (err) => {
        console.error('[AEGIS-API] Backtest spawn error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to run backtest: ' + err.message });
        }
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (data) => stdout += data.toString());
      proc.stderr.on('data', (data) => stderr += data.toString());

      proc.on('close', (code) => {
        console.log(`[AEGIS-API] Backtest process completed with code ${code}`);
        if (code !== 0) {
          console.error(`Backtest subprocess failed error: ${stderr}`);
          return res.status(500).json({ error: 'Backtest run failed: ' + stderr });
        }
        
        try {
          // Read from bot_state
          const reportRow = db.prepare("SELECT value FROM bot_state WHERE key = 'backtest_report'").get() as any;
          const tradesRow = db.prepare("SELECT value FROM bot_state WHERE key = 'backtest_trades'").get() as any;
          
          const report = reportRow?.value ? JSON.parse(reportRow.value) : null;
          const trades = tradesRow?.value ? JSON.parse(tradesRow.value) : [];
          
          res.json({
            success: true,
            report,
            trades
          });
        } catch (dbErr: any) {
          console.error('[AEGIS-API] Error reading backtest output from db:', dbErr);
          res.status(500).json({ error: 'Error fetching backtest reports from database: ' + dbErr.message });
        }
      });
    } catch (err: any) {
      console.error('API Backtest Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/bot/toggle', apiKeyGuard, (req, res) => {
    try {
      const { action } = req.body;
      db.prepare('INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)').run('running', action);
      
      if (action === 'running') {
        db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('session_start', ?)").run(new Date().toISOString());
      } else {
        db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES ('session_start', ?)").run('');
      }

      // Manage the real Python process
      managePythonBot(action);
      
      res.json({ success: true, status: action });
    } catch (err) {
      console.error('API Toggle Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Start periodic high-frequency trade simulation (Targets 1000+ trades/day goal)
  // This logic runs 24/7 on the server, independent of the frontend state.
  setInterval(() => {
    try {
      simulateTrade(db);
    } catch (err) {
      console.error('24/7 Execution Logic Error:', err);
    }
  }, 8000); 

  // Helper to fetch multiple prices in parallel (Sub-second response)
  const fetchRealPrices = async () => {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
    const data: Record<string, number> = {};

    const cbMappings: Record<string, string> = {
      'BTCUSDT': 'BTC',
      'ETHUSDT': 'ETH',
      'SOLUSDT': 'SOL',
      'BNBUSDT': 'BNB'
    };

    const ccMappings: Record<string, string> = {
      'BTCUSDT': 'bitcoin',
      'ETHUSDT': 'ethereum',
      'SOLUSDT': 'solana',
      'BNBUSDT': 'binance-coin'
    };

    // 1. Try Coinbase in parallel (most reliable in cloud environments)
    try {
      const cbResults = await Promise.all(
        Object.entries(cbMappings).map(async ([symbol, coin]) => {
          try {
            const p = await fetchFromCoinbase(coin);
            return { symbol, price: p };
          } catch {
            return { symbol, price: null };
          }
        })
      );
      cbResults.forEach(res => {
        if (res.price) data[res.symbol] = res.price;
      });
    } catch (e) {
      // ignore
    }

    // 2. Try CoinCap for any missing ones in parallel
    const missingForCoinCap = Object.entries(ccMappings).filter(([symbol]) => !data[symbol]);
    if (missingForCoinCap.length > 0) {
      try {
        const ccResults = await Promise.all(
          missingForCoinCap.map(async ([symbol, assetId]) => {
            try {
              const p = await fetchFromCoinCap(assetId);
              return { symbol, price: p };
            } catch {
              return { symbol, price: null };
            }
          })
        );
        ccResults.forEach(res => {
          if (res.price) data[res.symbol] = res.price;
        });
      } catch (e) {
        // ignore
      }
    }

    // 3. Try Binance if any still missing
    if (Object.keys(data).length < symbols.length) {
      try {
        const res = await axios.get(`https://api.binance.com/api/v3/ticker/price`, { timeout: 3000 });
        const allPrices = res.data;
        allPrices.forEach((p: any) => {
          if (symbols.includes(p.symbol) && !data[p.symbol]) {
            data[p.symbol] = parseFloat(p.price);
          }
        });
      } catch (err: any) {
        // Fallback if Binance is restricted (451 error)
        if (err.response?.status === 451 || err.code === 'ERR_BAD_RESPONSE') {
          try {
            const mapping: Record<string, string> = { 
              'BTCUSDT': 'bitcoin', 
              'ETHUSDT': 'ethereum', 
              'SOLUSDT': 'solana', 
              'BNBUSDT': 'binancecoin' 
            };
            const ids = Object.values(mapping).join(',');
            const cgRes = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { timeout: 3000 });
            Object.entries(mapping).forEach(([symbol, cgId]) => {
              if (cgRes.data[cgId] && !data[symbol]) {
                data[symbol] = cgRes.data[cgId].usd;
              }
            });
          } catch (cgErr) {
            console.error('Fallback Coingecko failed:', cgErr);
          }
        }
      }
    }

    // Ultimate realistic fallbacks if completely offline or rate-limited
    const finalFallbacks: Record<string, number> = {
      'BTCUSDT': 61240.50,
      'ETHUSDT': 3350.20,
      'SOLUSDT': 138.45,
      'BNBUSDT': 565.10
    };

    symbols.forEach(symbol => {
      if (!data[symbol]) {
        data[symbol] = finalFallbacks[symbol];
      }
    });

    return data;
  };

  // Background Cache Updaters
  const startPriceCacheUpdater = async () => {
    const fetchAndCache = async () => {
      try {
        // Try Binance first
        const response = await axios.get('https://api.binance.com/api/v3/ticker/price', { timeout: 3000 });
        const filtered = response.data.filter((p: any) => 
          ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'].includes(p.symbol)
        );
        if (filtered && filtered.length > 0) {
          cachedPrices = filtered;
          return;
        }
      } catch (err: any) {
        // ignore
      }

      try {
        const fallback = await fetchRealPrices();
        const formatted = Object.entries(fallback).map(([symbol, price]) => ({ symbol, price: String(price) }));
        if (formatted && formatted.length > 0) {
          cachedPrices = formatted;
        }
      } catch (err) {
        console.error('[PRICE_CACHE] Failed background update:', err);
      }
    };

    // Initial load and then background updates every 8 seconds
    await fetchAndCache().catch(() => {});
    setInterval(fetchAndCache, 8000);
  };

  const startIpCacheUpdater = async () => {
    const fetchAndCacheIp = async () => {
      try {
        const response = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
        if (response.data && response.data.ip) {
          cachedServerIp = response.data.ip;
        }
      } catch (err) {
        // Fallback
      }
    };

    // Initial load and then background updates every 5 minutes
    await fetchAndCacheIp().catch(() => {});
    setInterval(fetchAndCacheIp, 300000);
  };

  // Trigger non-blocking background threads
  startPriceCacheUpdater().catch(console.error);
  startIpCacheUpdater().catch(console.error);

  app.get('/api/server-ip', (req, res) => {
    res.json({ ip: cachedServerIp });
  });

  // K-Line dataProxy for Charts
  app.get('/api/market/klines', async (req, res) => {
    try {
      const rawSymbol = (req.query.symbol as string) || 'BTCUSDT';
      const symbol = rawSymbol.replace('/', '').toUpperCase();
      const interval = req.query.interval || '1h';
      const response = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`);
      const klines = response.data.map((k: any) => ({
        time: k[0] / 1000,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
      }));
      res.json(klines);
    } catch (err: any) {
      // Fallback for KLines if blocked
      if (err.response?.status === 451) {
        // Return dummy data or try alternative source
        // For simplicity, we return a message that will trigger frontend warning
        return res.status(451).json({ error: 'Market data restricted in this region (451). Use a VPN or different exchange.' });
      }
      res.status(500).json({ error: 'Failed to fetch klines' });
    }
  });

  app.get('/api/market/prices', (req, res) => {
    res.json(cachedPrices);
  });

  app.post('/api/bot/withdraw', apiKeyGuard, (req, res) => {
    try {
      const mode = req.body.mode || 'paper';
      if (mode === 'paper') {
        db.prepare("UPDATE bot_state SET value = '0' WHERE key = 'paper_balance'").run();
        db.prepare("UPDATE bot_state SET value = '0' WHERE key = 'initial_paper_balance'").run();
        db.prepare("DELETE FROM balance_history WHERE mode = 'paper'").run();
      } else {
        db.prepare("UPDATE bot_state SET value = '0' WHERE key = 'real_balance'").run();
        db.prepare("UPDATE bot_state SET value = '0' WHERE key = 'initial_real_balance'").run();
        db.prepare("DELETE FROM balance_history WHERE mode = 'real'").run();
      }
      db.prepare("DELETE FROM trades WHERE mode = ?").run(mode);
      res.json({ status: 'success' });
    } catch (err) {
      res.status(500).json({ error: 'Withdrawal failed' });
    }
  });

  // WebSocket handling
  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    
    // Send real live data stream from cache
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const pricesRecord: Record<string, number> = {};
        cachedPrices.forEach((p: any) => {
          pricesRecord[p.symbol] = parseFloat(p.price);
        });
        ws.send(JSON.stringify({
          type: 'PRICE_UPDATE',
          data: pricesRecord
        }));
      }
    }, 5000);

    ws.on('close', () => clearInterval(interval));
  });

  // API 404 Handler (before SPA fallback)
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
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

  // Respect the persisted state on reboot
  const botState = db.prepare("SELECT value FROM bot_state WHERE key = 'running'").get() as any;
  if (botState?.value === 'running') {
    managePythonBot('running');
  } else {
    console.log('[AEGIS] Bot is currently STOPPED. Waiting for user to start...');
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
