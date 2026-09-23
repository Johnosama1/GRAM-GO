import { TonClient, Address, beginCell, storeMessage } from "@ton/ton";

const client = new TonClient({
  endpoint: "https://toncenter.com/api/v2/jsonRPC"
});

async function run() {
  try {
     const addr = Address.parse("EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N");
     const txs = await client.getTransactions(addr, { limit: 1 });
     if (txs.length > 0) {
        const tx = txs[0];
        if (tx.inMessage) {
            const cell = beginCell().store(storeMessage(tx.inMessage)).endCell();
            console.log("Reconstructed inMsg hash:", cell.hash().toString('hex'));
        }
     } else {
        console.log("no tx");
     }
  } catch (e) {
     console.error(e);
  }
}
run();
