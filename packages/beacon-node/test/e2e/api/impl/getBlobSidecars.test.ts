import {expect} from "chai";
import {config} from "@lodestar/config/default";
import {ssz} from "@lodestar/types";
import {GENESIS_SLOT} from "@lodestar/params";

import {setupApiImplTestServer, ApiImplTestModules} from "../../../unit/api/impl/index.test.js";

describe("getBlobSideCar", function () {
  let server: ApiImplTestModules;

  before(function () {
    server = setupApiImplTestServer();
  });

  it("getBlobSideCar From BlobSidecars", async () => {
    const block = config.getForkTypes(GENESIS_SLOT).SignedBeaconBlock.defaultValue();
    const blobSidecars = ssz.deneb.BlobSidecarsWrapper.defaultValue();
    block.message.slot = GENESIS_SLOT;

    server.dbStub.blockArchive.get.resolves(block);
    server.dbStub.blobSidecars.get.resolves(blobSidecars);

    const returnedBlobSideCars = await server.blockApi.getBlobSidecars("genesis");

    expect(returnedBlobSideCars.data).to.equal(blobSidecars.blobSidecars);
  });
});
