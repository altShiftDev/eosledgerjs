<img src="https://user-images.githubusercontent.com/211411/34776833-6f1ef4da-f618-11e7-8b13-f0697901d6a8.png" height="100" />

## Ledger Eos app API

### Usage

```
import Transport from "@ledgerhq/hw-transport-u2f"; // for browser
import EosLedger from "@ledgerhq/hw-app-eos";
import Eos from 'eosjs'
import ecc from 'eosjs-ecc'
import { sha256 } from "sha.js"
const getEosAppVersion = async () => {
    const transport = await Transport.create();
    const eosLedger = new EosLedger(transport);
    const result = await eosLedger.getAppConfiguration();
    return result.version;
}
getEosAppVersion().then(v => console.log(v));
const getEosPublicKey = async () => {
  const transport = await Transport.create();
  const eosLedger = new EosLedger(transport);
  const result = await eosLedger.getPublicKey("44'/60'/0'");
  return result.publicKey;
};
let publicKey;
getEosPublicKey().then(pk => {
    console.log(pk);
    publicKey = pk;
});
const signHashedEosTransaction = async (publicKey) => {
  let chainId = '038f4b0fc8ff18a4f0842a8f0564611f6e96e8535901dd45e43ac8691a1c4dca'
  const eos = Eos({
    httpEndpoint: 'https://api.jungle.alohaeos.com',
    chainId: chainId,
    expireInSeconds: 60,
    broadcast: false,
    sign: false
  })
  // create transaction
  const tx = await eos.transfer('acct_from', 'acct_to', '5.0000 EOS', 'a memo')
  console.log(tx.transaction)
  // pack transaction
  let chainIdBuf = new Buffer(chainId, 'hex');
  let packedContextFreeData = new Buffer(new Uint8Array(32));
  let fcBuf = eos.fc.toBuffer('transaction', tx.transaction.transaction)
  let signBuf = Buffer.concat([chainIdBuf, fcBuf, packedContextFreeData])
  // hash transaction
  let hasher = new sha256();
  hasher.update(signBuf, 'utf8');
  const txHashed = hasher.digest();
  // sign transaction
  const result = await eosLedger.signHash("44'/60'/0'", txHashed)
  const sig = result.signature;
  let s = ecc.Signature.from(sig)
  tx.transaction.signatures.push(s.toString())
  return tx;
}
signHashedEosTransaction(publicKey).then(transaction => console.log(tx);
```
[Github](https://github.com/LedgerHQ/ledgerjs/),
[API Doc](http://ledgerhq.github.io/ledgerjs/),
[Ledger Devs Slack](https://ledger-dev.slack.com/)
