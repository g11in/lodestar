import {ChainForkConfig} from "@lodestar/config";
import {Bucket, Db, Repository} from "@lodestar/db";
import {deneb, ssz} from "@lodestar/types";

export const BLOB_SIDECARS_IN_WRAPPER_INDEX = 44;
// ssz.deneb.BlobSidecars.elementType.fixedSize;
export const BLOBSIDECAR_FIXED_SIZE = 131256;

/**
 * blobSidecarsWrapper by block root (= hash_tree_root(SignedBeaconBlockAndBlobsSidecar.beacon_block.message))
 *
 * Used to store unfinalized BlobsSidecar
 */
export class BlobSidecarsRepository extends Repository<Uint8Array, deneb.BlobSidecarsWrapper> {
  constructor(config: ChainForkConfig, db: Db) {
    super(config, db, Bucket.allForks_blobSidecars, ssz.deneb.BlobSidecarsWrapper);
  }

  /**
   * Id is hashTreeRoot of unsigned BeaconBlock
   */
  getId(value: deneb.BlobSidecarsWrapper): Uint8Array {
    const {blockRoot} = value;
    return blockRoot;
  }
}
