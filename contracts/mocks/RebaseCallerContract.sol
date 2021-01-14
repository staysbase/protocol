pragma solidity 0.6.12;

import "../StaysBASETokenOrchestrator.sol";


contract RebaseCallerContract {

    function callRebase(address orchestrator) public returns (bool) {
        // Take out a flash loan.
        // Do something funky...
        StaysBASETokenOrchestrator(orchestrator).rebase();  // should fail
        // pay back flash loan.
        return true;
    }
}
