const bre = require('@nomiclabs/buidler')
const { ethers, upgrades } = bre
const { getSavedContractAddresses, saveContractAddress } = require('./utils')

async function main() {
    await bre.run('compile')

    const SBSToken = await ethers.getContractFactory('StaysBASEToken')
    const sbsToken = await upgrades.deployProxy(SBSToken, [])
    await sbsToken.deployed()
    console.log('SBSToken deployed to:', sbsToken.address)
    saveContractAddress(bre.network.name, 'sbsToken', sbsToken.address)

    const StaysBASETokenMonetaryPolicy = await ethers.getContractFactory('StaysBASETokenMonetaryPolicy')
    const staysBASETokenMonetaryPolicy = await upgrades.deployProxy(StaysBASETokenMonetaryPolicy, [sbsToken.address])
    await staysBASETokenMonetaryPolicy.deployed()
    console.log('StaysBASETokenMonetaryPolicy deployed to:', staysBASETokenMonetaryPolicy.address)
    saveContractAddress(bre.network.name, 'staysBASETokenMonetaryPolicy', staysBASETokenMonetaryPolicy.address)

    const StaysBASETokenOrchestrator = await ethers.getContractFactory('StaysBASETokenOrchestrator')
    const staysBASETokenOrchestrator = await upgrades.deployProxy(StaysBASETokenOrchestrator, [staysBASETokenMonetaryPolicy.address])
    await staysBASETokenOrchestrator.deployed()
    console.log('StaysBASETokenOrchestrator deployed to:', staysBASETokenOrchestrator.address)
    saveContractAddress(bre.network.name, 'staysBASETokenOrchestrator', staysBASETokenOrchestrator.address)

    const Cascade = await ethers.getContractFactory('Cascade')
    const cascade = await upgrades.deployProxy(Cascade, [])
    await cascade.deployed()
    console.log('Cascade deployed to:', cascade.address)
    saveContractAddress(bre.network.name, 'cascade', cascade.address)

    // await (await sbsToken.setMonetaryPolicy(staysBASETokenMonetaryPolicy.address)).wait()
    // console.log('sbsToken.setMonetaryPolicy(', staysBASETokenMonetaryPolicy.address, ') succeeded')
    // await (await staysBASETokenMonetaryPolicy.setOrchestrator(staysBASETokenOrchestrator.address)).wait()
    // console.log('StaysBASETokenMonetaryPolicy.setOrchestrator(', staysBASETokenOrchestrator.address, ') succeeded')

    const contracts = getSavedContractAddresses()[bre.network.name]

    // await (await staysBASETokenMonetaryPolicy.setMcapOracle(contracts.mcapOracle)).wait()
    // console.log('StaysBASETokenMonetaryPolicy.setMcapOracle(', contracts.mcapOracle, ') succeeded')
    // await (await staysBASETokenMonetaryPolicy.setTokenPriceOracle(contracts.tokenPriceOracle)).wait()
    // console.log('StaysBASETokenMonetaryPolicy.setTokenPriceOracle(', contracts.tokenPriceOracle, ') succeeded')
    // await (await cascade.setLPToken(contracts.lpToken)).wait()
    // console.log('Cascade.setLPToken(', contracts.lpToken, ') succeeded')
    await (await cascade.setBASEToken(contracts.sbsToken)).wait()
    console.log('Cascade.setBASEToken(', contracts.sbsToken, ') succeeded')
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
