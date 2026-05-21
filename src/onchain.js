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

const PYTH_ABI = parseAbi(['function updatePriceFeeds(bytes[] updateData) payable'])

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
 *   "10000" — comfortable margin for ~10 feeds on Avalanche.
 * @returns {Promise<{ txHash, blockNumber, chain, contract, feedCount, gasUsed }>}
 */
export async function submitOnChain({ network, updateData, rpcUrl, value = '10000' }) {
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

  // The bridge convention: signers come from W3_SECRET_* env vars
  // provisioned by the runner from namespace secrets.
  const rawKey = process.env.W3_SECRET_ETHEREUM
  if (!rawKey) {
    throw new W3ActionError(
      'SIGNER_REQUIRED',
      'W3_SECRET_ETHEREUM env var not set — workflow must wire `env: W3_SECRET_ETHEREUM: ${{ secrets.W3_SECRET_ETHEREUM }}` on this step',
    )
  }
  const pkHex = rawKey.startsWith('0x') ? rawKey : '0x' + rawKey
  const account = privateKeyToAccount(pkHex)

  // Normalize entries to 0x-prefixed hex.
  const normalized = updateData.map((d) =>
    typeof d === 'string' && d.startsWith('0x') ? d : '0x' + d,
  )

  const transport = http(rpcUrl || undefined)
  const wallet = createWalletClient({ account, chain, transport })
  const publicClient = createPublicClient({ chain, transport })

  core.info(`submitOnChain: chain=${network} contract=${contract} feeds=${normalized.length} value=${value} from=${account.address}`)

  const hash = await wallet.writeContract({
    address: contract,
    abi: PYTH_ABI,
    functionName: 'updatePriceFeeds',
    args: [normalized],
    value: BigInt(value),
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
  }
}
