/**
 * Phantom Wallet Connection for Electron
 * 
 * Opens a local HTML page in the browser that connects to Phantom extension,
 * then uses HTTP callback to return to Electron.
 */

const { shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Local server for wallet connection page
let server = null;
const SERVER_PORT = 8765;

class PhantomConnect {
  constructor() {
    this.userPublicKey = null;
    this.isConnectedFlag = false;
    this.pendingConnect = null;
    this.onConnectCallback = null;
    this.pendingTransaction = null;
    this.onTransactionCallback = null;
  }

  /**
   * Set callback for transaction completion
   */
  setOnTransactionCallback(callback) {
    this.onTransactionCallback = callback;
  }

  /**
   * Set callback for when wallet connects
   */
  setOnConnectCallback(callback) {
    this.onConnectCallback = callback;
  }

  /**
   * Start local server and open connection page
   */
  async connect() {
    // Start local server if not running
    this.startServer();
    
    // Open the connection page in default browser
    const connectUrl = `http://localhost:${SERVER_PORT}/phantom-connect.html`;
    console.log('[Phantom] Opening connection page:', connectUrl);
    shell.openExternal(connectUrl);
    
    // Return immediately - result comes via HTTP callback
    return { success: true, opened: true };
  }

  /**
   * Start local HTTP server to serve connection page AND handle callback
   */
  startServer() {
    if (server) {
      console.log('[Phantom] Server already running');
      return;
    }

    server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${SERVER_PORT}`);
      
      // Serve the connection HTML page
      if (url.pathname === '/phantom-connect.html' || url.pathname === '/') {
        const htmlPath = path.join(__dirname, 'phantom-connect.html');
        fs.readFile(htmlPath, (err, content) => {
          if (err) {
            res.writeHead(500);
            res.end('Error loading page');
            return;
          }
          res.writeHead(200, { 
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(content);
        });
      }
      // Serve the transaction signing page
      else if (url.pathname === '/phantom-transaction.html') {
        const htmlPath = path.join(__dirname, 'phantom-transaction.html');
        fs.readFile(htmlPath, (err, content) => {
          if (err) {
            res.writeHead(500);
            res.end('Error loading transaction page');
            return;
          }
          res.writeHead(200, { 
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(content);
        });
      }
      // Handle wallet callback
      else if (url.pathname === '/wallet-callback') {
        const publicKey = url.searchParams.get('publicKey');
        
        if (publicKey) {
          this.userPublicKey = publicKey;
          this.isConnectedFlag = true;
          
          console.log('[Phantom] Wallet connected via HTTP callback:', publicKey);
          
          // Notify the main process
          if (this.onConnectCallback) {
            this.onConnectCallback({
              success: true,
              publicKey: publicKey
            });
          }
          
          // Resolve pending promise if any
          if (this.pendingConnect) {
            this.pendingConnect.resolve({
              success: true,
              publicKey: publicKey
            });
            this.pendingConnect = null;
          }
          
          // Send success page that auto-closes
          res.writeHead(200, { 
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Connected!</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                  color: white;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  text-align: center;
                }
                .container {
                  background: rgba(255,255,255,0.1);
                  padding: 40px;
                  border-radius: 20px;
                }
                h1 { color: #14F195; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>✅ Wallet Connected!</h1>
                <p>You can close this tab and return to the DVPN app.</p>
                <p style="font-family: monospace; font-size: 12px; opacity: 0.7;">${publicKey}</p>
              </div>
              <script>
                // Try to close this tab after 2 seconds
                setTimeout(() => {
                  window.close();
                }, 2000);
              </script>
            </body>
            </html>
          `);
        } else {
          res.writeHead(400);
          res.end('Missing publicKey');
        }
      }
      // Handle transaction callback
      else if (url.pathname === '/transaction-callback') {
        const success = url.searchParams.get('success') === 'true';
        const signature = url.searchParams.get('signature');
        const error = url.searchParams.get('error');
        const plan = url.searchParams.get('plan');
        const priceSOL = parseFloat(url.searchParams.get('priceSOL')) || 0;
        const durationDays = parseInt(url.searchParams.get('durationDays')) || 30;
        
        console.log('[Phantom] Transaction callback:', { success, signature, error, plan });
        
        const result = {
          success,
          signature: signature || null,
          error: error || null,
          plan,
          priceSOL,
          durationDays
        };
        
        // Notify main process
        if (this.onTransactionCallback) {
          this.onTransactionCallback(result);
        }
        
        // Resolve pending transaction promise
        if (this.pendingTransaction) {
          this.pendingTransaction.resolve(result);
          this.pendingTransaction = null;
        }
        
        // Send response page
        res.writeHead(200, { 
          'Content-Type': 'text/html',
          'Access-Control-Allow-Origin': '*'
        });
        
        if (success) {
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Payment Successful!</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                  color: white;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  text-align: center;
                }
                .container {
                  background: rgba(255,255,255,0.1);
                  padding: 40px;
                  border-radius: 20px;
                }
                h1 { color: #14F195; }
                .signature { 
                  font-family: monospace; 
                  font-size: 10px; 
                  opacity: 0.7;
                  word-break: break-all;
                  max-width: 400px;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>✅ Payment Successful!</h1>
                <p>Your subscription has been activated.</p>
                <p>You can close this tab and return to the DVPN app.</p>
                <p class="signature">${signature}</p>
              </div>
              <script>
                setTimeout(() => { window.close(); }, 3000);
              </script>
            </body>
            </html>
          `);
        } else {
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Payment Cancelled</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                  color: white;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  text-align: center;
                }
                .container {
                  background: rgba(255,255,255,0.1);
                  padding: 40px;
                  border-radius: 20px;
                }
                h1 { color: #ff5252; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>❌ Payment Cancelled</h1>
                <p>${error || 'Transaction was cancelled or failed.'}</p>
                <p>You can close this tab and return to the DVPN app.</p>
              </div>
              <script>
                setTimeout(() => { window.close(); }, 3000);
              </script>
            </body>
            </html>
          `);
        }
      }
      else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(SERVER_PORT, () => {
      console.log(`[Phantom] Connection server running on port ${SERVER_PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log('[Phantom] Port in use, server likely already running');
      } else {
        console.error('[Phantom] Server error:', err);
      }
    });
  }

  /**
   * Stop local server
   */
  stopServer() {
    if (server) {
      server.close();
      server = null;
      console.log('[Phantom] Server stopped');
    }
  }

  /**
   * Handle callback from browser (legacy - for custom protocol)
   */
  handleCallback(url) {
    console.log('[Phantom] Handling callback:', url);
    
    try {
      const urlObj = new URL(url);
      
      if (urlObj.hostname === 'wallet-connected' || url.includes('wallet-connected')) {
        const publicKey = urlObj.searchParams.get('publicKey');
        
        if (publicKey) {
          this.userPublicKey = publicKey;
          this.isConnectedFlag = true;
          
          return {
            success: true,
            publicKey: publicKey
          };
        }
      }
      
      return { success: false, error: 'Unknown callback' };
      
    } catch (error) {
      console.error('[Phantom] Callback error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Disconnect wallet
   */
  disconnect() {
    this.userPublicKey = null;
    this.isConnectedFlag = false;
    return { success: true };
  }

  /**
   * Open transaction signing page in browser
   * @param {Object} txParams - Transaction parameters
   * @returns {Promise} - Resolves when transaction is signed or rejected
   */
  async openTransactionPage(txParams) {
    this.startServer();
    
    return new Promise((resolve, reject) => {
      // Store pending transaction promise
      this.pendingTransaction = { resolve, reject };
      
      // Set timeout for transaction
      const timeout = setTimeout(() => {
        if (this.pendingTransaction) {
          this.pendingTransaction.resolve({
            success: false,
            error: 'Transaction timed out'
          });
          this.pendingTransaction = null;
        }
      }, 5 * 60 * 1000); // 5 minute timeout
      
      // Override resolve to clear timeout
      const originalResolve = resolve;
      this.pendingTransaction.resolve = (result) => {
        clearTimeout(timeout);
        originalResolve(result);
      };
      
      // Build transaction URL with params
      const params = new URLSearchParams({
        plan: txParams.plan,
        priceSOL: txParams.priceSOL.toString(),
        priceLamports: txParams.priceLamports.toString(),
        durationDays: txParams.durationDays.toString(),
        escrowPDA: txParams.escrowPDA,
        walletAddress: txParams.walletAddress
      });
      
      const txUrl = `http://localhost:${SERVER_PORT}/phantom-transaction.html?${params.toString()}`;
      console.log('[Phantom] Opening transaction page:', txUrl);
      shell.openExternal(txUrl);
    });
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.isConnectedFlag;
  }

  /**
   * Get connected wallet public key
   */
  getPublicKey() {
    return this.userPublicKey;
  }
}

module.exports = PhantomConnect;
