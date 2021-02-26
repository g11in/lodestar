import {AbortController} from "abort-controller";
import sinon from "sinon";

import {TreeBacked} from "@chainsafe/ssz";
import {ForkDigest, Number64, Slot, Uint16, Uint64} from "@chainsafe/lodestar-types";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {computeForkDigest} from "@chainsafe/lodestar-beacon-state-transition";
import {phase0} from "@chainsafe/lodestar-beacon-state-transition";
import {IForkChoice} from "@chainsafe/lodestar-fork-choice";

import {ChainEventEmitter, IBeaconChain, ITreeStateContext} from "../../../../src/chain";
import {IBeaconClock} from "../../../../src/chain/clock/interface";
import {generateEmptySignedBlock} from "../../block";
import {CheckpointStateCache, StateContextCache} from "../../../../src/chain/stateCache";
import {LocalClock} from "../../../../src/chain/clock";
import {IStateRegenerator, StateRegenerator} from "../../../../src/chain/regen";
import {StubbedBeaconDb} from "../../stub";
import {BlockPool} from "../../../../src/chain/blocks";
import {AttestationPool} from "../../../../src/chain/attestation";

export interface IMockChainParams {
  genesisTime?: Number64;
  chainId: Uint16;
  networkId: Uint64;
  state: TreeBacked<phase0.BeaconState>;
  config: IBeaconConfig;
}

export class MockBeaconChain implements IBeaconChain {
  public forkChoice!: IForkChoice;
  public stateCache: StateContextCache;
  public checkpointStateCache: CheckpointStateCache;
  public chainId: Uint16;
  public networkId: Uint64;
  public clock: IBeaconClock;
  public regen: IStateRegenerator;
  public emitter: ChainEventEmitter;
  public pendingBlocks: BlockPool;
  public pendingAttestations: AttestationPool;

  private state: TreeBacked<phase0.BeaconState>;
  private config: IBeaconConfig;
  private abortController: AbortController;

  public constructor({genesisTime, chainId, networkId, state, config}: IMockChainParams) {
    this.chainId = chainId || 0;
    this.networkId = networkId || BigInt(0);
    this.state = state;
    this.config = config;
    this.emitter = new ChainEventEmitter();
    this.abortController = new AbortController();
    this.clock = new LocalClock({
      config: config,
      genesisTime: genesisTime || state.genesisTime,
      emitter: this.emitter,
      signal: this.abortController.signal,
    });
    this.stateCache = new StateContextCache();
    this.checkpointStateCache = new CheckpointStateCache(this.config);
    this.pendingBlocks = new BlockPool({
      config: this.config,
    });
    this.pendingAttestations = new AttestationPool({
      config: this.config,
    });
    this.regen = new StateRegenerator({
      config: this.config,
      emitter: this.emitter,
      forkChoice: this.forkChoice,
      stateCache: this.stateCache,
      checkpointStateCache: this.checkpointStateCache,
      db: new StubbedBeaconDb(sinon),
    });
  }

  async getHeadBlock(): Promise<null> {
    return null;
  }

  public getHeadStateContext(): ITreeStateContext {
    return {
      state: phase0.fast.createCachedValidatorsBeaconState(this.state),
      epochCtx: new phase0.fast.EpochContext(this.config),
    };
  }

  public async getHeadStateContextAtCurrentEpoch(): Promise<ITreeStateContext> {
    return {
      state: phase0.fast.createCachedValidatorsBeaconState(this.state),
      epochCtx: new phase0.fast.EpochContext(this.config),
    };
  }

  public async getHeadStateContextAtCurrentSlot(): Promise<ITreeStateContext> {
    return {
      state: phase0.fast.createCachedValidatorsBeaconState(this.state),
      epochCtx: new phase0.fast.EpochContext(this.config),
    };
  }

  public async getCanonicalBlockAtSlot(slot: Slot): Promise<phase0.SignedBeaconBlock> {
    const block = generateEmptySignedBlock();
    block.message.slot = slot;
    return block;
  }

  public getHeadEpochContext(): phase0.fast.EpochContext {
    return this.getHeadStateContext().epochCtx;
  }

  public getHeadState(): TreeBacked<phase0.BeaconState> {
    return this.getHeadStateContext().state.getOriginalState() as TreeBacked<phase0.BeaconState>;
  }

  public async getUnfinalizedBlocksAtSlots(slots: Slot[]): Promise<phase0.SignedBeaconBlock[]> {
    if (!slots) {
      return [];
    }
    return await Promise.all(slots.map(this.getCanonicalBlockAtSlot));
  }

  public getFinalizedCheckpoint(): phase0.Checkpoint {
    return this.state.finalizedCheckpoint;
  }

  public getForkDigest(): ForkDigest {
    return computeForkDigest(this.config, this.state.fork.currentVersion, this.state.genesisValidatorsRoot);
  }

  public getENRForkID(): phase0.ENRForkID {
    return {
      forkDigest: Buffer.alloc(4),
      nextForkEpoch: 100,
      nextForkVersion: Buffer.alloc(4),
    };
  }

  public getGenesisTime(): Number64 {
    return Math.floor(Date.now() / 1000);
  }

  async receiveAttestation(): Promise<void> {
    return;
  }

  async receiveBlock(): Promise<void> {
    return;
  }

  async processChainSegment(): Promise<void> {
    return;
  }

  close(): void {
    this.abortController.abort();
  }

  async getStateContextByBlockRoot(): Promise<ITreeStateContext | null> {
    return null;
  }

  getStatus(): phase0.Status {
    return {
      forkDigest: this.getForkDigest(),
      finalizedRoot: Buffer.alloc(32),
      finalizedEpoch: 0,
      headRoot: Buffer.alloc(32),
      headSlot: 0,
    };
  }
}
