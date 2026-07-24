# Supra V3 contracts

A fork of `Uniswap/v3-core` (tag `v1.0.0`) and `Uniswap/v3-periphery` (tag `v1.3.0`) adapted for
Supra's EVM MultiVM chain and built with Foundry. See the repo root `README.md` for the full
picture (frontend, deployment flow, what was changed from upstream).

## Layout

- `src/core/` — factory, pool, and math libraries (`SupraV3Factory`, `SupraV3Pool`, ...), Solidity 0.7.6, unchanged from upstream logic aside from renames.
- `src/periphery/` — router, position manager, quoter, etc. (`SupraV3SwapRouter`, `SupraV3PositionManager`, ...). The on-chain SVG NFT renderer was replaced with `SupraV3PositionDescriptor`, a simplified JSON `tokenURI`.
- `src/test-tokens/TestERC20.sol` — mintable ERC20 for local/testnet swap testing, not part of the protocol.
- `test/` — Foundry tests covering core pool mechanics and periphery flows.
- `script/` — deployment scripts. **Nothing has been deployed** - run these yourself when ready.

## Usage

Foundry must be on your `PATH` (`~/.foundry/bin`).

```shell
forge build              # compile
forge build --sizes      # check contract sizes against the 24KB limit
forge test                # run the test suite
forge test -vvvv          # with full call traces
```

### Deploying (when you're ready — not done by this repo)

```shell
# 1. Factory
forge script script/DeployCore.s.sol --rpc-url <supra-rpc> --broadcast --private-key <key>

# 2. Periphery (needs the factory address from step 1)
FACTORY_ADDRESS=0x... forge script script/DeployPeriphery.s.sol --rpc-url <supra-rpc> --broadcast --private-key <key>

# 3. Optional: test tokens for exercising the UI
forge script script/DeployTestTokens.s.sol --rpc-url <supra-rpc> --broadcast --private-key <key>
```

Then fill in `frontend/.env.local` with the resulting addresses (see `frontend/.env.local.example`).

If you ever modify `SupraV3Pool.sol`, re-run `forge script script/ComputeInitCodeHash.s.sol` and
update `POOL_INIT_CODE_HASH` in `src/periphery/libraries/PoolAddress.sol` — it's a hash of the
pool's creation bytecode that periphery uses to derive pool addresses without an external call,
and it goes stale silently if the pool's bytecode changes.
