#!/bin/bash -x

scriptDir=$(dirname $0)

env TTD=$TTD envsubst < $scriptDir/genesisPost.tmpl > $DATA_DIR/genesis.json
$EL_BINARY_DIR/geth --catalyst --datadir $DATA_DIR init $DATA_DIR/genesis.json
$EL_BINARY_DIR/geth --catalyst --http --ws -http.api "engine,net,eth" --datadir $DATA_DIR
