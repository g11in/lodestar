#!/bin/bash -x

curl --location --request POST 'localhost:8545/' \
--header 'Content-Type: application/json' \
--data-raw '{
	"jsonrpc":"2.0",
	"method":"eth_sendTransaction",
	"params":[{
		"from": "0xa94f5374fce5edbc8e2a8697c15331677e6ebf0b",
		"to": "0xafa3f8684e54059998bc3a7b0d2b0da075154d66",
		"gas": "0x76c0",
		"gasPrice": "0x9184e72a000",
		"value": "0x9184e72a",
		"password": "12345678"
	}],
	"id":1
}'