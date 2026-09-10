import { TonClient, Address } from "@ton/ton";
import { getSetting } from "./settingsCache";

// ── Shared TON Client ────────────────────────────────────────────────────────
export async function getClient(): Promise<TonClient> {
  const dbApiKey = await getSetting("ton_api_key");
  const apiKey = process.env.TON_API_KEY || dbApiKey || undefined;

  // Ensure we are using Mainnet
  const tonNetwork = (process.env.TON_NETWORK || "mainnet").toLowerCase();
  if (tonNetwork !== "mainnet") {
    throw new Error("TON_NETWORK must be 'mainnet'. Testnet is not allowed for security reasons.");
  }

  const endpoint = process.env.TON_ENDPOINT || "https://toncenter.com/api/v2/jsonRPC";

  return new TonClient({ endpoint, ...(apiKey ? { apiKey } : {}) });
}

// ── Verify Deposit ──────────────────────────────────────────────────────────
export interface VerifyDepositResult {
  success: boolean;
  actualAmount: string; // the amount actually received
  sender?: string;
  error?: string;
}

/**
 * Verifies a deposit transaction on the TON blockchain.
 * We fetch the transaction details by txHash, ensure it reached the expectedAddress,
 * and the amount is valid.
 */
export async function verifyDepositTx(
  txHash: string,
  expectedAddress: string
): Promise<VerifyDepositResult> {
  try {
    const client = await getClient();

    // Attempt to fetch transactions where this txHash appears
    // The TON Center API v2 does not have a direct getTransactionByHash,
    // but usually txHash is provided by the client after sending.
    // However, a reliable way to verify is to check if the destination address received a transaction with this hash.
    const txs = await client.getTransactions(Address.parse(expectedAddress), {
      limit: 50, // Increase limit if needed to search history
    });

    // Find the tx in the list
    // txHash from frontend could be base64 or hex. Tonweb usually gives base64.
    // The v2 api returns tx.hash() as a base64 string or we can compare the hex.
    const foundTx = txs.find((tx) => {
      const hashBase64 = tx.hash().toString('base64');
      const hashHex = tx.hash().toString('hex');
      return txHash === hashBase64 || txHash === hashHex || txHash === hashBase64.replace(/\+/g, '-').replace(/\//g, '_');
    });

    if (!foundTx) {
      return { success: false, actualAmount: "0", error: "Transaction not found on the blockchain." };
    }

    // Verify it's an incoming transfer
    if (!foundTx.inMessage) {
      return { success: false, actualAmount: "0", error: "Transaction has no incoming message." };
    }

    // `foundTx.inMessage.info` can be internal or external. We need internal transfer.
    if (foundTx.inMessage.info.type !== "internal") {
      return { success: false, actualAmount: "0", error: "Transaction is not an internal transfer." };
    }

    const inMsgInfo = foundTx.inMessage.info;
    const destAddress = inMsgInfo.dest.toString({ bounceable: false });
    const expectedAddressParsed = expectedAddress; // ensure format matches or use Address.parse

    // Verify it reached our address
    if (destAddress !== expectedAddressParsed) {
       // Convert expectedAddress to non-bounceable for fair comparison
       const clientSideExpectedAddr = destAddress;
       // We can also parse expectedAddress and compare
       const expectedParsed = client.open(expectedAddressParsed as any); // just for typing
       return { success: false, actualAmount: "0", error: "Recipient address mismatch." };
    }

    // Actual received amount (minus any processing fees, but value is value)
    const amountNano = inMsgInfo.value.coins;
    const amountTon = (Number(amountNano) / 1e9).toString();

    // Check transaction compute phase status
    if (foundTx.description.type === "generic") {
      const computePhase = foundTx.description.computePhase;
      if (computePhase.type === "vm") {
        if (!computePhase.success) {
           return { success: false, actualAmount: "0", error: "Transaction execution failed." };
        }
      }
    }

    return {
      success: true,
      actualAmount: amountTon,
      sender: inMsgInfo.src.toString({ bounceable: false })
    };

  } catch (error) {
    const errStr = error instanceof Error ? error.message : String(error);
    return { success: false, actualAmount: "0", error: `Blockchain verification error: ${errStr}` };
  }
}

// ── Verify Withdrawal ───────────────────────────────────────────────────────
export async function verifyWithdrawalTx(txHash: string, sourceAddress: string): Promise<boolean> {
  try {
    const client = await getClient();
    const txs = await client.getTransactions(Address.parse(sourceAddress), { limit: 50 });

    const foundTx = txs.find((tx) => {
      const hashBase64 = tx.hash().toString('base64');
      const hashHex = tx.hash().toString('hex');
      return txHash === hashBase64 || txHash === hashHex;
    });

    if (foundTx) {
       // If it has a generic compute phase, verify success
       if (foundTx.description.type === "generic") {
          const computePhase = foundTx.description.computePhase;
          if (computePhase.type === "vm") {
             return computePhase.success;
          }
       }
       return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}
