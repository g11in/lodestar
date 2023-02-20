import {expect} from "chai";
import {bellatrix, deneb, ssz} from "@lodestar/types";
import {BLOB_TX_TYPE, BYTES_PER_FIELD_ELEMENT} from "@lodestar/params";
import {
  kzgCommitmentToVersionedHash,
  OPAQUE_TX_BLOB_VERSIONED_HASHES_OFFSET,
  OPAQUE_TX_MESSAGE_OFFSET,
} from "@lodestar/state-transition";

import {loadEthereumTrustedSetup, initCKZG, ckzg, FIELD_ELEMENTS_PER_BLOB_MAINNET} from "../../../src/util/kzg.js";
import {validateBlobSidecars, validateGossipBlobSidecar} from "../../../src/chain/validation/blobSidecar.js";
import {getDevBeaconNode} from "../../utils/node/beacon.js";

describe("C-KZG", async () => {
  const afterEachCallbacks: (() => Promise<unknown> | void)[] = [];
  afterEach(async () => {
    while (afterEachCallbacks.length > 0) {
      const callback = afterEachCallbacks.pop();
      if (callback) await callback();
    }
  });

  before(async function () {
    this.timeout(10000); // Loading trusted setup is slow
    await initCKZG();
    loadEthereumTrustedSetup();
  });

  it("computes the correct commitments and aggregate proofs from blobs", () => {
    // ====================
    // Apply this example to the test data
    // ====================
    const blobs = new Array(2).fill(0).map(generateRandomBlob);
    const commitments = blobs.map((blob) => ckzg.blobToKzgCommitment(blob));
    const proofs = blobs.map((blob, index) => ckzg.computeBlobKzgProof(blob, commitments[index]));
    expect(ckzg.verifyBlobKzgProofBatch(blobs, commitments, proofs)).to.equal(true);
  });

  it("BlobsSidecar", async () => {
    const bn = await getDevBeaconNode({
      params: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        ALTAIR_FORK_EPOCH: 0,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        BELLATRIX_FORK_EPOCH: 0,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        CAPELLA_FORK_EPOCH: 0,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        DENEB_FORK_EPOCH: 0,
      },
    });

    afterEachCallbacks.push(() => bn.close());

    const slot = 0;
    const blobs = [generateRandomBlob(), generateRandomBlob()];
    const kzgCommitments = blobs.map((blob) => ckzg.blobToKzgCommitment(blob));

    const signedBeaconBlock = ssz.deneb.SignedBeaconBlock.defaultValue();

    for (const kzgCommitment of kzgCommitments) {
      signedBeaconBlock.message.body.executionPayload.transactions.push(transactionForKzgCommitment(kzgCommitment));
      signedBeaconBlock.message.body.blobKzgCommitments.push(kzgCommitment);
    }
    const blockRoot = ssz.deneb.BeaconBlock.hashTreeRoot(signedBeaconBlock.message);

    const blobSidecars: deneb.BlobSidecars = blobs.map((blob, index) => {
      return {
        blockRoot,
        index,
        slot,
        blob,
        kzgProof: ckzg.computeBlobKzgProof(blob, kzgCommitments[index]),
        kzgCommitment: kzgCommitments[index],
        blockParentRoot: Buffer.alloc(32),
        proposerIndex: 0,
      };
    });

    const signedBlobSidecars: deneb.SignedBlobSidecar[] = blobs.map((blob, index) => {
      const signedBlobSidecar = ssz.deneb.SignedBlobSidecar.defaultValue();
      signedBlobSidecar.message = {
        blockRoot,
        index,
        slot,
        blob,
        kzgProof: ckzg.computeBlobKzgProof(blob, kzgCommitments[index]),
        kzgCommitment: kzgCommitments[index],
        blockParentRoot: Buffer.alloc(32),
        proposerIndex: 0,
      };
      return signedBlobSidecar;
    });

    // Full validation
    validateBlobSidecars(
      slot,
      blockRoot,
      signedBeaconBlock.message.body.executionPayload.transactions,
      kzgCommitments,
      blobSidecars
    );

    signedBlobSidecars.forEach(async (signedBlobSidecar) => {
      await validateGossipBlobSidecar(bn.config, bn.chain, signedBlobSidecar, signedBlobSidecar.message.index);
    });
  });
});

function transactionForKzgCommitment(kzgCommitment: deneb.KZGCommitment): bellatrix.Transaction {
  // Some random value that after the offset's position
  const blobVersionedHashesOffset = OPAQUE_TX_BLOB_VERSIONED_HASHES_OFFSET + 64;

  // +32 for the size of versionedHash
  const ab = new ArrayBuffer(blobVersionedHashesOffset + 32);
  const dv = new DataView(ab);
  const ua = new Uint8Array(ab);

  // Set tx type
  dv.setUint8(0, BLOB_TX_TYPE);

  // Set offset to hashes array
  // const blobVersionedHashesOffset =
  //   OPAQUE_TX_MESSAGE_OFFSET + opaqueTxDv.getUint32(OPAQUE_TX_BLOB_VERSIONED_HASHES_OFFSET, true);
  dv.setUint32(OPAQUE_TX_BLOB_VERSIONED_HASHES_OFFSET, blobVersionedHashesOffset - OPAQUE_TX_MESSAGE_OFFSET, true);

  const versionedHash = kzgCommitmentToVersionedHash(kzgCommitment);
  ua.set(versionedHash, blobVersionedHashesOffset);

  return ua;
}

/**
 * Generate random blob of sequential integers such that each element is < BLS_MODULUS
 */
function generateRandomBlob(): deneb.Blob {
  const blob = new Uint8Array(FIELD_ELEMENTS_PER_BLOB_MAINNET * BYTES_PER_FIELD_ELEMENT);
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB_MAINNET; i++) {
    dv.setUint32(i * BYTES_PER_FIELD_ELEMENT, i);
  }
  return blob;
}
