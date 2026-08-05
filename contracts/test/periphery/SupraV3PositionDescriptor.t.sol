// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import 'forge-std/Test.sol';
import '../../src/periphery/SupraV3PositionDescriptor.sol';

/// @dev Exposes the internal escaping helper so the fix can be tested directly.
contract SupraV3PositionDescriptorHarness is SupraV3PositionDescriptor {
    function escapeJSON(string memory input) external pure returns (string memory) {
        return _escapeJSON(input);
    }
}

contract SupraV3PositionDescriptorTest is Test {
    SupraV3PositionDescriptorHarness descriptor;

    function setUp() public {
        descriptor = new SupraV3PositionDescriptorHarness();
    }

    function test_EscapeJSON_EscapesQuotesAndBackslashes() public {
        string memory malicious = 'EVIL","attributes":[{"trait_type":"pwned';
        string memory escaped = descriptor.escapeJSON(malicious);
        assertEq(escaped, 'EVIL\\",\\"attributes\\":[{\\"trait_type\\":\\"pwned');
    }

    function test_EscapeJSON_EscapesBackslash() public {
        string memory escaped = descriptor.escapeJSON('a\\b');
        assertEq(escaped, 'a\\\\b');
    }

    function test_EscapeJSON_LeavesPlainSymbolUnchanged() public {
        string memory escaped = descriptor.escapeJSON('WETH');
        assertEq(escaped, 'WETH');
    }
}
