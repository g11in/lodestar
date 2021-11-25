#!/bin/bash -x

scriptDir=$(dirname $0)
. $scriptDir/common-setup.sh

docker run --rm --network host -v /mnt/code/lodestar/mergetest/packages/lodestar/$DATA_DIR:/data g11k-dregistry:31320/geth:kintsugi geth  --catalyst --http --ws -http.api "engine,net,eth" --allow-insecure-unlock --unlock $pubKey --password /data/password.txt --datadir /data