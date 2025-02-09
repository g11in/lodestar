import {SinonStubbedInstance} from "sinon";
import {INetwork, Network} from "../../../../src/network";
import sinon from "sinon";
import {getSyncPeers} from "../../../../src/sync/utils/peers";
import {expect} from "chai";
import {generatePeer} from "../../../utils/peer";
import PeerId from "peer-id";
import {IPeerRpcScoreStore, PeerRpcScoreStore, ScoreState} from "../../../../src/network/peers/score";

describe("sync peer utils", function () {
  let networkStub: SinonStubbedInstance<INetwork>;
  let peerScoreStub: SinonStubbedInstance<IPeerRpcScoreStore>;

  beforeEach(function () {
    networkStub = sinon.createStubInstance(Network);
    peerScoreStub = sinon.createStubInstance(PeerRpcScoreStore);
    networkStub.peerRpcScores = peerScoreStub;
  });

  it("should work without peers", function () {
    networkStub.getPeers.returns([]);
    const result = getSyncPeers(networkStub);
    expect(result.length).to.be.equal(0);
  });

  it("should filter and sort peers", function () {
    const peers = [
      generatePeer(PeerId.createFromBytes(Buffer.alloc(32, 0))),
      generatePeer(PeerId.createFromBytes(Buffer.alloc(32, 1))),
      generatePeer(PeerId.createFromBytes(Buffer.alloc(32, 2))),
      generatePeer(PeerId.createFromBytes(Buffer.alloc(32, 3))),
      generatePeer(PeerId.createFromBytes(Buffer.alloc(32, 4))),
    ];
    networkStub.getPeers.returns(peers);
    peerScoreStub.getScoreState.returns(ScoreState.Banned);
    peerScoreStub.getScoreState.withArgs(peers[2].id).returns(ScoreState.Healthy);
    const result = getSyncPeers(networkStub, (id) => id !== peers[1].id, 1);
    expect(result.length).to.be.equal(1);
    expect(result[0]).to.be.equal(peers[2].id);
  });
});
