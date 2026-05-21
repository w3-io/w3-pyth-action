/**
 * Pyth on-chain operations.
 *
 * Submits the priceUpdateData blob from a Hermes API read to Pyth's
 * on-chain Pull Oracle. Pairs with `get-prices` to close the loop:
 * read off-chain (cheap), commit on-chain (trusted), with both sides
 * referring to the same price observation.
 *
 * Uses the W3 bridge in @w3-io/action-core for ABI encoding and
 * signing — the action itself never holds a private key. The signing
 * key sits behind the bridge, addressed via the `W3_SECRET_*` env
 * exposed to the action.
 */

import * as core from '@actions/core'
import { ethereum, W3ActionError } from '@w3-io/action-core'

/**
 * Pyth Pull Oracle contract addresses per chain.
 *
 * Source: https://docs.pyth.network/price-feeds/contract-addresses/evm
 * Re-verify if a new chain is added.
 */
export const PYTH_CONTRACTS = Object.freeze({
  avalanche: '0x4305FB66699C3B2702D4d05CF36551390A4c69C6', // C-Chain mainnet
  ethereum: '0x4305FB66699C3B2702D4d05CF36551390A4c69C6',
  base: '0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a',
  arbitrum: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C',
  optimism: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C',
  polygon: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C',
})

/**
 * Submit a priceUpdateData blob to Pyth's on-chain contract.
 *
 * @param {object} opts
 * @param {string} opts.network — Chain key (avalanche, ethereum, base, ...)
 * @param {string[]} opts.updateData — Array of hex strings from the
 *   Hermes `binary.data` field. Each entry is one or more VAA-signed
 *   price updates.
 * @param {string} [opts.rpcUrl] — Optional custom RPC URL.
 * @param {string} [opts.value] — Optional `msg.value` in wei. Pyth
 *   requires `msg.value >= getUpdateFee(updateData)`. Defaults to
 *   "10000" — comfortable margin for ~10 feeds on Avalanche, and
 *   excess is kept by the contract, so don't overpay heavily.
 * @returns {Promise<{ txHash: string, blockNumber: number|null,
 *   chain: string, contract: string, feedCount: number }>}
 */
export async function submitOnChain({ network, updateData, rpcUrl, value = '10000' }) {
  if (!network) {
    throw new W3ActionError('MISSING_NETWORK', 'network is required')
  }
  const contract = PYTH_CONTRACTS[network]
  if (!contract) {
    throw new W3ActionError('UNKNOWN_NETWORK', `Pyth not configured for: ${network}`)
  }
  if (!Array.isArray(updateData) || updateData.length === 0) {
    throw new W3ActionError(
      'MISSING_UPDATE_DATA',
      'update-data must be a non-empty array of hex strings from Hermes binary.data',
    )
  }

  // Normalize entries to 0x-prefixed hex. Hermes returns bare hex
  // (no prefix) on parsed responses; ABI encoders want 0x.
  const normalized = updateData.map((d) =>
    typeof d === 'string' && d.startsWith('0x') ? d : '0x' + d,
  )

  // Pyth.updatePriceFeeds(bytes[] updateData) payable.
  // Method signature: bare form (no `function` prefix) matches
  // alloy-dyn-abi's expectations for the bridge's parser. The
  // `bytes[]` arg is passed as args[0] = array of 0x-prefixed hex
  // strings — one per VAA-signed price update from Hermes.
  const result = await ethereum.callContract(
    {
      contract,
      method: 'updatePriceFeeds(bytes[])',
      args: [normalized],
      value,
      ...(rpcUrl ? { rpcUrl } : {}),
    },
    network,
  )

  // Diagnostic — keep until txHash / blockNumber consistently surface.
  // Logs land in the step's logs section in the explorer.
  core.info(`bridge result keys: ${Object.keys(result || {}).join(', ')}`)
  core.info(`bridge result raw: ${JSON.stringify(result)}`)

  return {
    ...result,
    chain: network,
    contract,
    feedCount: normalized.length,
  }
}
