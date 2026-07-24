# Supra V3 DEX

A Uniswap V3-style concentrated-liquidity DEX for Supra's EVM MultiVM chain: a fork of the real
`Uniswap/v3-core` and `Uniswap/v3-periphery` contracts, built with Foundry, plus a basic Next.js +
StarKey swap frontend.

**Nothing in this repo has been deployed anywhere.** Contracts are built and tested locally only;
deployment scripts exist under `contracts/script/` for you to run when you're ready.

## Structure

```
supra-dex-v3/
├── contracts/     Foundry project - forked + adapted Uniswap V3 core & periphery
└── frontend/      Next.js 16 + viem + wagmi swap UI, StarKey-first wallet connect
```

## What's in the fork

- **Core** (`contracts/src/core`): `SupraV3Factory`, `SupraV3Pool`, tick/oracle/swap math libraries — forked from `Uniswap/v3-core@v1.0.0`, kept on Solidity 0.7.6 to preserve the original's overflow-sensitive math exactly as audited.
- **Periphery** (`contracts/src/periphery`): `SupraV3SwapRouter`, `SupraV3PositionManager`, `QuoterV2`, `TickLens` — forked from `Uniswap/v3-periphery@v1.3.0`.
- **Simplified position NFT**: the real on-chain animated SVG renderer was dropped in favor of `SupraV3PositionDescriptor`, which returns a plain JSON `tokenURI` with the position's real fields (tokens, fee, tick range, liquidity).
- Entry-point contracts were renamed (`UniswapV3Pool` → `SupraV3Pool`, etc.); the math libraries keep their original names since there's no reason to rename generic utilities.

See `contracts/README.md` for build/test/deploy commands.

## Frontend

Basic swap UI only (no liquidity-management screen): connect wallet (StarKey first, MetaMask
fallback), pick tokens from an env-configured list, get a live quote from `QuoterV2`, approve if
needed, swap via `SupraV3SwapRouter.exactInputSingle`.

```shell
cd frontend
pnpm install
cp .env.local.example .env.local   # fill in addresses after you deploy
pnpm dev
```

Until `contracts/script/*.s.sol` have been run and the resulting addresses filled into
`frontend/.env.local`, the swap card shows a placeholder instead of a live UI — this is expected.

## Getting from here to a live deployment

1. `cd contracts && forge test` — confirm everything still passes.
2. Run `script/DeployCore.s.sol`, then `script/DeployPeriphery.s.sol` (needs the factory address), then optionally `script/DeployTestTokens.s.sol` — against whichever Supra RPC endpoint you're targeting.
3. Copy the deployed addresses into `frontend/.env.local`.
4. `pnpm dev` (or `pnpm build && pnpm start`) and connect StarKey (EVM mode) or MetaMask to swap.
