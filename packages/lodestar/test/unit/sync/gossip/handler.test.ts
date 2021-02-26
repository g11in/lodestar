import sinon, {SinonStubbedInstance} from "sinon";
import {BeaconChain, ChainEvent, ChainEventEmitter, IBeaconChain} from "../../../../src/chain";
import {INetwork, Network} from "../../../../src/network";
import {config} from "@chainsafe/lodestar-config/mainnet";
import {IGossip} from "../../../../src/network/gossip/interface";
import {Gossip} from "../../../../src/network/gossip/gossip";
import {BeaconGossipHandler} from "../../../../src/sync/gossip";
import {generateEmptySignedBlock} from "../../../utils/block";
import {expect} from "chai";
import {generateEmptyAttesterSlashing, generateEmptyProposerSlashing} from "../../../utils/slashings";
import {generateEmptySignedAggregateAndProof, generateEmptySignedVoluntaryExit} from "../../../utils/attestation";
import {sleep, WinstonLogger} from "@chainsafe/lodestar-utils";
import {MockBeaconChain} from "../../../utils/mocks/chain/chain";
import {generateState} from "../../../utils/state";
import {StubbedBeaconDb} from "../../../utils/stub";
import {phase0} from "@chainsafe/lodestar-types";
import {TreeBacked} from "@chainsafe/ssz";

describe("gossip handler", function () {
  const logger = new WinstonLogger();
  let chainStub: SinonStubbedInstance<IBeaconChain>;
  let networkStub: SinonStubbedInstance<INetwork>;
  let gossipStub: SinonStubbedInstance<IGossip>;
  let dbStub: StubbedBeaconDb;

  beforeEach(function () {
    chainStub = sinon.createStubInstance(BeaconChain);
    chainStub.emitter = new ChainEventEmitter();
    networkStub = sinon.createStubInstance(Network);
    gossipStub = sinon.createStubInstance(Gossip);
    networkStub.gossip = gossipStub;
    dbStub = new StubbedBeaconDb(sinon);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should handle new block", function () {
    gossipStub.subscribeToBlock.callsFake((digest, callback) => {
      callback(generateEmptySignedBlock());
    });
    const handler = new BeaconGossipHandler(chainStub, networkStub, dbStub, logger);
    handler.start();
    expect(chainStub.receiveBlock.calledOnce).to.be.true;
  });

  it("should handle new aggregate and proof", function () {
    const aggregateAndProof = generateEmptySignedAggregateAndProof();
    gossipStub.subscribeToAggregateAndProof.callsFake((digest, callback) => {
      callback(aggregateAndProof);
    });
    const handler = new BeaconGossipHandler(chainStub, networkStub, dbStub, logger);
    handler.start();
    expect(dbStub.aggregateAndProof.add.withArgs(aggregateAndProof.message).calledOnce).to.be.true;
  });

  it("should handle new attester slashing", function () {
    gossipStub.subscribeToAttesterSlashing.callsFake((digest, callback) => {
      callback(generateEmptyAttesterSlashing());
    });
    const handler = new BeaconGossipHandler(chainStub, networkStub, dbStub, logger);
    handler.start();
    expect(dbStub.attesterSlashing.add.calledOnce).to.be.true;
  });

  it("should handle new proposer slashing", function () {
    gossipStub.subscribeToProposerSlashing.callsFake((digest, callback) => {
      callback(generateEmptyProposerSlashing());
    });
    const handler = new BeaconGossipHandler(chainStub, networkStub, dbStub, logger);
    handler.start();
    expect(dbStub.proposerSlashing.add.calledOnce).to.be.true;
  });

  it("should handle new voluntary exit", function () {
    gossipStub.subscribeToVoluntaryExit.callsFake((digest, callback) => {
      callback(generateEmptySignedVoluntaryExit());
    });
    const handler = new BeaconGossipHandler(chainStub, networkStub, dbStub, logger);
    handler.start();
    expect(dbStub.voluntaryExit.add.calledOnce).to.be.true;
  });

  it("should handle fork version changed", async function () {
    // handler is started and fork digest changed after that
    const state: phase0.BeaconState = generateState();
    const chain = new MockBeaconChain({
      genesisTime: 0,
      chainId: 0,
      networkId: BigInt(0),
      state: state as TreeBacked<phase0.BeaconState>,
      config,
    });
    const oldForkDigest = chain.getForkDigest();
    const handler = new BeaconGossipHandler(chain, networkStub, dbStub, logger);
    handler.start();
    expect(gossipStub.subscribeToBlock.callCount).to.be.equal(1);
    // fork digest changed due to current version changed
    state.fork.currentVersion = Buffer.from([100, 0, 0, 0]);
    expect(config.types.ForkDigest.equals(oldForkDigest, chain.getForkDigest())).to.be.false;
    chain.emitter.emit(ChainEvent.forkVersion, state.fork.currentVersion);
    // allow event to be handled
    await sleep(1);
    expect(gossipStub.unsubscribe.callCount).to.be.equal(5);
    expect(gossipStub.subscribeToBlock.callCount).to.be.equal(2);
    chain.close();
  });
});
