/**
 * @w3-io/bridge — Native chain and crypto operations for W3 actions.
 *
 * Zero dependencies. Auto-discovers the bridge socket.
 * One import and you're calling native Rust chain-core.
 *
 * @example
 * import { w3 } from '@w3-io/bridge'
 *
 * const balance = await w3.ethereum.balance({ network: 'sepolia', address: '0x...' })
 * const tx = await w3.ethereum.callContract({ network: 'sepolia', address: '0x...', ... })
 * const hash = await w3.crypto.keccak256({ data: '0xdeadbeef' })
 */

import http from 'node:http'

const DEFAULT_SOCKET = '/var/run/w3/bridge.sock'

class BridgeError extends Error {
  constructor(message, { code, status } = {}) {
    super(message)
    this.name = 'BridgeError'
    this.code = code || 'BRIDGE_ERROR'
    this.status = status || 0
  }
}

/**
 * Coerce string values from the bridge into JS types where safe.
 *
 * - "true" / "false" → boolean (unambiguous, no precision risk)
 * - Numbers are NOT coerced (BigInt territory, leading zeros)
 * - Everything else stays as a string
 *
 * @param {Record<string, string>} obj
 * @returns {Record<string, *>}
 */
function coerceValues(obj) {
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === 'true') result[key] = true
    else if (value === 'false') result[key] = false
    else result[key] = value
  }
  return result
}

function createBridge(socketPath) {
  // Support both Unix socket and TCP connections.
  // W3_BRIDGE_URL (TCP) takes precedence when set — used by Docker-in-Docker.
  // W3_BRIDGE_SOCKET (Unix) is the default for bare-metal nodes.
  const bridgeUrl = process.env.W3_BRIDGE_URL
  const socket = !bridgeUrl ? socketPath || process.env.W3_BRIDGE_SOCKET || DEFAULT_SOCKET : null

  async function call(method, path, body) {
    return new Promise((resolve, reject) => {
      const data = body != null ? JSON.stringify(body) : ''
      const headers = { 'Content-Type': 'application/json' }
      if (data) headers['Content-Length'] = Buffer.byteLength(data)

      const connectOpts = socket
        ? { socketPath: socket, method, path, headers }
        : { ...new URL(path, bridgeUrl), method, headers }

      const req = http.request(connectOpts, (res) => {
        let chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString()
          let parsed
          try {
            parsed = JSON.parse(raw)
          } catch {
            reject(new BridgeError(`Invalid JSON from bridge: ${raw}`, { code: 'PARSE_ERROR' }))
            return
          }
          if (parsed.ok === false) {
            reject(
              new BridgeError(parsed.error || 'Bridge operation failed', {
                code: parsed.code || 'BRIDGE_ERROR',
                status: res.statusCode,
              }),
            )
            return
          }
          // Strip the { ok: true } envelope — return clean data
          // eslint-disable-next-line no-unused-vars
          const { ok: _ok, ...rest } = parsed
          resolve(coerceValues(rest))
        })
      })
      req.on('error', (e) => {
        if (e.code === 'ENOENT') {
          reject(
            new BridgeError(
              `Bridge socket not found at ${socket}. Is this running inside a W3 workflow?`,
              { code: 'SOCKET_NOT_FOUND' },
            ),
          )
        } else if (e.code === 'ECONNREFUSED') {
          reject(
            new BridgeError('Bridge connection refused. The bridge server may not be running.', {
              code: 'CONNECTION_REFUSED',
            }),
          )
        } else {
          reject(new BridgeError(`Bridge request failed: ${e.message}`, { code: 'REQUEST_ERROR' }))
        }
      })
      if (data) req.write(data)
      req.end()
    })
  }

  // Chain helper: POST /:chain/:action with { network, params }
  function chainCall(chain, action, { network, ...params }) {
    return call('POST', `/${chain}/${action}`, { network, params })
  }

  // Crypto helper: POST /crypto/:op with { params: { ... } }
  function cryptoCall(op, params) {
    return call('POST', `/crypto/${op}`, { params })
  }

  return {
    /** Check if the bridge is alive. Throws BridgeError if not. */
    health: () => call('GET', '/health'),

    ethereum: {
      // Read operations
      balance: (opts) => chainCall('ethereum', 'get-balance', opts),
      readContract: (opts) => chainCall('ethereum', 'read-contract', opts),
      tokenBalance: (opts) => chainCall('ethereum', 'get-token-balance', opts),
      tokenAllowance: (opts) => chainCall('ethereum', 'get-token-allowance', opts),
      nftOwner: (opts) => chainCall('ethereum', 'get-nft-owner', opts),
      events: (opts) => chainCall('ethereum', 'get-events', opts),
      transaction: (opts) => chainCall('ethereum', 'get-transaction', opts),
      resolveName: (opts) => chainCall('ethereum', 'resolve-name', opts),

      // Write operations
      transfer: (opts) => chainCall('ethereum', 'transfer', opts),
      transferToken: (opts) => chainCall('ethereum', 'transfer-token', opts),
      transferNft: (opts) => chainCall('ethereum', 'transfer-nft', opts),
      approve: (opts) => chainCall('ethereum', 'approve-token', opts),
      callContract: (opts) => chainCall('ethereum', 'call-contract', opts),
      deploy: (opts) => chainCall('ethereum', 'deploy-contract', opts),
      sendTransaction: (opts) => chainCall('ethereum', 'send-transaction', opts),

      // Wait
      waitForTransaction: (opts) => chainCall('ethereum', 'wait-for-transaction', opts),
    },

    bitcoin: {
      balance: (opts) => chainCall('bitcoin', 'get-balance', opts),
      send: (opts) => chainCall('bitcoin', 'send', opts),
      transaction: (opts) => chainCall('bitcoin', 'get-transaction', opts),
      utxos: (opts) => chainCall('bitcoin', 'get-utxos', opts),
      feeRate: (opts) => chainCall('bitcoin', 'get-fee-rate', opts),
      waitForTransaction: (opts) => chainCall('bitcoin', 'wait-for-transaction', opts),
    },

    solana: {
      balance: (opts) => chainCall('solana', 'get-balance', opts),
      transfer: (opts) => chainCall('solana', 'transfer', opts),
      tokenBalance: (opts) => chainCall('solana', 'get-token-balance', opts),
      account: (opts) => chainCall('solana', 'get-account', opts),
      tokenAccounts: (opts) => chainCall('solana', 'get-token-accounts', opts),
      transferToken: (opts) => chainCall('solana', 'transfer-token', opts),
      callProgram: (opts) => chainCall('solana', 'call-program', opts),
      transaction: (opts) => chainCall('solana', 'get-transaction', opts),
      waitForTransaction: (opts) => chainCall('solana', 'wait-for-transaction', opts),
    },

    crypto: {
      // Hashing
      keccak256: (opts) => cryptoCall('keccak256', opts),

      // AES-256-GCM
      aesEncrypt: (opts) => cryptoCall('aes-encrypt', opts),
      aesDecrypt: (opts) => cryptoCall('aes-decrypt', opts),

      // Ed25519
      ed25519Sign: (opts) => cryptoCall('ed25519-sign', opts),
      ed25519Verify: (opts) => cryptoCall('ed25519-verify', opts),
      ed25519PublicKey: (opts) => cryptoCall('ed25519-public-key', opts),

      // Key derivation
      hkdf: (opts) => cryptoCall('hkdf', opts),

      // JWT
      jwtSign: (opts) => cryptoCall('jwt-sign', opts),
      jwtVerify: (opts) => cryptoCall('jwt-verify', opts),

      // TOTP
      totp: (opts) => cryptoCall('totp', opts),
    },
  }
}

// Default instance — auto-discovers socket
const w3 = createBridge()

export { w3, createBridge, BridgeError }
export default w3
