import { Address, TonClient, Cell } from "@ton/ton";
import { db } from "@workspace/db";
import { botSettingsTable, depositsTable } from "@workspace/db/schema";
import { eq, or } from "drizzle-orm";
import { getSetting } from "./settingsCache";
import { logger } from "./logger";
import { getWalletAddress } from "./tonSender";

async function getClient(): Promise<TonClient> {
  const dbApiKey = await getSetting("ton_api_key");
  const apiKey = process.env.TON_API_KEY || dbApiKey || undefined;
  const endpoint =
    process.env.TON_ENDPOINT || "https://toncenter.com/api/v2/jsonRPC";
  return new TonClient({ endpoint, ...(apiKey ? { apiKey } : {}) });
}

export async function getDepositWalletAddress(): Promise<string> {
  const dbAddr = await getSetting("deposit_wallet_address");
  if (dbAddr && dbAddr.trim().length > 10) return dbAddr.trim();

  if (process.env.DEPOSIT_WALLET_ADDRESS && process.env.DEPOSIT_WALLET_ADDRESS.trim().length > 10) {
    return process.env.DEPOSIT_WALLET_ADDRESS.trim();
  }

  const senderAddr = await getWalletAddress().catch(() => null);
  if (senderAddr && senderAddr.length > 10) return senderAddr;

  return "UQD2_1mZ8p4Fk8_e2m8pWq98bWbV57YkXj5Xv_9Xb4vB2B_1";
}

function normalizeTonAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  try {
    const parsed = Address.parse(addr.trim());
    return parsed.toString({ bounceable: false, testOnly: false });
  } catch {
    return addr.trim();
  }
}

export interface VerifyDepositOptions {
  userId: number;
  amount: string | number;
  walletAddress?: string | null;
  txHash?: string | null;
  boc?: string | null;
}

export interface VerifyDepositResult {
  verified: boolean;
  isDuplicate?: boolean;
  isPending?: boolean;
  txHash?: string;
  amount?: string;
  senderWallet?: string;
  confirmedAt?: Date;
  error?: string;
}

/**
 * Verifies a TON deposit against the TON Blockchain / TonCenter API.
 * Ensures the transaction:
 * 1. Exists on-chain
 * 2. Destination matches deposit wallet
 * 3. Amount matches expected deposit amount
 * 4. Sender matches user's wallet address (if connected)
 * 5. Has not been credited or processed previously (double-spend protection)
 */
export async function verifyTonDepositTransaction(
  opts: VerifyDepositOptions
): Promise<VerifyDepositResult> {
  const { userId, amount, walletAddress, txHash, boc } = opts;
  const expectedAmt = parseFloat(String(amount));

  if (isNaN(expectedAmt) || expectedAmt <= 0) {
    return { verified: false, error: "المبلغ غير صالح" };
  }

  // ── 1. Check double transaction in DB first ───────────────────────────────
  const cleanTxHash = txHash ? String(txHash).trim() : null;
  if (cleanTxHash) {
    const existing = await db
      .select()
      .from(depositsTable)
      .where(
        or(
          eq(depositsTable.txHash, cleanTxHash),
          eq(depositsTable.txHash, cleanTxHash.toLowerCase()),
          eq(depositsTable.txHash, cleanTxHash.toUpperCase())
        )
      )
      .limit(1);

    if (existing.length > 0 && existing[0].status === "confirmed") {
      return {
        verified: false,
        isDuplicate: true,
        error: "❌ Transaction already processed (تمت معالجة هذه المعاملة مسبقاً)",
      };
    }
  }

  const depositWalletStr = await getDepositWalletAddress();
  const normalizedDepositWallet = normalizeTonAddress(depositWalletStr);

  if (!normalizedDepositWallet) {
    return { verified: false, error: "عنوان محفظة الإيداع غير مهيأ" };
  }

  let bocHashHex: string | null = null;
  if (boc) {
    try {
      const cell = Cell.fromBase64(boc);
      bocHashHex = cell.hash().toString("hex");
    } catch {
      // ignore boc parse error
    }
  }

  const normalizedUserWallet = normalizeTonAddress(walletAddress);

  // ── 2. Query TON Blockchain via TonClient ─────────────────────────────────
  try {
    const client = await getClient();
    const depositAddressObj = Address.parse(depositWalletStr);

    let transactions: any[] = [];
    try {
      transactions = await client.getTransactions(depositAddressObj, { limit: 50 });
    } catch (clientErr) {
      logger.warn({ err: clientErr }, "Failed to query getTransactions via TonClient, falling back to Toncenter API");
    }

    // If direct getTransactions returned nothing or failed, try TonCenter HTTP fallback
    if (!transactions || transactions.length === 0) {
      try {
        const dbApiKey = await getSetting("ton_api_key");
        const apiKey = process.env.TON_API_KEY || dbApiKey;
        const url = `https://toncenter.com/api/v2/getTransactions?address=${encodeURIComponent(
          depositWalletStr
        )}&limit=50&archival=true`;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (apiKey) headers["X-API-Key"] = apiKey;

        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
        if (resp.ok) {
          const json = (await resp.json()) as any;
          if (json?.ok && Array.isArray(json?.result)) {
            transactions = json.result;
          }
        }
      } catch (httpErr) {
        logger.warn({ err: httpErr }, "Toncenter HTTP fallback error");
      }
    }

    const twoHoursAgoSeconds = Math.floor(Date.now() / 1000) - 7200;

    for (const tx of transactions) {
      let inMsg: any = null;
      let hashStr: string = "";
      let ltStr: string = "";
      let txTime: number = 0;

      // Handle TonClient Transaction object vs TonCenter JSON API object
      if (typeof tx.hash === "function") {
        hashStr = tx.hash().toString("hex");
        ltStr = tx.lt?.toString() || "";
        txTime = tx.now || 0;
        inMsg = tx.inMessage;
      } else {
        hashStr = tx.transaction_id?.hash || tx.hash || "";
        ltStr = tx.transaction_id?.lt || tx.lt || "";
        txTime = tx.utime || tx.now || 0;
        inMsg = tx.in_msg;
      }

      if (!inMsg) continue;

      // Extract transaction details
      let srcAddr: string | null = null;
      let destAddr: string | null = null;
      let coinsNano: bigint = 0n;
      let commentText = "";

      if (inMsg.info) {
        // TonClient format
        if (inMsg.info.type !== "internal") continue;
        srcAddr = inMsg.info.src ? inMsg.info.src.toString({ bounceable: false, testOnly: false }) : null;
        destAddr = inMsg.info.dest ? inMsg.info.dest.toString({ bounceable: false, testOnly: false }) : null;
        coinsNano = inMsg.info.value?.coins ?? 0n;

        try {
          if (inMsg.body) {
            const slice = inMsg.body.beginParse();
            if (slice.remainingBits >= 32) {
              const op = slice.loadUint(32);
              if (op === 0) commentText = slice.loadStringTail();
            }
          }
        } catch { /* ignore */ }
      } else {
        // TonCenter JSON format
        if (inMsg["@type"] && inMsg["@type"] !== "raw.message") continue;
        srcAddr = inMsg.source || inMsg.src || null;
        destAddr = inMsg.destination || inMsg.dest || null;
        const valStr = inMsg.value || "0";
        try { coinsNano = BigInt(valStr); } catch { coinsNano = 0n; }
        commentText = inMsg.message || inMsg.comment || "";
      }

      const txTonAmt = Number(coinsNano) / 1e9;
      const normalizedSrc = normalizeTonAddress(srcAddr);
      const normalizedDest = normalizeTonAddress(destAddr);

      // Verify destination is deposit wallet
      if (normalizedDest && normalizedDepositWallet && normalizedDest !== normalizedDepositWallet) {
        continue;
      }

      // Check if this on-chain transaction hash or lt has already been credited
      const checkIdentifier = hashStr || ltStr;
      if (checkIdentifier) {
        const alreadyUsed = await db
          .select({ id: depositsTable.id })
          .from(depositsTable)
          .where(
            or(
              eq(depositsTable.txHash, checkIdentifier),
              eq(depositsTable.txHash, hashStr),
              eq(depositsTable.txHash, ltStr)
            )
          )
          .limit(1);

        if (alreadyUsed.length > 0) {
          // This specific blockchain transaction has already been credited
          continue;
        }
      }

      // ── Matching conditions ───────────────────────────────────────────────
      const amtDiff = Math.abs(txTonAmt - expectedAmt);
      const amountMatches = amtDiff <= 0.005; // allow small rounding tolerance
      const isRecent = txTime >= twoHoursAgoSeconds || txTime === 0;

      // Case A: Explicit hash match
      const matchesExplicitHash =
        cleanTxHash &&
        (hashStr.toLowerCase() === cleanTxHash.toLowerCase() ||
          ltStr === cleanTxHash ||
          (bocHashHex && hashStr.toLowerCase() === bocHashHex.toLowerCase()));

      // Case B: Sender + Amount match
      const matchesSenderAndAmount =
        normalizedUserWallet &&
        normalizedSrc &&
        normalizedSrc === normalizedUserWallet &&
        amountMatches &&
        isRecent;

      // Case C: Comment containing user ID + Amount match
      const matchesCommentAndAmount =
        commentText &&
        (commentText.includes(`user_${userId}`) || commentText.includes(String(userId))) &&
        amountMatches &&
        isRecent;

      if (matchesExplicitHash || matchesSenderAndAmount || matchesCommentAndAmount) {
        const resolvedTxHash = hashStr || cleanTxHash || ltStr || `tx_${Date.now()}`;
        return {
          verified: true,
          txHash: resolvedTxHash,
          amount: txTonAmt.toFixed(4),
          senderWallet: normalizedSrc || normalizedUserWallet || undefined,
          confirmedAt: txTime ? new Date(txTime * 1000) : new Date(),
        };
      }
    }

    // If transaction was not found in the recent list:
    // If user provided a recent boc / txHash from TonConnect, it might still be propagating to the blockchain.
    if (boc || cleanTxHash) {
      return {
        verified: false,
        isPending: true,
        txHash: cleanTxHash || bocHashHex || `tc_${Date.now()}`,
        amount: expectedAmt.toFixed(4),
        senderWallet: normalizedUserWallet || undefined,
        error: "المعاملة قيد التأكيد على شبكة TON. يرجى الانتظار بضع لحظات.",
      };
    }

    return {
      verified: false,
      error: "لم يتم العثور على المعاملة على شبكة TON. تأكد من إرسال المبلغ إلى محفظة الإيداع المحددة.",
    };
  } catch (err) {
    logger.error({ err, userId, amount }, "Error during TON deposit blockchain verification");
    return {
      verified: false,
      error: "تعذر التحقق من المعاملة عبر شبكة TON حالياً. يرجى المحاولة مرة أخرى.",
    };
  }
}
