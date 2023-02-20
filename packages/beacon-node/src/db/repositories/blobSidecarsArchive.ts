import {ChainForkConfig} from "@lodestar/config";
import {Bucket, Db, Repository} from "@lodestar/db";
import {deneb, ssz, Slot} from "@lodestar/types";
import {bytesToInt} from "@lodestar/utils";

/**
 * blobSidecarsWrapper by slot
 *
 * Used to store unfinalized BlobsSidecar
 */
export class BlobSidecarsArchiveRepository extends Repository<Slot, deneb.BlobSidecarsWrapper> {
  constructor(config: ChainForkConfig, db: Db) {
    super(config, db, Bucket.allForks_blobSidecarsArchive, ssz.deneb.BlobSidecarsWrapper);
  }

  // Handle key as slot

  getId(value: deneb.BlobSidecarsWrapper): Slot {
    return value.slot;
  }

  decodeKey(data: Uint8Array): number {
    return bytesToInt(super.decodeKey(data) as unknown as Uint8Array, "be");
  }
}
