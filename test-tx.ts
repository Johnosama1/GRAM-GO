import { TonClient, WalletContractV5R1, Address } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

async function main() {
    const client = new TonClient({
        endpoint: "https://toncenter.com/api/v2/jsonRPC"
    });

    // We just want to see how to fetch transactions with client in @ton/ton
    // A random public address to test
    const addr = Address.parse("EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N");
    const txs = await client.getTransactions(addr, { limit: 5 });
    console.log(txs.length > 0 ? txs[0] : "no txs");
}
main().catch(console.error);
