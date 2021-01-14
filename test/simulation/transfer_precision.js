/*
    In this buidler script, we generate random cycles of StaysBASE growth and contraction
    and test the precision of StaysBASE transfers

    During every iteration, percentageGrowth is sampled from a unifrom distribution between [-50%,250%]
    and the StaysBASE total supply grows/contracts.

    In each cycle we test the following guarantees:
    - If address 'A' transfers x StaysBASE to address 'B'. A's resulting external balance will
    be decreased by precisely x StaysBASE, and B's external balance will be precisely
    increased by x StaysBASE.

    USAGE:
    buidler run ./test/simulation/transfer_precision.js
*/

const { ethers, web3, upgrades, expect, BigNumber, isEthException, awaitTx, waitForSomeTime, currentTime, toBASEDenomination } = require('../setup')

const Stochasm = require('stochasm')

const endSupply = BigNumber.from(2).pow(128).sub(1)
const staysBASETokenGrowth = new Stochasm({ min: -0.5, max: 2.5, seed: 'baseprotocol.org' })

let staysBASEToken, rebaseAmt, inflation, preRebaseSupply, postRebaseSupply
rebaseAmt = BigNumber.from(0)
preRebaseSupply = BigNumber.from(0)
postRebaseSupply = BigNumber.from(0)

async function checkBalancesAfterOperation(users, op, chk) {
    const _bals = await Promise.all(
        users.map(async (user) => staysBASEToken.balanceOf(await user.getAddress()))
    )
    await op()
    const bals = await Promise.all(
        users.map(async (user) => staysBASEToken.balanceOf(await user.getAddress()))
    )
    chk(_bals, bals)
}

async function checkBalancesAfterTransfer (users, tAmt) {
    await checkBalancesAfterOperation(users, async () => {
        await awaitTx(staysBASEToken.connect(users[0]).transfer(await users[1].getAddress(), tAmt))
    }, ([_u0Bal, _u1Bal], [u0Bal, u1Bal]) => {
        const _sum = _u0Bal.add(_u1Bal)
        const sum = u0Bal.add(u1Bal)
        expect(_sum.eq(sum)).to.be.true
        expect(_u0Bal.sub(tAmt).eq(u0Bal)).to.be.true
        expect(_u1Bal.add(tAmt).eq(u1Bal)).to.be.true
    })
}

async function exec() {
    const accounts = await ethers.getSigners()
    const deployer = accounts[0]
    const user = accounts[1]
    const StaysBASEToken = await ethers.getContractFactory('StaysBASEToken')
    staysBASEToken = await upgrades.deployProxy(StaysBASEToken, [])
    await staysBASEToken.deployed()
    staysBASEToken = staysBASEToken.connect(deployer)
    await awaitTx(staysBASEToken.setMonetaryPolicy(await deployer.getAddress()))

    let i = 0
    do {
        await awaitTx(staysBASEToken.rebase(i + 1, rebaseAmt))
        postRebaseSupply = await staysBASEToken.totalSupply()
        i++

        console.log('Rebased iteration', i)
        console.log('Rebased by', (rebaseAmt.toString()), 'StaysBASE')
        console.log('Total supply is now', postRebaseSupply.toString(), 'StaysBASE')

        console.log('Testing precision of 1c transfer')
        await checkBalancesAfterTransfer([deployer, user], 1)
        await checkBalancesAfterTransfer([user, deployer], 1)

        console.log('Testing precision of max denomination')
        const tAmt = (await staysBASEToken.balanceOf(await deployer.getAddress()))
        await checkBalancesAfterTransfer([deployer, user], tAmt)
        await checkBalancesAfterTransfer([user, deployer], tAmt)

        preRebaseSupply = await staysBASEToken.totalSupply()
        let next = staysBASETokenGrowth.next().toFixed(5)
        console.log(next, '/', next * 100000)
        inflation = BigNumber.from(Math.trunc(next * 100000))
        rebaseAmt = preRebaseSupply.mul(inflation).div(100000)
    } while ((await staysBASEToken.totalSupply()).add(rebaseAmt).lt(endSupply))
}

exec()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
