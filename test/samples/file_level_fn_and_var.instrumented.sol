/// This file is auto-generated by Scribble and shouldn't be edited directly.
/// Use --disarm prior to make any changes.
pragma solidity 0.7.5;

uint constant SOME = 10;

function addSome(uint v) pure returns (uint) {
    return v + SOME;
}

contract Test {
    uint internal num;

    function operate() public {
        _original_Test_operate();
        if (!(num == 25)) {
            emit __ScribbleUtilsLib__31.AssertionFailed("000389:0068:000 0: P1");
            assert(false);
        }
    }

    function _original_Test_operate() private {
        num = addSome(15);
    }
}

library __ScribbleUtilsLib__31 {
    event AssertionFailed(string message);

    event AssertionFailedData(int eventId, bytes encodingData);

    function assertionFailed(string memory arg_0) internal {
        emit AssertionFailed(arg_0);
    }

    function assertionFailedData(int arg_0, bytes memory arg_1) internal {
        emit AssertionFailedData(arg_0, arg_1);
    }

    function isInContract() internal returns (bool res) {
        assembly {
            res := sload(0x5f0b92cf9616afdee4f4136f66393f1343b027f01be893fa569eb2e2b667a40c)
        }
    }

    function setInContract(bool v) internal {
        assembly {
            sstore(0x5f0b92cf9616afdee4f4136f66393f1343b027f01be893fa569eb2e2b667a40c, v)
        }
    }
}
