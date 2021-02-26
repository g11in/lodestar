/* eslint-disable @typescript-eslint/member-ordering */
/**
 * @module network/gossip
 */

import {EventEmitter} from "events";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {ATTESTATION_SUBNET_COUNT} from "../../constants";
import {ILogger, LogLevel} from "@chainsafe/lodestar-utils";
import {getAttestationSubnetEvent, getGossipTopic, mapGossipEvent} from "./utils";
import {INetworkOptions} from "../options";
import {GossipEventEmitter, GossipObject, IGossip, IGossipEvents, IGossipModules, IGossipSub} from "./interface";
import {GossipEvent} from "./constants";
import {handleIncomingBlock, publishBlock} from "./handlers/block";
import {getCommitteeAttestationHandler, publishCommiteeAttestation} from "./handlers/attestation";
import {handleIncomingAttesterSlashing, publishAttesterSlashing} from "./handlers/attesterSlashing";
import {handleIncomingProposerSlashing, publishProposerSlashing} from "./handlers/proposerSlashing";
import {handleIncomingVoluntaryExit, publishVoluntaryExit} from "./handlers/voluntaryExit";
import {handleIncomingAggregateAndProof, publishAggregatedAttestation} from "./handlers/aggregateAndProof";
import {LodestarGossipsub} from "./gossipsub";
import {Epoch, ForkDigest, phase0, Slot} from "@chainsafe/lodestar-types";
import {ChainEvent, IBeaconChain} from "../../chain";
import {computeEpochAtSlot, computeForkDigest} from "@chainsafe/lodestar-beacon-state-transition";
import {GossipEncoding} from "./encoding";
import {toHexString} from "@chainsafe/ssz";
import {NetworkEvent} from "../events";

export type GossipHandlerFn = (this: Gossip, obj: GossipObject) => void;

export class Gossip extends (EventEmitter as {new (): GossipEventEmitter}) implements IGossip {
  protected readonly opts: INetworkOptions;
  protected readonly config: IBeaconConfig;
  protected readonly pubsub: IGossipSub;
  protected readonly chain: IBeaconChain;
  protected readonly logger: ILogger;

  private handlers?: Map<string, GossipHandlerFn>;
  //TODO: make this configurable
  private supportedEncodings = [GossipEncoding.SSZ_SNAPPY, GossipEncoding.SSZ];
  private statusInterval?: NodeJS.Timeout;

  public constructor(opts: INetworkOptions, {config, libp2p, logger, validator, chain, pubsub}: IGossipModules) {
    super();
    this.opts = opts;
    this.config = config;
    this.logger = logger.child({module: "gossip", level: LogLevel[logger.level]});
    // need to improve Gossipsub type to implement EventEmitter to avoid this cast
    this.pubsub =
      pubsub ||
      // @ts-ignore
      ((new LodestarGossipsub(config, validator, this.logger, libp2p, {
        gossipIncoming: true,
      }) as unknown) as IGossipSub);
    this.chain = chain;
  }

  public async start(): Promise<void> {
    await this.pubsub.start();
    const forkDigest = this.chain.getForkDigest();
    this.pubsub.registerLibp2pTopicValidators(forkDigest);
    this.registerHandlers(forkDigest);
    this.chain.emitter.on(ChainEvent.forkVersion, this.handleForkVersion);
    this.emit(NetworkEvent.gossipStart);
    this.logger.verbose("Gossip is started");
    this.statusInterval = setInterval(this.logSubscriptions, 60000);
  }

  public async stop(): Promise<void> {
    this.emit(NetworkEvent.gossipStop);
    this.unregisterHandlers();
    this.chain.emitter.off(ChainEvent.forkVersion, this.handleForkVersion);
    await this.pubsub.stop();
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    this.logger.verbose("Gossip is stopped");
  }

  public publishBlock = publishBlock.bind(this);

  public publishCommiteeAttestation = publishCommiteeAttestation.bind(this);

  public publishAggregatedAttestation = publishAggregatedAttestation.bind(this);

  public publishVoluntaryExit = publishVoluntaryExit.bind(this);

  public publishProposerSlashing = publishProposerSlashing.bind(this);

  public publishAttesterSlashing = publishAttesterSlashing.bind(this);

  public subscribeToBlock(forkDigest: ForkDigest, callback: (block: phase0.SignedBeaconBlock) => void): void {
    this.subscribe(forkDigest, GossipEvent.BLOCK, callback);
  }

  public subscribeToAggregateAndProof(
    forkDigest: ForkDigest,
    callback: (signedAggregate: phase0.SignedAggregateAndProof) => void
  ): void {
    this.subscribe(forkDigest, GossipEvent.AGGREGATE_AND_PROOF, callback);
  }

  public subscribeToVoluntaryExit(
    forkDigest: ForkDigest,
    callback: (signed: phase0.SignedVoluntaryExit) => void
  ): void {
    this.subscribe(forkDigest, GossipEvent.VOLUNTARY_EXIT, callback);
  }

  public subscribeToProposerSlashing(
    forkDigest: ForkDigest,
    callback: (slashing: phase0.ProposerSlashing) => void
  ): void {
    this.subscribe(forkDigest, GossipEvent.PROPOSER_SLASHING, callback);
  }

  public subscribeToAttesterSlashing(
    forkDigest: ForkDigest,
    callback: (slashing: phase0.AttesterSlashing) => void
  ): void {
    this.subscribe(forkDigest, GossipEvent.ATTESTER_SLASHING, callback);
  }

  public subscribeToAttestationSubnet(
    forkDigest: ForkDigest,
    subnet: number | string,
    callback?: (attestation: {attestation: phase0.Attestation; subnet: number}) => void
  ): void {
    const subnetNum: number = typeof subnet === "string" ? parseInt(subnet) : (subnet as number);
    this.subscribe(
      forkDigest,
      getAttestationSubnetEvent(subnetNum),
      callback,
      new Map([["subnet", subnet.toString()]])
    );
  }

  public unsubscribeFromAttestationSubnet(
    forkDigest: ForkDigest,
    subnet: number | string,
    callback?: (attestation: {attestation: phase0.Attestation; subnet: number}) => void
  ): void {
    const subnetNum: number = typeof subnet === "string" ? parseInt(subnet) : (subnet as number);
    this.unsubscribe(
      forkDigest,
      getAttestationSubnetEvent(subnetNum),
      callback,
      new Map([["subnet", subnet.toString()]])
    );
  }

  public unsubscribe(
    forkDigest: ForkDigest,
    event: keyof IGossipEvents | string,
    listener?: unknown,
    params: Map<string, string> = new Map()
  ): void {
    if (!this.listeners(event as keyof IGossipEvents).includes(listener as (...args: unknown[]) => void)) return;
    if (this.listenerCount(event.toString()) === 1 && !event.toString().startsWith("gossipsub")) {
      for (const encoding of this.supportedEncodings) {
        this.pubsub.unsubscribe(getGossipTopic(mapGossipEvent(event), forkDigest, encoding, params));
      }
    }
    if (listener) {
      this.off(event as keyof IGossipEvents, listener as (...args: unknown[]) => void);
    }
  }

  public getForkDigest(slot: Slot): ForkDigest {
    const epoch = computeEpochAtSlot(this.config, slot);
    return this.getForkDigestByEpoch(epoch);
  }

  public getForkDigestByEpoch(epoch: Epoch): ForkDigest {
    const state = this.chain.getHeadState();
    const forkVersion = epoch < state.fork.epoch ? state.fork.previousVersion : state.fork.currentVersion;
    return computeForkDigest(this.config, forkVersion, state.genesisValidatorsRoot);
  }

  private subscribe(
    forkDigest: ForkDigest,
    event: keyof IGossipEvents | string,
    listener?: unknown,
    params: Map<string, string> = new Map()
  ): void {
    if (this.listenerCount(event.toString()) === 0 && !event.toString().startsWith("gossipsub")) {
      for (const encoding of this.supportedEncodings) {
        this.pubsub.subscribe(getGossipTopic(mapGossipEvent(event), forkDigest, encoding, params));
      }
    }
    if (listener) {
      this.on(event as keyof IGossipEvents, listener as (...args: unknown[]) => void);
    }
  }

  private handleForkVersion = (): void => {
    const forkDigest = this.chain.getForkDigest();
    this.logger.verbose(`Gossip: received new fork digest ${toHexString(forkDigest)}`);
    this.pubsub.registerLibp2pTopicValidators(forkDigest);
    this.unregisterHandlers();
    this.registerHandlers(forkDigest);
  };

  private registerHandlers(forkDigest: ForkDigest): void {
    this.handlers = this.createHandlers(forkDigest);
    this.handlers.forEach((handler, topic) => {
      this.pubsub.on(topic, handler);
    });
  }

  private unregisterHandlers(): void {
    if (this.handlers) {
      this.handlers.forEach((handler, topic) => {
        this.pubsub.off(topic, handler);
      });
    }
  }

  private createHandlers(forkDigest: ForkDigest): Map<string, GossipHandlerFn> {
    const handlers = new Map();
    handlers.set(NetworkEvent.gossipHeartbeat, this.emitGossipHeartbeat);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;
    for (const encoding of this.supportedEncodings) {
      handlers.set(getGossipTopic(GossipEvent.BLOCK, forkDigest, encoding), handleIncomingBlock.bind(that));
      handlers.set(
        getGossipTopic(GossipEvent.AGGREGATE_AND_PROOF, forkDigest, encoding),
        handleIncomingAggregateAndProof.bind(that)
      );
      handlers.set(
        getGossipTopic(GossipEvent.ATTESTER_SLASHING, forkDigest, encoding),
        handleIncomingAttesterSlashing.bind(that)
      );
      handlers.set(
        getGossipTopic(GossipEvent.PROPOSER_SLASHING, forkDigest, encoding),
        handleIncomingProposerSlashing.bind(that)
      );
      handlers.set(
        getGossipTopic(GossipEvent.VOLUNTARY_EXIT, forkDigest, encoding),
        handleIncomingVoluntaryExit.bind(that)
      );

      for (let subnet = 0; subnet < ATTESTATION_SUBNET_COUNT; subnet++) {
        const committeeAttestationHandler = getCommitteeAttestationHandler(subnet);
        handlers.set(
          getGossipTopic(GossipEvent.ATTESTATION_SUBNET, forkDigest, encoding, new Map([["subnet", String(subnet)]])),
          committeeAttestationHandler.bind(that)
        );
      }
    }
    return handlers;
  }

  private emitGossipHeartbeat = (): void => {
    this.emit(NetworkEvent.gossipHeartbeat);
  };

  private logSubscriptions = (): void => {
    if (this.pubsub && this.pubsub.subscriptions) {
      this.logger.info("Current gossip subscriptions", {subscriptions: Array.from(this.pubsub.subscriptions)});
    } else {
      this.logger.info("Gossipsub not started");
    }
  };
}
