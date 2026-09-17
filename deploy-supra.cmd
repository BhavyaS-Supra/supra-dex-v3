@echo off
setlocal enabledelayedexpansion

rem Deploys SupraV3Factory, the periphery contracts, and the test tokens to
rem Supra EVM devnet (supra_evm_devnet, foundry.toml), in the order required
rem by DeployPeriphery (it needs the factory address from DeployCore).
rem
rem Usage:
rem   set PRIVATE_KEY=0x...
rem   deploy-supra.cmd

if "%PRIVATE_KEY%"=="" (
    echo ERROR: set the PRIVATE_KEY environment variable to your deployer key first.
    echo   set PRIVATE_KEY=0x...
    exit /b 1
)

set "RPC=supra_evm_devnet"
set "CONTRACTS_DIR=%~dp0contracts"

pushd "%CONTRACTS_DIR%" || exit /b 1

echo === 1/3: Deploying core (SupraV3Factory) ===
forge script script/DeployCore.s.sol --rpc-url %RPC% --broadcast --private-key %PRIVATE_KEY% > deploy_core.log
type deploy_core.log
if errorlevel 1 (
    echo.
    echo DeployCore failed - see contracts\deploy_core.log
    popd
    exit /b 1
)

set "FACTORY_ADDRESS="
for /f "tokens=4" %%A in ('findstr /C:"SupraV3Factory deployed to:" deploy_core.log') do set "FACTORY_ADDRESS=%%A"

if "%FACTORY_ADDRESS%"=="" (
    echo.
    echo ERROR: could not parse the factory address out of deploy_core.log
    popd
    exit /b 1
)
echo Factory address: %FACTORY_ADDRESS%

echo.
echo === 2/3: Deploying periphery (WETH9, PositionDescriptor, SwapRouter, PositionManager, QuoterV2, TickLens) ===
forge script script/DeployPeriphery.s.sol --rpc-url %RPC% --broadcast --private-key %PRIVATE_KEY% > deploy_periphery.log
type deploy_periphery.log
if errorlevel 1 (
    echo.
    echo DeployPeriphery failed - see contracts\deploy_periphery.log
    popd
    exit /b 1
)

echo.
echo === 3/3: Deploying test tokens (tUSD, tETH) ===
forge script script/DeployTestTokens.s.sol --rpc-url %RPC% --broadcast --private-key %PRIVATE_KEY% > deploy_test_tokens.log
type deploy_test_tokens.log
if errorlevel 1 (
    echo.
    echo DeployTestTokens failed - see contracts\deploy_test_tokens.log
    popd
    exit /b 1
)

popd

echo.
echo === Done ===
echo All addresses are printed above and saved in contracts\deploy_core.log,
echo contracts\deploy_periphery.log and contracts\deploy_test_tokens.log.
echo Copy them into frontend\.env.supra, then use it as frontend\.env.local
echo when you want the frontend pointed at Supra EVM devnet.

endlocal
