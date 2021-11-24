#!/bin/bash -x

scriptDir=$(dirname $0)

echo $TTD
echo $DATA_DIR
echo $scriptDir
echo $EL_BINARY_DIR

env TTD=$TTD envsubst < $scriptDir/genesisPost.tmpl > $DATA_DIR/genesis.json
echo "45a915e4d060149eb4365960e6a7a45f334393093061116b197e3240065ff2d8" > $DATA_DIR/sk.json
echo "12345678" > $DATA_DIR/password.txt
pubKey="0xa94f5374fce5edbc8e2a8697c15331677e6ebf0b"

docker run --rm -v /mnt/code/lodestar/mergetest/packages/lodestar/$DATA_DIR:/data g11k-dregistry:31320/geth:kintsugi geth --catalyst --datadir /data init /data/genesis.json
docker run --rm -v /mnt/code/lodestar/mergetest/packages/lodestar/$DATA_DIR:/data g11k-dregistry:31320/geth:kintsugi geth --catalyst --datadir /data account import /data/sk.json --password /data/password.txt
docker run --network host -v /mnt/code/lodestar/mergetest/packages/lodestar/$DATA_DIR:/data g11k-dregistry:31320/geth:kintsugi geth  --catalyst --http --ws -http.api "engine,net,eth" --allow-insecure-unlock --unlock $pubKey --password /data/password.txt --datadir /data 