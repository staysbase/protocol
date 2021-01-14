pragma solidity 0.6.12;

import "../StaysBASETokenOrchestrator.sol";


contract ConstructorRebaseCallerContract {
    constructor(address orchestrator) public {
        // Take out a flash loan.
        // Do something funky...
        StaysBASETokenOrchestrator(orchestrator).rebase();  // should fail
        // pay back flash loan.
    }
}
