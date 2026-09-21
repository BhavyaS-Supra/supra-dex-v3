import { useMemo } from 'react';
import { useWriteContract } from 'wagmi';

// Supra EVM devnet can't estimate gas reliably through the wallet, so transactions on it are sent
// with explicit gas parameters (the same ones that work with `cast --gas-limit/--gas-price`).
const SUPRA_DEVNET_CHAIN_ID = 953497288926;
const DEVNET_GAS_LIMIT = 500_000n;
const DEVNET_GAS_PRICE = 666_666_600_001n;

const chainId = Number(process.env.NEXT_PUBLIC_SUPRA_EVM_CHAIN_ID);
const needsExplicitGas = chainId === SUPRA_DEVNET_CHAIN_ID;

export function useWriteContractWithGas() {
  const write = useWriteContract();
  const { mutate, mutateAsync } = write;

  return useMemo(() => {
    if (!needsExplicitGas) return write;
    const withGas = <T extends object>(vars: T) =>
      ({ gas: DEVNET_GAS_LIMIT, gasPrice: DEVNET_GAS_PRICE, ...vars }) as T;
    return {
      ...write,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutate: ((vars: any, opts?: any) => mutate(withGas(vars), opts)) as typeof mutate,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutateAsync: ((vars: any, opts?: any) => mutateAsync(withGas(vars), opts)) as typeof mutateAsync,
    };
  }, [write, mutate, mutateAsync]);
}
