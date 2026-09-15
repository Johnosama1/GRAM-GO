import { TonClient, WalletContractV5R1, internal, SendMode, toNano } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

async function main() {
    const client = new TonClient({
        endpoint: "https://toncenter.com/api/v2/jsonRPC"
    });
    const keyPair = await mnemonicToPrivateKey(["hello", "world"]); // invalid mnemonic, doesn't matter
    const contract = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const wallet = client.open(contract);

    console.log("getSeqno exists:", typeof wallet.getSeqno === 'function');
    console.log("sendTransfer exists:", typeof wallet.sendTransfer === 'function');
}
main().catch(console.error);
