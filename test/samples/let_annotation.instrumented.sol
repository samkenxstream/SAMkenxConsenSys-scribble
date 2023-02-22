/// This file is auto-generated by Scribble and shouldn't be edited directly.
/// Use --disarm prior to make any changes.
pragma solidity 0.8.11;

contract LetAnnotation {
    struct vars0 {
        uint256 oldVal;
    }

    struct vars1 {
        uint256 oldVal1;
    }

    struct vars2 {
        uint256 oldVal2;
    }

    function foo(uint amount) public {
        vars0 memory _v;
        uint[] memory a;
        for (uint i = 0; i < a.length; i++) {
            unchecked {
                _v.oldVal = a[i];
            }
            a[i] += amount;
            unchecked {
                if (!(_v.oldVal > 0)) {
                    emit __ScribbleUtilsLib__100.AssertionFailed("1: ");
                    assert(false);
                }
            }
            0;
        }
    }

    function foo1(uint amount) public {
        vars1 memory _v;
        uint[] memory a;
        for (uint i = 0; i < a.length; i++) {
            unchecked {
                _v.oldVal1 = a[i];
                if (!(_v.oldVal1 > 0)) {
                    emit __ScribbleUtilsLib__100.AssertionFailed("3: ");
                    assert(false);
                }
            }
            a[i] += amount;
            0;
        }
    }

    function foo2(uint amount) public {
        vars2 memory _v;
        uint[] memory a;
        unchecked {
            _v.oldVal2 = a[0];
        }
        for (uint i = 0; i < a.length; i++) {
            unchecked {
                if (!(_v.oldVal2 > 0)) {
                    emit __ScribbleUtilsLib__100.AssertionFailed("5: ");
                    assert(false);
                }
            }
            a[i] += amount;
        }
    }
}

library __ScribbleUtilsLib__100 {
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
