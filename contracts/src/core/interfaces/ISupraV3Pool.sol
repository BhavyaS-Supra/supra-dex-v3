// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import './pool/ISupraV3PoolImmutables.sol';
import './pool/ISupraV3PoolState.sol';
import './pool/ISupraV3PoolDerivedState.sol';
import './pool/ISupraV3PoolActions.sol';
import './pool/ISupraV3PoolOwnerActions.sol';
import './pool/ISupraV3PoolEvents.sol';

/// @title The interface for a Uniswap V3 Pool
/// @notice A Uniswap pool facilitates swapping and automated market making between any two assets that strictly conform
/// to the ERC20 specification
/// @dev The pool interface is broken up into many smaller pieces
interface ISupraV3Pool is
    ISupraV3PoolImmutables,
    ISupraV3PoolState,
    ISupraV3PoolDerivedState,
    ISupraV3PoolActions,
    ISupraV3PoolOwnerActions,
    ISupraV3PoolEvents
{}
