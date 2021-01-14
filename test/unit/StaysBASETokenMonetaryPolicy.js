const { ethers, web3, upgrades, expect, BigNumber, isEthException, awaitTx, waitForSomeTime, currentTime, toBASEDenomination } = require('../setup')

let staysBASETokenMonetaryPolicy, mockBaseToken, mockTokenPriceOracle, mockMcapOracle, p, MockOracle
let r, prevEpoch, prevTime
let accounts, deployer, deployerAddr, user, userAddr, orchestrator

const tenTo18th = BigNumber.from(10).pow(18)
const MAX_RATE = (BigNumber.from('1')).mul(10 ** 6).mul(tenTo18th)
const MAX_SUPPLY = (BigNumber.from(2).pow(255).sub(1)).div(MAX_RATE)
const BASE_MCAP = BigNumber.from(100).mul(tenTo18th)
const INITIAL_MCAP = BigNumber.from(251712).mul(BigNumber.from(10).pow(15))
const INITIAL_MCAP_25P_MORE = INITIAL_MCAP.mul(125).div(100)
const INITIAL_MCAP_25P_LESS = INITIAL_MCAP.mul(77).div(100)
const INITIAL_RATE = INITIAL_MCAP.mul(tenTo18th).div(BASE_MCAP)
const INITIAL_RATE_30P_MORE = INITIAL_RATE.mul(13).div(10)
const INITIAL_RATE_30P_LESS = INITIAL_RATE.mul(7).div(10)
const INITIAL_RATE_5P_MORE = INITIAL_RATE.mul(105).div(100)
const INITIAL_RATE_5P_LESS = INITIAL_RATE.mul(95).div(100)
const INITIAL_RATE_60P_MORE = INITIAL_RATE.mul(16).div(10)
const INITIAL_RATE_2X = INITIAL_RATE.mul(2)

async function setupContracts () {
    accounts = await ethers.getSigners()
    deployer = accounts[0]
    deployerAddr = await deployer.getAddress()
    user = accounts[1]
    userAddr = await user.getAddress()
    orchestrator = accounts[3]
    orchestratorAddr = await orchestrator.getAddress()
    p = orchestrator.provider

    await waitForSomeTime(p, 86400)

    const MockBaseToken = await ethers.getContractFactory('MockBaseToken')
    mockBaseToken = await upgrades.deployProxy(MockBaseToken, [])
    await mockBaseToken.deployed()
    mockBaseToken = mockBaseToken.connect(deployer)

    MockOracle = await ethers.getContractFactory('MockOracle')

    mockTokenPriceOracle = await MockOracle.deploy('TokenPriceOracle')
    await mockTokenPriceOracle.deployed()
    mockTokenPriceOracle = mockTokenPriceOracle.connect(deployer)

    mockMcapOracle = await MockOracle.deploy('McapOracle')
    await mockMcapOracle.deployed()
    mockMcapOracle = mockMcapOracle.connect(deployer)

    const StaysBASETokenMonetaryPolicy = await ethers.getContractFactory('StaysBASETokenMonetaryPolicy')
    staysBASETokenMonetaryPolicy = await upgrades.deployProxy(StaysBASETokenMonetaryPolicy, [mockBaseToken.address, BASE_MCAP.toString()])
    await staysBASETokenMonetaryPolicy.deployed()
    staysBASETokenMonetaryPolicy = staysBASETokenMonetaryPolicy.connect(deployer)

    await awaitTx(staysBASETokenMonetaryPolicy.setTokenPriceOracle(mockTokenPriceOracle.address))
    await awaitTx(staysBASETokenMonetaryPolicy.setMcapOracle(mockMcapOracle.address))
    await awaitTx(staysBASETokenMonetaryPolicy.setOrchestrator(orchestratorAddr))
}

async function setupContractsWithOpenRebaseWindow () {
    await setupContracts()
    await awaitTx(staysBASETokenMonetaryPolicy.setRebaseTimingParameters(60, 0, 60))
}

async function mockExternalData (rate, mcap, baseSupply, rateValidity = true, mcapValidity = true) {
    await awaitTx(mockTokenPriceOracle.storeData(rate))
    await awaitTx(mockTokenPriceOracle.storeValidity(rateValidity))
    await awaitTx(mockMcapOracle.storeData(mcap))
    await awaitTx(mockMcapOracle.storeValidity(mcapValidity))
    await awaitTx(mockBaseToken.storeSupply(baseSupply))
}

describe('StaysBASETokenMonetaryPolicy', () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContracts)

    it('should reject any ether sent to it', async () => {
        expect(
            await isEthException(user.sendTransaction({ to: staysBASETokenMonetaryPolicy.address, value: 1 }))
        ).to.be.true
    })
})

describe('StaysBASETokenMonetaryPolicy:initialize', async () => {
    describe('initial values set correctly', () => {
        before('setup StaysBASETokenMonetaryPolicy contract', setupContracts)

        it('deviationThreshold', async () => {
            (await staysBASETokenMonetaryPolicy.deviationThreshold()).should.equal(BigNumber.from(5).mul(tenTo18th).div(100))
        })
        it('rebaseLag', async () => {
            (await staysBASETokenMonetaryPolicy.rebaseLag()).should.equal(30)
        })
        it('minRebaseTimeIntervalSec', async () => {
            (await staysBASETokenMonetaryPolicy.minRebaseTimeIntervalSec()).should.equal(24 * 60 * 60)
        })
        it('epoch', async () => {
            (await staysBASETokenMonetaryPolicy.epoch()).should.equal(0)
        })
        it('rebaseWindowOffsetSec', async () => {
            (await staysBASETokenMonetaryPolicy.rebaseWindowOffsetSec()).should.equal(72000)
        })
        it('rebaseWindowLengthSec', async () => {
            (await staysBASETokenMonetaryPolicy.rebaseWindowLengthSec()).should.equal(900)
        })
        it('should set owner', async () => {
            expect(await staysBASETokenMonetaryPolicy.owner()).to.equal(deployerAddr)
        })
        it('should set reference to StaysBASE', async () => {
            expect(await staysBASETokenMonetaryPolicy.StaysBASE()).to.equal(mockBaseToken.address)
        })
    })
})

describe('StaysBASETokenMonetaryPolicy:setTokenPriceOracle', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContracts)

    it('should set tokenPriceOracle', async () => {
        await awaitTx(staysBASETokenMonetaryPolicy.setTokenPriceOracle(deployerAddr))
        expect(await staysBASETokenMonetaryPolicy.tokenPriceOracle()).to.equal(deployerAddr)
    })
})

describe('StaysBASEToken:setTokenPriceOracle:accessControl', () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContracts)

    it('should be callable by owner', async () => {
        expect(
            await isEthException(staysBASETokenMonetaryPolicy.setTokenPriceOracle(deployerAddr))
        ).to.be.false
    })

    it('should NOT be callable by non-owner', async () => {
        expect(
            await isEthException(staysBASETokenMonetaryPolicy.connect(user).setTokenPriceOracle(deployerAddr))
        ).to.be.true
    })
})

describe('StaysBASETokenMonetaryPolicy:setMcapOracle', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContracts)

    it('should set mcapOracle', async () => {
        await staysBASETokenMonetaryPolicy.setMcapOracle(deployerAddr)
        expect(await staysBASETokenMonetaryPolicy.mcapOracle()).to.equal(deployerAddr)
    })
})

describe('StaysBASEToken:setMcapOracle:accessControl', () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContracts)

    it('should be callable by owner', async () => {
        expect(
            await isEthException(staysBASETokenMonetaryPolicy.setMcapOracle(deployerAddr))
        ).to.be.false
    })

    it('should NOT be callable by non-owner', async () => {
        expect(
            await isEthException(staysBASETokenMonetaryPolicy.connect(user).setMcapOracle(deployerAddr))
        ).to.be.true
    })
})

describe('StaysBASETokenMonetaryPolicy:setOrchestrator', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContracts)

    it('should set orchestrator', async () => {
        await awaitTx(staysBASETokenMonetaryPolicy.setOrchestrator(userAddr))
        expect(await staysBASETokenMonetaryPolicy.orchestrator()).to.equal(userAddr)
    })
})

describe('StaysBASEToken:setOrchestrator:accessControl', () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContracts)

    it('should be callable by owner', async () => {
        expect(
            await isEthException(staysBASETokenMonetaryPolicy.setOrchestrator(deployerAddr))
        ).to.be.false
    })

    it('should NOT be callable by non-owner', async () => {
        expect(
            await isEthException(staysBASETokenMonetaryPolicy.connect(user).setOrchestrator(deployerAddr))
        ).to.be.true
    })
})

describe('StaysBASETokenMonetaryPolicy:setDeviationThreshold', async () => {
    let prevThreshold, threshold
    before('setup StaysBASETokenMonetaryPolicy contract', async () => {
        await setupContracts()
        prevThreshold = await staysBASETokenMonetaryPolicy.deviationThreshold()
        threshold = prevThreshold.add(BigNumber.from(1).mul(tenTo18th).div(100))
        await awaitTx(staysBASETokenMonetaryPolicy.setDeviationThreshold(threshold))
    })

    it('should set deviationThreshold', async () => {
        (await staysBASETokenMonetaryPolicy.deviationThreshold()).should.equal(threshold)
    })
})

describe('StaysBASEToken:setDeviationThreshold:accessControl', () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContracts)

    it('should be callable by owner', async () => {
        expect(
            await isEthException(staysBASETokenMonetaryPolicy.setDeviationThreshold(0))
        ).to.be.false
    })

    it('should NOT be callable by non-owner', async () => {
        expect(
            await isEthException(staysBASETokenMonetaryPolicy.connect(user).setDeviationThreshold(0))
        ).to.be.true
    })
})

describe('StaysBASETokenMonetaryPolicy:setRebaseLag', async () => {
    let prevLag
    before('setup StaysBASETokenMonetaryPolicy contract', async () => {
        await setupContracts()
        prevLag = await staysBASETokenMonetaryPolicy.rebaseLag()
    })

    describe('when rebaseLag is more than 0', async () => {
        it('should setRebaseLag', async () => {
            const lag = prevLag.add(1)
            await awaitTx(staysBASETokenMonetaryPolicy.setRebaseLag(lag))
            ;(await staysBASETokenMonetaryPolicy.rebaseLag()).should.equal(lag)
        })
    })

    describe('when rebaseLag is 0', async () => {
        it('should fail', async () => {
            expect(
                await isEthException(staysBASETokenMonetaryPolicy.setRebaseLag(0))
            ).to.be.true
        })
    })
})

describe('StaysBASEToken:setRebaseLag:accessControl', () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContracts)

    it('should be callable by owner', async () => {
        expect(
            await isEthException(staysBASETokenMonetaryPolicy.setRebaseLag(1))
        ).to.be.false
    })

    it('should NOT be callable by non-owner', async () => {
        expect(
            await isEthException(staysBASETokenMonetaryPolicy.connect(user).setRebaseLag(1))
        ).to.be.true
    })
})

describe('StaysBASETokenMonetaryPolicy:setRebaseTimingParameters', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', async () => {
        await setupContracts()
    })

    describe('when interval=0', () => {
        it('should fail', async () => {
            expect(
                await isEthException(staysBASETokenMonetaryPolicy.setRebaseTimingParameters(0, 0, 0))
            ).to.be.true
        })
    })

    describe('when offset > interval', () => {
        it('should fail', async () => {
            expect(
                await isEthException(staysBASETokenMonetaryPolicy.setRebaseTimingParameters(300, 3600, 300))
            ).to.be.true
        })
    })

    describe('when params are valid', () => {
        it('should setRebaseTimingParameters', async () => {
            await awaitTx(staysBASETokenMonetaryPolicy.setRebaseTimingParameters(600, 60, 300))
            ;(await staysBASETokenMonetaryPolicy.minRebaseTimeIntervalSec()).should.equal(600)
            ;(await staysBASETokenMonetaryPolicy.rebaseWindowOffsetSec()).should.equal(60)
            ;(await staysBASETokenMonetaryPolicy.rebaseWindowLengthSec()).should.equal(300)
        })
    })
})

describe('StaysBASEToken:setRebaseTimingParameters:accessControl', () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContracts)

    it('should be callable by owner', async () => {
        expect(
            await isEthException(staysBASETokenMonetaryPolicy.setRebaseTimingParameters(600, 60, 300))
        ).to.be.false
    })

    it('should NOT be callable by non-owner', async () => {
        expect(
            await isEthException(staysBASETokenMonetaryPolicy.connect(user).setRebaseTimingParameters(600, 60, 300))
        ).to.be.true
    })
})

describe('StaysBASETokenMonetaryPolicy:Rebase:accessControl', async () => {
    beforeEach('setup StaysBASETokenMonetaryPolicy contract', async () => {
        await setupContractsWithOpenRebaseWindow()
        await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_MCAP, 1000, true)
        await waitForSomeTime(p, 60)
    })

    describe('when rebase called by orchestrator', () => {
        it('should succeed', async () => {
            expect(
                await isEthException(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            ).to.be.false
        })
    })

    describe('when rebase called by non-orchestrator', () => {
        it('should fail', async () => {
            expect(
                await isEthException(staysBASETokenMonetaryPolicy.connect(user).rebase())
            ).to.be.true
        })
    })
})

describe('StaysBASETokenMonetaryPolicy:Rebase', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow)

    describe('when minRebaseTimeIntervalSec has NOT passed since the previous rebase', () => {
        before(async () => {
            await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_MCAP, 1010)
            await waitForSomeTime(p, 60)
            await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
        })

        it('should fail', async () => {
            expect(
                await isEthException(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            ).to.be.true
        })
    })
})

describe('StaysBASETokenMonetaryPolicy:Rebase', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow)

    describe('when rate is within deviationThreshold', () => {
        before(async () => {
            await awaitTx(staysBASETokenMonetaryPolicy.setRebaseTimingParameters(60, 0, 60))
        })

        it('should return 0', async () => {
            await mockExternalData(INITIAL_RATE.sub(1), INITIAL_MCAP, 1000)
            await waitForSomeTime(p, 60)
            r = await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            r.events[6].args.requestedSupplyAdjustment.should.equal(0)
            await waitForSomeTime(p, 60)

            await mockExternalData(INITIAL_RATE.add(1), INITIAL_MCAP, 1000)
            r = await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            r.events[6].args.requestedSupplyAdjustment.should.equal(0)
            await waitForSomeTime(p, 60)

            await mockExternalData(INITIAL_RATE_5P_MORE.sub(2), INITIAL_MCAP, 1000)
            r = await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            r.events[6].args.requestedSupplyAdjustment.should.equal(0)
            await waitForSomeTime(p, 60)

            await mockExternalData(INITIAL_RATE_5P_LESS.add(2), INITIAL_MCAP, 1000)
            r = await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            r.events[6].args.requestedSupplyAdjustment.should.equal(0)
            await waitForSomeTime(p, 60)
        })
    })
})

describe('StaysBASETokenMonetaryPolicy:Rebase', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow)

    describe('when rate is more than MAX_RATE', () => {
        it('should return same supply delta as delta for MAX_RATE', async () => {
            // Any exchangeRate >= (MAX_RATE=100x) would result in the same supply increase
            await mockExternalData(MAX_RATE, INITIAL_MCAP, 1000)
            await waitForSomeTime(p, 60)
            r = await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            const supplyChange = r.events[6].args.requestedSupplyAdjustment

            await waitForSomeTime(p, 60)

            await mockExternalData(MAX_RATE.add(tenTo18th.div(10)), INITIAL_MCAP, 1000)
            r = await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            r.events[6].args.requestedSupplyAdjustment.should.equal(supplyChange)

            await waitForSomeTime(p, 60)

            await mockExternalData(MAX_RATE.mul(2), INITIAL_MCAP, 1000)
            r = await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            r.events[6].args.requestedSupplyAdjustment.should.equal(supplyChange)
        })
    })
})

describe('StaysBASETokenMonetaryPolicy:Rebase', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow)

    describe('when staysBASEToken grows beyond MAX_SUPPLY', () => {
        before(async () => {
            await mockExternalData(INITIAL_RATE_2X, INITIAL_MCAP, MAX_SUPPLY.sub(1))
            await waitForSomeTime(p, 60)
        })

        it('should apply SupplyAdjustment {MAX_SUPPLY - totalSupply}', async () => {
            // Supply is MAX_SUPPLY-1, exchangeRate is 2x resulting in a new supply more than MAX_SUPPLY
            // However, supply is ONLY increased by 1 to MAX_SUPPLY
            r = await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            r.events[6].args.requestedSupplyAdjustment.should.equal(1)
        })
    })
})

describe('StaysBASETokenMonetaryPolicy:Rebase', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow)

    describe('when staysBASEToken supply equals MAX_SUPPLY and rebase attempts to grow', () => {
        before(async () => {
            await mockExternalData(INITIAL_RATE_2X, INITIAL_MCAP, MAX_SUPPLY)
            await waitForSomeTime(p, 60)
        })

        it('should not grow', async () => {
            r = await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            r.events[6].args.requestedSupplyAdjustment.should.equal(0)
        })
    })
})

describe('StaysBASETokenMonetaryPolicy:Rebase', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow)

    describe('when the market oracle returns invalid data', () => {
        it('should fail', async () => {
            await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_MCAP, 1000, false)
            await waitForSomeTime(p, 60)
            expect(
                await isEthException(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            ).to.be.true
        })
    })

    describe('when the market oracle returns valid data', () => {
        it('should NOT fail', async () => {
            await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_MCAP, 1000, true)
            await waitForSomeTime(p, 60)
            expect(
                await isEthException(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            ).to.be.false
        })
    })
})

describe('StaysBASETokenMonetaryPolicy:Rebase', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow)

    describe('when the mcap oracle returns invalid data', () => {
        it('should fail', async () => {
            await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_MCAP, 1000, true, false)
            await waitForSomeTime(p, 60)
            expect(
                await isEthException(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            ).to.be.true
        })
    })

    describe('when the mcap oracle returns valid data', () => {
        it('should NOT fail', async () => {
            await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_MCAP, 1000, true, true)
            await waitForSomeTime(p, 60)
            expect(
                await isEthException(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            ).to.be.false
        })
    })
})

describe('StaysBASETokenMonetaryPolicy:Rebase', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow)

    describe('positive rate and no change MCAP', () => {
        before(async () => {
            await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_MCAP, 1000)
            await staysBASETokenMonetaryPolicy.setRebaseTimingParameters(60, 0, 60)
            await waitForSomeTime(p, 60)
            await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            await waitForSomeTime(p, 59)
            prevEpoch = await staysBASETokenMonetaryPolicy.epoch()
            prevTime = await staysBASETokenMonetaryPolicy.lastRebaseTimestampSec()
            await mockExternalData(INITIAL_RATE_60P_MORE, INITIAL_MCAP, 1010)
            r = await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
        })

        it('should increment epoch', async () => {
            const epoch = await staysBASETokenMonetaryPolicy.epoch()
            expect(prevEpoch.add(1).eq(epoch))
        })

        it('should update lastRebaseTimestamp', async () => {
            const time = await staysBASETokenMonetaryPolicy.lastRebaseTimestampSec()
            expect(time.sub(prevTime).eq(60)).to.be.true
        })

        it('should emit Rebase with positive requestedSupplyAdjustment', async () => {
            const log = r.events[6]
            expect(log.event).to.equal('LogRebase')
            expect(log.args.epoch.eq(prevEpoch.add(1))).to.be.true
            log.args.exchangeRate.should.equal(INITIAL_RATE_60P_MORE)
            log.args.mcap.should.equal(INITIAL_MCAP)
            log.args.requestedSupplyAdjustment.should.equal(20)
        })

        it('should call getData from the market oracle', async () => {
            const fnCalled = MockOracle.interface.decodeEventLog('FunctionCalled', r.events[2].data)
            expect(fnCalled[0]).to.equal('TokenPriceOracle')
            expect(fnCalled[1]).to.equal('getData')
            expect(fnCalled[2]).to.equal(staysBASETokenMonetaryPolicy.address)
        })

        it('should call getData from the mcap oracle', async () => {
            const fnCalled = MockOracle.interface.decodeEventLog('FunctionCalled', r.events[0].data)
            expect(fnCalled[0]).to.equal('McapOracle')
            expect(fnCalled[1]).to.equal('getData')
            expect(fnCalled[2]).to.equal(staysBASETokenMonetaryPolicy.address)
        })

        it('should call StaysBASEToken Rebase', async () => {
            prevEpoch = await staysBASETokenMonetaryPolicy.epoch()
            const fnCalled = MockOracle.interface.decodeEventLog('FunctionCalled', r.events[4].data)
            expect(fnCalled[0]).to.equal('StaysBASEToken')
            expect(fnCalled[1]).to.equal('rebase')
            expect(fnCalled[2]).to.equal(staysBASETokenMonetaryPolicy.address)
            const fnArgs = MockOracle.interface.decodeEventLog('FunctionArguments', r.events[5].data)
            const parsedFnArgs = fnArgs.reduce((m, k) => {
                return k.map(d => d.toNumber()).concat(m)
            }, [ ])
            expect(parsedFnArgs).to.include.members([prevEpoch.toNumber(), 20])
        })
    })
})

describe('StaysBASETokenMonetaryPolicy:Rebase', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow)

    describe('negative rate', () => {
        before(async () => {
            await mockExternalData(INITIAL_RATE_30P_LESS, INITIAL_MCAP, 1000)
            await waitForSomeTime(p, 60)
            r = await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
        })

        it('should emit Rebase with negative requestedSupplyAdjustment', async () => {
            const log = r.events[6]
            expect(log.event).to.equal('LogRebase')
            log.args.requestedSupplyAdjustment.should.equal(-10)
        })
    })
})

describe('StaysBASETokenMonetaryPolicy:Rebase', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow)

    describe('when mcap increases', () => {
        before(async () => {
            await mockExternalData(INITIAL_RATE, INITIAL_MCAP_25P_MORE, 1000)
            await waitForSomeTime(p, 60)
            await awaitTx(staysBASETokenMonetaryPolicy.setDeviationThreshold(0))
            r = await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
        })

        it('should emit Rebase with negative requestedSupplyAdjustment', async () => {
            const log = r.events[6]
            expect(log.event).to.equal('LogRebase')
            log.args.requestedSupplyAdjustment.should.equal(-6)
        })
    })
})

describe('StaysBASETokenMonetaryPolicy:Rebase', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow)

    describe('when mcap decreases', () => {
        before(async () => {
            await mockExternalData(INITIAL_RATE, INITIAL_MCAP_25P_LESS, 1000)
            await waitForSomeTime(p, 60)
            await awaitTx(staysBASETokenMonetaryPolicy.setDeviationThreshold(0))
            r = await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
        })

        it('should emit Rebase with positive requestedSupplyAdjustment', async () => {
            const log = r.events[6]
            expect(log.event).to.equal('LogRebase')
            log.args.requestedSupplyAdjustment.should.equal(9)
        })
    })
})

describe('StaysBASETokenMonetaryPolicy:Rebase', async () => {
    before('setup StaysBASETokenMonetaryPolicy contract', setupContractsWithOpenRebaseWindow)

    describe('rate=TARGET_RATE', () => {
        before(async () => {
            await mockExternalData(INITIAL_RATE, INITIAL_MCAP, 1000)
            await awaitTx(staysBASETokenMonetaryPolicy.setDeviationThreshold(0))
            await waitForSomeTime(p, 60)
            r = await awaitTx(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
        })

        it('should emit Rebase with 0 requestedSupplyAdjustment', async () => {
            const log = r.events[6]
            expect(log.event).to.equal('LogRebase')
            log.args.requestedSupplyAdjustment.should.equal(0)
        })
    })
})

describe('StaysBASETokenMonetaryPolicy:Rebase', async () => {
    let rbTime, rbWindow, minRebaseTimeIntervalSec, now, prevRebaseTime, nextRebaseWindowOpenTime,
        timeToWait, lastRebaseTimestamp

    beforeEach('setup StaysBASETokenMonetaryPolicy contract', async () => {
        await setupContracts()
        await awaitTx(staysBASETokenMonetaryPolicy.setRebaseTimingParameters(86400, 72000, 900))
        rbTime = await staysBASETokenMonetaryPolicy.rebaseWindowOffsetSec()
        rbWindow = await staysBASETokenMonetaryPolicy.rebaseWindowLengthSec()
        minRebaseTimeIntervalSec = await staysBASETokenMonetaryPolicy.minRebaseTimeIntervalSec()
        now = BigNumber.from(await currentTime(p))
        prevRebaseTime = now.sub(now.mod(minRebaseTimeIntervalSec)).add(rbTime)
        nextRebaseWindowOpenTime = prevRebaseTime.add(minRebaseTimeIntervalSec)
    })

    describe('when its 5s after the rebase window closes', () => {
        it('should fail', async () => {
            timeToWait = nextRebaseWindowOpenTime.sub(now).add(rbWindow).add(5)
            await waitForSomeTime(p, timeToWait.toNumber())
            await mockExternalData(INITIAL_RATE, INITIAL_MCAP, 1000)
            expect(await staysBASETokenMonetaryPolicy.inRebaseWindow()).to.be.false
            expect(
                await isEthException(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            ).to.be.true
        })
    })

    describe('when its 5s before the rebase window opens', () => {
        it('should fail', async () => {
            timeToWait = nextRebaseWindowOpenTime.sub(now).sub(5)
            await waitForSomeTime(p, timeToWait.toNumber())
            await mockExternalData(INITIAL_RATE, INITIAL_MCAP, 1000)
            expect(await staysBASETokenMonetaryPolicy.inRebaseWindow()).to.be.false
            expect(
                await isEthException(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            ).to.be.true
        })
    })

    describe('when its 5s after the rebase window opens', () => {
        it('should NOT fail', async () => {
            timeToWait = nextRebaseWindowOpenTime.sub(now).add(5)
            await waitForSomeTime(p, timeToWait.toNumber());
            await mockExternalData(INITIAL_RATE, INITIAL_MCAP, 1000);
            expect(await staysBASETokenMonetaryPolicy.inRebaseWindow()).to.be.true;
            expect(
                await isEthException(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            ).to.be.false;
            lastRebaseTimestamp = await staysBASETokenMonetaryPolicy.lastRebaseTimestampSec()
            expect(lastRebaseTimestamp.eq(nextRebaseWindowOpenTime)).to.be.true
        })
    })

    describe('when its 5s before the rebase window closes', () => {
        it('should NOT fail', async () => {
            timeToWait = nextRebaseWindowOpenTime.sub(now).add(rbWindow).sub(5)
            await waitForSomeTime(p, timeToWait.toNumber())
            await mockExternalData(INITIAL_RATE, INITIAL_MCAP, 1000)
            expect(await staysBASETokenMonetaryPolicy.inRebaseWindow()).to.be.true
            expect(
                await isEthException(staysBASETokenMonetaryPolicy.connect(orchestrator).rebase())
            ).to.be.false
            lastRebaseTimestamp = await staysBASETokenMonetaryPolicy.lastRebaseTimestampSec()
            expect(lastRebaseTimestamp.eq(nextRebaseWindowOpenTime)).to.be.true
        })
    })
})
