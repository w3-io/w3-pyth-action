/**
 * Pyth on-chain operations.
 *
 * Submits the priceUpdateData blob from a Hermes API read to Pyth's
 * on-chain Pull Oracle. Pairs with `get-prices` to close the loop:
 * read off-chain (cheap), commit on-chain (trusted), with both sides
 * referring to the same price observation.
 *
 * Uses viem to sign + broadcast directly. The W3 bridge's call-contract
 * primitive currently chokes on bytes[] args (parser error in
 * alloy-dyn-abi), so we sidestep it for this command. The signing key
 * still flows through namespace secrets → action env (never the YAML),
 * is loaded into memory only for the duration of this step, and is
 * not logged.
 */

import * as core from '@actions/core'
import { W3ActionError } from '@w3-io/action-core'
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { avalanche, mainnet, base, arbitrum, optimism, polygon } from 'viem/chains'

/**
 * Pyth Pull Oracle contract addresses per chain.
 *
 * Source: https://docs.pyth.network/price-feeds/contract-addresses/evm
 * Re-verify if a new chain is added.
 */
export const PYTH_CONTRACTS = Object.freeze({
  avalanche: '0x4305FB66699C3B2702D4d05CF36551390A4c69C6',
  ethereum: '0x4305FB66699C3B2702D4d05CF36551390A4c69C6',
  base: '0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a',
  arbitrum: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C',
  optimism: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C',
  polygon: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C',
})

const VIEM_CHAINS = Object.freeze({
  avalanche,
  ethereum: mainnet,
  base,
  arbitrum,
  optimism,
  polygon,
})

const PYTH_ABI = parseAbi([
  'function updatePriceFeeds(bytes[] updateData) payable',
  'function getUpdateFee(bytes[] updateData) view returns (uint256)',
  'function getPriceUnsafe(bytes32 id) view returns (int64 price, uint64 conf, int32 expo, uint publishTime)',
])

/**
 * Read Pyth.getUpdateFee for a given price-update blob.
 *
 * Returns the required `msg.value` in wei for `updatePriceFeeds(blob)`
 * to succeed on the given chain. The workflow uses this to compute
 * the `value` it passes to `submit-on-chain` — no decisions live in
 * the action.
 *
 * @param {object} opts
 * @param {string} opts.network — Chain key (avalanche, ethereum, base, ...)
 * @param {string[]} opts.updateData — Hex-string array from Hermes `binary.data`.
 * @param {string} [opts.rpcUrl] — Optional custom RPC URL.
 * @returns {Promise<{ wei: string, chain: string, contract: string, feedCount: number }>}
 *   `wei` is a decimal-stringified `BigInt` so it round-trips losslessly
 *   through JSON and into the workflow's `to_bigint(...)` coercion.
 */
export async function getUpdateFee({ network, updateData, rpcUrl }) {
  const { contract, normalized, publicClient } = prepareCall({
    network,
    updateData,
    rpcUrl,
  })

  const fee = await publicClient.readContract({
    address: contract,
    abi: PYTH_ABI,
    functionName: 'getUpdateFee',
    args: [normalized],
  })

  core.info(`getUpdateFee: chain=${network} feeds=${normalized.length} fee=${fee} wei`)

  return {
    wei: fee.toString(),
    chain: network,
    contract,
    feedCount: normalized.length,
  }
}

/**
 * Read a Pyth price directly from the on-chain Pull Oracle contract.
 *
 * Calls `getPriceUnsafe(id)` — a plain, free `eth_call`, no Hermes API
 * key. Returns the price observation currently stored on chain (the same
 * value the consuming contracts would act on). `getPriceUnsafe` does not
 * revert on staleness; the caller decides any staleness policy from the
 * returned `publishTime`.
 *
 * @param {object} opts
 * @param {string} opts.network — Chain key (avalanche, ethereum, base, ...)
 * @param {string} opts.id — Pyth price feed id (0x-prefixed bytes32).
 * @param {string} [opts.rpcUrl] — Optional custom RPC URL.
 * @returns {Promise<{ id, price, conf, expo, publishTime, value, chain, contract }>}
 *   `price`, `conf`, and `publishTime` are decimal-stringified so they
 *   round-trip losslessly through JSON into the workflow's `to_bigint(...)`.
 *   `value` is the human-readable `price * 10**expo` as a JS number (for
 *   display/summary only — do not gate on it, use `price` + `expo`).
 */
export async function readPriceOnChain({ network, id, rpcUrl }) {
  const contract = PYTH_CONTRACTS[network]
  const chain = VIEM_CHAINS[network]
  if (!contract || !chain) {
    throw new W3ActionError(
      'UNSUPPORTED_NETWORK',
      `Unsupported network: ${network}. Supported: ${Object.keys(PYTH_CONTRACTS).join(', ')}`,
    )
  }
  if (!id) {
    throw new W3ActionError(
      'MISSING_ID',
      'id is required (the Pyth price feed id as a 0x-prefixed bytes32). Pass it via `ids:`.',
    )
  }

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl || undefined),
  })

  const [price, conf, expo, publishTime] = await publicClient.readContract({
    address: contract,
    abi: PYTH_ABI,
    functionName: 'getPriceUnsafe',
    args: [id],
  })

  const expoNum = Number(expo)
  const value = Number(price) * 10 ** expoNum

  core.info(`getPriceUnsafe: chain=${network} id=${id} price=${price} expo=${expoNum} (~ ${value})`)

  return {
    id,
    price: price.toString(),
    conf: conf.toString(),
    expo: expoNum,
    publishTime: publishTime.toString(),
    value,
    chain: network,
    contract,
  }
}

/**
 * Submit a priceUpdateData blob to Pyth's on-chain contract.
 *
 * The caller (workflow) supplies `value` in wei. The action used to
 * read `getUpdateFee` internally and max it against a default, but
 * that policy decision belongs in the workflow: it's where slippage
 * tolerances, fee ceilings, and circuit breakers live. Authors who
 * need the on-chain fee can compute it with the `get-update-fee`
 * command and pass it through `value: ${{ to_bigint(...) }}`.
 *
 * @param {object} opts
 * @param {string} opts.network — Chain key (avalanche, ethereum, base, ...)
 * @param {string[]} opts.updateData — Hex-string array from Hermes `binary.data`.
 * @param {string} opts.value — `msg.value` in wei. Required; the action
 *   no longer guesses or defaults this. Must be a decimal or `0x`-hex
 *   integer string parsable as `BigInt`.
 * @param {string} [opts.rpcUrl] — Optional custom RPC URL.
 * @returns {Promise<{ txHash, blockNumber, chain, contract, feedCount, gasUsed, from, status, value }>}
 */
export async function submitOnChain({ network, updateData, value, rpcUrl }) {
  if (value === undefined || value === null || value === '') {
    throw new W3ActionError(
      'MISSING_VALUE',
      'value is required (in wei). Compute it with the `get-update-fee` command and pass via `value: ${{ to_bigint(steps.fee.outputs.wei) }}`.',
    )
  }
  const txValue = parseWei(value)
  const { contract, chain, normalized, publicClient } = prepareCall({
    network,
    updateData,
    rpcUrl,
  })

  // Signer comes from a bridge-provisioned env var. The action holds
  // no policy — it parses, signs, and submits.
  const rawKey = process.env.W3_SECRET_ETHEREUM
  if (!rawKey) {
    throw new W3ActionError(
      'SIGNER_REQUIRED',
      'W3_SECRET_ETHEREUM env var not set — workflow must wire `env: W3_SECRET_ETHEREUM: ${{ secrets.W3_SECRET_ETHEREUM }}` on this step',
    )
  }
  const pkHex = rawKey.startsWith('0x') ? rawKey : '0x' + rawKey
  const account = privateKeyToAccount(pkHex)

  const transport = http(rpcUrl || undefined)
  const wallet = createWalletClient({ account, chain, transport })

  core.info(
    `submitOnChain: chain=${network} feeds=${normalized.length} value=${txValue} from=${account.address}`,
  )

  const hash = await wallet.writeContract({
    address: contract,
    abi: PYTH_ABI,
    functionName: 'updatePriceFeeds',
    args: [normalized],
    value: txValue,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })

  return {
    txHash: hash,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: String(receipt.gasUsed),
    chain: network,
    contract,
    feedCount: normalized.length,
    from: account.address,
    status: receipt.status,
    value: txValue.toString(),
  }
}

/**
 * Shared validation + viem client setup for the two on-chain commands.
 *
 * Throws domain-specific `W3ActionError`s for missing network, unknown
 * chain key, or malformed update-data so the caller's error surface
 * stays consistent.
 */
function prepareCall({ network, updateData, rpcUrl }) {
  if (!network) {
    throw new W3ActionError('MISSING_NETWORK', 'network is required')
  }
  const contract = PYTH_CONTRACTS[network]
  const chain = VIEM_CHAINS[network]
  if (!contract || !chain) {
    throw new W3ActionError('UNKNOWN_NETWORK', `Pyth not configured for: ${network}`)
  }
  if (!Array.isArray(updateData) || updateData.length === 0) {
    throw new W3ActionError(
      'MISSING_UPDATE_DATA',
      'update-data must be a non-empty array of hex strings from Hermes binary.data',
    )
  }
  const normalized = updateData.map((d) =>
    typeof d === 'string' && d.startsWith('0x') ? d : '0x' + d,
  )
  const transport = http(rpcUrl || undefined)
  const publicClient = createPublicClient({ chain, transport })
  return { contract, chain, normalized, publicClient }
}

/**
 * Parse a wei value from string into a `BigInt`. Accepts decimal or
 * `0x`-prefixed hex. Rejects negatives and empty strings.
 */
function parseWei(value) {
  const trimmed = String(value).trim()
  if (!trimmed) {
    throw new W3ActionError('INVALID_VALUE', 'value must not be empty')
  }
  let parsed
  try {
    parsed = BigInt(trimmed)
  } catch {
    throw new W3ActionError(
      'INVALID_VALUE',
      `value must be a decimal or 0x-hex integer (got: ${trimmed})`,
    )
  }
  if (parsed < 0n) {
    throw new W3ActionError('INVALID_VALUE', `value must be non-negative (got: ${parsed})`)
  }
  return parsed
}
