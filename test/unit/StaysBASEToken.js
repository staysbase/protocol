const { ethers, web3, upgrades, expect, BigNumber, isEthException, awaitTx, waitForSomeTime, currentTime, toBASEDenomination, DECIMALS } = require('../setup')

const INTIAL_SUPPLY = toBASEDenomination(50 * 10 ** 6)
const transferAmount = toBASEDenomination(10)
const unitTokenAmount = toBASEDenomination(1)
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

let staysBASEToken, b, r, deployer, deployerAddr, user, userAddr, initialSupply, accounts, provider
async function setupContracts() {
    accounts = await ethers.getSigners()
    ;([ deployer, user ] = accounts)
    deployerAddr = await deployer.getAddress()
    userAddr = await user.getAddress()

    const StaysBASEToken = await ethers.getContractFactory('StaysBASEToken')
    staysBASEToken = await upgrades.deployProxy(StaysBASEToken, [])
    await staysBASEToken.deployed()
    staysBASEToken = staysBASEToken.connect(deployer)
    initialSupply = await staysBASEToken.totalSupply()
}

describe('StaysBASEToken', () => {
    before('setup StaysBASEToken contract', setupContracts);

    it('should reject any ether sent to it', async () => {
        const asdf = await isEthException(user.sendTransaction({ to: staysBASEToken.address, value: 1 }));
        expect(
            asdf
        ).to.be.true;
    });
});

describe('StaysBASEToken:Initialization', () => {
    before('setup StaysBASEToken contract', setupContracts)

    it('should transfer 50M StaysBASE to the deployer', async () => {
        (await staysBASEToken.balanceOf(deployerAddr)).should.equal(INTIAL_SUPPLY)
    })

    it('should set the totalSupply to 50M', async () => {
        initialSupply.should.equal(INTIAL_SUPPLY)
    })

    it('should set the owner', async () => {
        expect(await staysBASEToken.owner()).to.equal(deployerAddr)
    })

    it('should set detailed ERC20 parameters', async () => {
        expect(await staysBASEToken.name()).to.equal('StaysBase Protocol')
        expect(await staysBASEToken.symbol()).to.equal('StaysBASE')
        expect(await staysBASEToken.decimals()).to.equal(DECIMALS)
    })

    it('should have 9 decimals', async () => {
        const decimals = await staysBASEToken.decimals()
        expect(decimals).to.equal(DECIMALS)
    })

    it('should have StaysBASE symbol', async () => {
        const symbol = await staysBASEToken.symbol()
        expect(symbol).to.equal('StaysBASE')
    })
})

describe('StaysBASEToken:setMonetaryPolicy', () => {
    before('setup StaysBASEToken contract', setupContracts)

    it('should set reference to policy contract', async () => {
        const policy = accounts[1]
        const policyAddr = await policy.getAddress()
        await staysBASEToken.setMonetaryPolicy(policyAddr)
        expect(await staysBASEToken.monetaryPolicy()).to.equal(policyAddr)
    })

    it('should emit policy updated event', async () => {
        const policy = accounts[1]
        const policyAddr = await policy.getAddress()
        const r = await awaitTx(staysBASEToken.setMonetaryPolicy(policyAddr))
        const log = r.events[0]
        expect(log).to.exist
        expect(log.event).to.equal('LogMonetaryPolicyUpdated')
        expect(log.args.monetaryPolicy).to.equal(policyAddr)
    })
})

describe('StaysBASEToken:setMonetaryPolicy:accessControl', () => {
    before('setup StaysBASEToken contract', setupContracts)

    it('should be callable by owner', async () => {
        const policy = accounts[1]
        const policyAddr = await policy.getAddress()
        expect(
            await isEthException(staysBASEToken.setMonetaryPolicy(policyAddr))
        ).to.be.false
    })
})

describe('StaysBASEToken:setMonetaryPolicy:accessControl', () => {
    before('setup StaysBASEToken contract', setupContracts)

    it('should NOT be callable by non-owner', async () => {
        const policy = accounts[1]
        const user = accounts[2]
        const policyAddr = await policy.getAddress()
        expect(
            await isEthException(staysBASEToken.connect(user).setMonetaryPolicy(policyAddr))
        ).to.be.true
    })
})

describe('StaysBASEToken:Rebase:accessControl', () => {
    before('setup StaysBASEToken contract', async () => {
        await setupContracts()
        await staysBASEToken.setMonetaryPolicy(userAddr)
    })

    it('should be callable by monetary policy', async () => {
        expect(
            await isEthException(staysBASEToken.connect(user).rebase(1, transferAmount))
        ).to.be.false
    })

    it('should not be callable by others', async () => {
        expect(
            await isEthException(staysBASEToken.rebase(1, transferAmount))
        ).to.be.true
    })
})

describe('StaysBASEToken:Rebase:Expansion', () => {
    // Rebase +5M (10%), with starting balances A:750 and B:250.
    let A, B, policy
    const rebaseAmt = INTIAL_SUPPLY / 10

    before('setup StaysBASEToken contract', async () => {
        await setupContracts()
        A = accounts[2]
        B = accounts[3]
        policy = accounts[1]
        const policyAddr = await policy.getAddress()
        await awaitTx(staysBASEToken.setMonetaryPolicy(policyAddr))
        await awaitTx(staysBASEToken.transfer(await A.getAddress(), toBASEDenomination(750)))
        await awaitTx(staysBASEToken.transfer(await B.getAddress(), toBASEDenomination(250)))
        r = await awaitTx(staysBASEToken.connect(policy).rebase(1, rebaseAmt))
    })

    it('should increase the totalSupply', async () => {
        b = await staysBASEToken.totalSupply()
        expect(b).to.equal(initialSupply.add(rebaseAmt))
    })

    it('should increase individual balances', async () => {
        b = await staysBASEToken.balanceOf(await A.getAddress())
        expect(b).to.equal(toBASEDenomination(825))

        b = await staysBASEToken.balanceOf(await B.getAddress())
        expect(b).to.equal(toBASEDenomination(275))
    })

    it('should emit Rebase', async () => {
        const log = r.events[0]
        expect(log).to.exist
        expect(log.event).to.equal('LogRebase')
        expect(log.args.epoch).to.equal(1)
        expect(log.args.totalSupply).to.equal(initialSupply.add(rebaseAmt))
    })
})

describe('StaysBASEToken:Rebase:Expansion', () => {
    const MAX_SUPPLY = BigNumber.from(2).pow(128).sub(1)
    let policy

    describe('when totalSupply is less than MAX_SUPPLY and expands beyond', () => {
        before('setup StaysBASEToken contract', async () => {
            await setupContracts()
            policy = accounts[1]
            const policyAddr = await policy.getAddress()
            await awaitTx(staysBASEToken.setMonetaryPolicy(policyAddr))
            const totalSupply = await staysBASEToken.totalSupply()
            await awaitTx(staysBASEToken.connect(policy).rebase(1, MAX_SUPPLY.sub(totalSupply).sub(toBASEDenomination(1))))
            r = await awaitTx(staysBASEToken.connect(policy).rebase(2, toBASEDenomination(2)))
        })

        it('should increase the totalSupply to MAX_SUPPLY', async () => {
            b = await staysBASEToken.totalSupply()
            expect(b).to.equal(MAX_SUPPLY)
        })

        it('should emit Rebase', async () => {
            const log = r.events[0]
            expect(log).to.exist
            expect(log.event).to.equal('LogRebase')
            expect(log.args.epoch.toNumber()).to.equal(2)
            expect(log.args.totalSupply).to.equal(MAX_SUPPLY)
        })
    })

    describe('when totalSupply is MAX_SUPPLY and expands', () => {
        before(async () => {
            b = await staysBASEToken.totalSupply()
            expect(b).to.equal(MAX_SUPPLY)
            r = await awaitTx(staysBASEToken.connect(policy).rebase(3, toBASEDenomination(2)))
        })

        it('should NOT change the totalSupply', async () => {
            b = await staysBASEToken.totalSupply()
            expect(b).to.equal(MAX_SUPPLY)
        })

        it('should emit Rebase', async () => {
            const log = r.events[0]
            expect(log).to.exist
            expect(log.event).to.equal('LogRebase')
            expect(log.args.epoch.toNumber()).to.equal(3)
            expect(log.args.totalSupply).to.equal(MAX_SUPPLY)
        })
    })
})

describe('StaysBASEToken:Rebase:NoChange', () => {
    // Rebase (0%), with starting balances A:750 and B:250.
    let A, B, policy

    before('setup StaysBASEToken contract', async () => {
        await setupContracts()
        A = accounts[2]
        B = accounts[3]
        policy = accounts[1]
        const policyAddr = await policy.getAddress()
        await awaitTx(staysBASEToken.setMonetaryPolicy(policyAddr))
        await awaitTx(staysBASEToken.transfer(await A.getAddress(), toBASEDenomination(750)))
        await awaitTx(staysBASEToken.transfer(await B.getAddress(), toBASEDenomination(250)))
        r = await awaitTx(staysBASEToken.connect(policy).rebase(1, 0))
    })

    it('should NOT CHANGE the totalSupply', async () => {
        b = await staysBASEToken.totalSupply()
        expect(b).to.equal(initialSupply)
    })

    it('should NOT CHANGE individual balances', async () => {
        b = await staysBASEToken.balanceOf(await A.getAddress())
        expect(b).to.equal(toBASEDenomination(750))

        b = await staysBASEToken.balanceOf(await B.getAddress())
        expect(b).to.equal(toBASEDenomination(250))
    })

    it('should emit Rebase', async () => {
        const log = r.events[0]
        expect(log).to.exist
        expect(log.event).to.equal('LogRebase')
        expect(log.args.epoch).to.equal(1)
        expect(log.args.totalSupply).to.equal(initialSupply)
    })
})

describe('StaysBASEToken:Rebase:Contraction', () => {
    // Rebase -5M (-10%), with starting balances A:750 and B:250.
    const rebaseAmt = INTIAL_SUPPLY / 10
    let A, B, policy

    before('setup StaysBASEToken contract', async () => {
        await setupContracts()
        A = accounts[2]
        B = accounts[3]
        policy = accounts[1]
        const policyAddr = await policy.getAddress()
        await awaitTx(staysBASEToken.setMonetaryPolicy(policyAddr))
        await awaitTx(staysBASEToken.transfer(await A.getAddress(), toBASEDenomination(750)))
        await awaitTx(staysBASEToken.transfer(await B.getAddress(), toBASEDenomination(250)))
        r = await awaitTx(staysBASEToken.connect(policy).rebase(1, -rebaseAmt))
    })

    it('should decrease the totalSupply', async () => {
        b = await staysBASEToken.totalSupply()
        expect(b).to.equal(initialSupply.sub(rebaseAmt))
    })

    it('should decrease individual balances', async () => {
        b = await staysBASEToken.balanceOf(await A.getAddress())
        expect(b).to.equal(toBASEDenomination(675))

        b = await staysBASEToken.balanceOf(await B.getAddress())
        expect(b).to.equal(toBASEDenomination(225))
    })

    it('should emit Rebase', async () => {
        const log = r.events[0]
        expect(log).to.exist
        expect(log.event).to.equal('LogRebase')
        expect(log.args.epoch).to.equal(1)
        expect(log.args.totalSupply).to.equal(initialSupply.sub(rebaseAmt))
    })
})

describe('StaysBASEToken:Transfer', () => {
    let A, B, C

    before('setup StaysBASEToken contract', async () => {
        await setupContracts()
        A = accounts[2]
        B = accounts[3]
        C = accounts[4]
    })

    describe('deployer transfers 12 to A', () => {
        it('should have correct balances', async () => {
            const deployerBefore = await staysBASEToken.balanceOf(await deployer.getAddress())
            await awaitTx(staysBASEToken.transfer(await A.getAddress(), toBASEDenomination(12)))
            b = await staysBASEToken.balanceOf(await deployer.getAddress())
            expect(b).to.equal(deployerBefore.sub(toBASEDenomination(12)))
            b = await staysBASEToken.balanceOf(await A.getAddress())
            expect(b).to.equal(toBASEDenomination(12))
        })
    })

    describe('deployer transfers 15 to B', async () => {
        it('should have balances [973,15]', async () => {
            const deployerBefore = await staysBASEToken.balanceOf(await deployer.getAddress())
            await awaitTx(staysBASEToken.transfer(await B.getAddress(), toBASEDenomination(15)))
            b = await staysBASEToken.balanceOf(await deployer.getAddress())
            expect(b).to.equal(deployerBefore.sub(toBASEDenomination(15)))
            b = await staysBASEToken.balanceOf(await B.getAddress())
            expect(b).to.equal(toBASEDenomination(15))
        })
    })

    describe('deployer transfers the rest to C', async () => {
        it('should have balances [0,973]', async () => {
            const deployerBefore = await staysBASEToken.balanceOf(await deployer.getAddress())
            await awaitTx(staysBASEToken.transfer(await C.getAddress(), deployerBefore))
            b = await staysBASEToken.balanceOf(await deployer.getAddress())
            expect(b).to.equal(0)
            b = await staysBASEToken.balanceOf(await C.getAddress())
            expect(b).to.equal(deployerBefore)
        })
    })

    describe('when the recipient address is the contract address', async () => {
        it('reverts on transfer', async () => {
            const owner = A
            expect(
                await isEthException(staysBASEToken.connect(owner).transfer(staysBASEToken.address, unitTokenAmount))
            ).to.be.true
        })

        it('reverts on transferFrom', async () => {
            const owner = A
            expect(
                await isEthException(staysBASEToken.connect(owner).transferFrom(await owner.getAddress(), staysBASEToken.address, unitTokenAmount))
            ).to.be.true
        })
    })

    describe('when the recipient is the zero address', () => {
        before(async () => {
            const owner = A
            r = await awaitTx(staysBASEToken.connect(owner).approve(ZERO_ADDRESS, transferAmount))
        })

        it('emits an approval event', async () => {
            const owner = A
            expect(r.events.length).to.equal(1)
            expect(r.events[0].event).to.equal('Approval')
            expect(r.events[0].args.owner).to.equal(await owner.getAddress())
            expect(r.events[0].args.spender).to.equal(ZERO_ADDRESS)
            expect(r.events[0].args.value).to.equal(transferAmount)
        })

        it('transferFrom should fail', async () => {
            const owner = A
            expect(
                await isEthException(staysBASEToken.connect(C).transferFrom(await owner.getAddress(), ZERO_ADDRESS, transferAmount))
            ).to.be.true
        })
    })
})
