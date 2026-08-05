// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@openzeppelin/contracts/utils/Strings.sol';

import './interfaces/ISupraV3PositionDescriptor.sol';
import './interfaces/IERC20Metadata.sol';
import './libraries/Base64.sol';

/// @title Supra V3 position descriptor
/// @notice Fork of Uniswap's NonfungibleTokenPositionDescriptor with the on-chain animated SVG
/// renderer removed. Returns a plain JSON metadata data URI with the position's real fields
/// (token0, token1, fee, tick range, liquidity) instead of generated artwork.
contract SupraV3PositionDescriptor is ISupraV3PositionDescriptor {
    using Strings for uint256;

    /// @inheritdoc ISupraV3PositionDescriptor
    function tokenURI(ISupraV3PositionManager positionManager, uint256 tokenId)
        external
        view
        override
        returns (string memory)
    {
        (,, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity,,,,) =
            positionManager.positions(tokenId);

        return _buildTokenURI(token0, token1, fee, tickLower, tickUpper, liquidity, tokenId);
    }

    function _buildTokenURI(
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 tokenId
    ) private view returns (string memory) {
        bytes memory json = _header(token0, token1);

        json = abi.encodePacked(json, _attr('token0', _addressToString(token0)), ',');
        json = abi.encodePacked(json, _attr('token1', _addressToString(token1)), ',');
        json = abi.encodePacked(json, _attr('fee', uint256(fee).toString()), ',');
        json = abi.encodePacked(json, _attr('tickLower', _int24ToString(tickLower)), ',');
        json = abi.encodePacked(json, _attr('tickUpper', _int24ToString(tickUpper)), ',');
        json = abi.encodePacked(json, _attr('liquidity', uint256(liquidity).toString()), ',');
        json = abi.encodePacked(json, _attr('tokenId', tokenId.toString()), ']}');

        return string(abi.encodePacked('data:application/json;base64,', Base64.encode(json)));
    }

    function _header(address token0, address token1) private view returns (bytes memory) {
        string memory symbol0 = _symbol(token0);
        string memory symbol1 = _symbol(token1);
        return abi.encodePacked(
            '{"name":"Supra V3 Position",',
            '"description":"Liquidity position in a Supra V3 ',
            symbol0,
            '/',
            symbol1,
            ' pool.",',
            '"attributes":['
        );
    }

    function _attr(string memory traitType, string memory value) private pure returns (bytes memory) {
        return abi.encodePacked('{"trait_type":"', traitType, '","value":"', value, '"}');
    }

    function _symbol(address token) private view returns (string memory) {
        try IERC20Metadata(token).symbol() returns (string memory _sym) {
            return _escapeJSON(_sym);
        } catch {
            return 'UNKNOWN';
        }
    }

    /// @notice Escapes '"' and '\' in a token-supplied string so it can't break out of the
    /// surrounding JSON string literal. Token symbols are attacker-controlled (arbitrary
    /// ERC20 can return any string), so this metadata must not be interpolated unescaped.
    function _escapeJSON(string memory input) internal pure returns (string memory) {
        bytes memory raw = bytes(input);
        uint256 extra = 0;
        for (uint256 i = 0; i < raw.length; i++) {
            if (raw[i] == '"' || raw[i] == '\\') {
                extra++;
            }
        }
        if (extra == 0) {
            return input;
        }
        bytes memory escaped = new bytes(raw.length + extra);
        uint256 j = 0;
        for (uint256 i = 0; i < raw.length; i++) {
            if (raw[i] == '"' || raw[i] == '\\') {
                escaped[j++] = '\\';
            }
            escaped[j++] = raw[i];
        }
        return string(escaped);
    }

    function _addressToString(address addr) private pure returns (string memory) {
        bytes memory data = abi.encodePacked(addr);
        bytes memory alphabet = '0123456789abcdef';
        bytes memory str = new bytes(2 + data.length * 2);
        str[0] = '0';
        str[1] = 'x';
        for (uint256 i = 0; i < data.length; i++) {
            str[2 + i * 2] = alphabet[uint8(data[i] >> 4)];
            str[3 + i * 2] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }

    function _int24ToString(int24 value) private pure returns (string memory) {
        if (value >= 0) {
            return uint256(value).toString();
        } else {
            return string(abi.encodePacked('-', uint256(-int256(value)).toString()));
        }
    }
}
