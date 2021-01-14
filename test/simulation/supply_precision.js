/*
    In this buidler script,
    During every iteration:
    * We double the total StaysBASE supply.
    * We test the following guarantee:
            - the difference in totalSupply() before and after the rebase(+1) should be exactly 1.

    USAGE:
    buidler run ./test/simulation/supply_precision.js
*/

const { ethers, web3, upgrades, expect, BigNumber, isEthException, awaitTx, waitForSomeTime, currentTime, toBASEDenomination } = require('../setup')

const endSupply = BigNumber.from(2).pow(128).sub(1)

let staysBASEToken, preRebaseSupply, postRebaseSupply
preRebaseSupply = BigNumber.from(0)
postRebaseSupply = BigNumber.from(0)

async function exec() {
    const accounts = await ethers.getSigners()
    const deployer = accounts[0]
    console.log('get account success', await deployer.getAddress());
    
    const StaysBASEToken = await ethers.getContractFactory('StaysBASEToken')

    console.log('------- StaysBASEToken address', StaysBASEToken.address);
    staysBASEToken = await upgrades.deployProxy(StaysBASEToken, [])
    await staysBASEToken.deployed()
    console.log('staysBASEToken deployed', staysBASEToken.address);
    staysBASEToken = staysBASEToken.connect(deployer)

    const monetaryPolicyAddress = await deployer.getAddress();
    console.log('Setting monetaryPolicyAddress', monetaryPolicyAddress);
    await awaitTx(staysBASEToken.setMonetaryPolicy(monetaryPolicyAddress));
    console.log('staysBASEToken configure done');

    let i = 0
    do {
        console.log('Iteration', i + 1)

        preRebaseSupply = await staysBASEToken.totalSupply()
        console.log('-------- Before rebase, total supply is:', preRebaseSupply.toString(), 'StaysBASE');
        await awaitTx(staysBASEToken.rebase(2 * i, 1))
        console.log('-------- Rebased by 1 StaysBASE success getting supply');
        postRebaseSupply = await staysBASEToken.totalSupply()
        console.log('-------- Total supply is now', postRebaseSupply.toString(), 'StaysBASE')

        console.log('Testing precision of supply')
        expect(postRebaseSupply.sub(preRebaseSupply).toNumber()).to.equal(1)

        console.log('Doubling supply')
        await awaitTx(staysBASEToken.rebase(2 * i + 1, postRebaseSupply))
        console.log('Doubling supply done');
        i++
    } while ((await staysBASEToken.totalSupply()).lt(endSupply))
}

exec()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })

