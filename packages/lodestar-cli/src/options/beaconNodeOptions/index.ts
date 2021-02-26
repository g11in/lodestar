import {IBeaconNodeOptions} from "@chainsafe/lodestar";
import {RecursivePartial, removeUndefinedRecursive} from "../../util";
import * as api from "./api";
import * as eth1 from "./eth1";
import * as logger from "./logger";
import * as metrics from "./metrics";
import * as network from "./network";

export type IBeaconNodeArgs = api.IApiArgs &
  eth1.IEth1Args &
  logger.ILoggerArgs &
  metrics.IMetricsArgs &
  network.INetworkArgs;

export function parseBeaconNodeArgs(args: IBeaconNodeArgs): RecursivePartial<IBeaconNodeOptions> {
  // Remove undefined values to allow deepmerge to inject default values downstream
  return removeUndefinedRecursive({
    api: api.parseArgs(args),
    // chain: {},
    // db: {},
    eth1: eth1.parseArgs(args),
    logger: logger.parseArgs(args),
    metrics: metrics.parseArgs(args),
    network: network.parseArgs(args),
  });
}

export const beaconNodeOptions = {
  ...api.options,
  ...eth1.options,
  ...logger.options,
  ...metrics.options,
  ...network.options,
};
