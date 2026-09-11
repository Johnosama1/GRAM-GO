import {
  TonClient,
  WalletContractV4,
  WalletContractV3R2,
  WalletContractV5R1,
  toNano,
  Address,
  internal,
  SendMode,
} from "@ton/ton";
import { mnemonicToPrivateKey, keyPairFromSeed, keyPairFromSecretKey } from "@ton/crypto";
import { logger } from "./logger";
import { getSetting } from "./settingsCache";

async function getClient(): Promise<TonClient> {
  const dbApiKey = await getSetting("ton_api_key");
  const apiKey = process.env.TON_API_KEY || dbApiKey || undefined;

  const endpoint =
    process.env.TON_ENDPOINT || "https://toncenter.com/api/v2/jsonRPC";
  return new TonClient({ endpoint, ...(apiKey ? { apiKey } : {}) });
}

// Wallet versions to probe in priority order: V4 (standard), V3R2 (TonWeb default), V5R1 (W5)
const WALLET_VERSIONS = ["V4", "V3R2", "V5R1"] as const;

function buildContracts(publicKey: Buffer) {
  return {
    V4: WalletContractV4.create({ publicKey, workchain: 0 }),
    V3R2: WalletContractV3R2.create({ publicKey, workchain: 0 }),
    V5R1: WalletContractV5R1.create({ publicKey, workchain: 0 }),
  };
}

async function detectWallet(client: TonClient, publicKey: Buffer) {
  const contracts = buildContracts(publicKey);

  // 1. Probe for already deployed contract
  for (const ver of WALLET_VERSIONS) {
    const c = contracts[ver];
    try {
      if (await client.isContractDeployed(c.address)) {
        const balance = await client.getBalance(c.address);
        logger.info(
          {
            version: ver,
            address: c.address.toString({ bounceable: false }),
            balance: (Number(balance) / 1e9).toFixed(4) + " TON",
          },
          "Detected deployed bot wallet",
        );
        return { contract: c, version: ver };
      }
    } catch {}
  }

  // 2. If none deployed, find which address has positive balance on blockchain
  for (const ver of WALLET_VERSIONS) {
    const c = contracts[ver];
    try {
      const balance = await client.getBalance(c.address);
      if (balance > 0n) {
        logger.info(
          {
            version: ver,
            address: c.address.toString({ bounceable: false }),
            balance: (Number(balance) / 1e9).toFixed(4) + " TON",
          },
          "Found funded undeployed bot wallet (will deploy on first send)",
        );
        return { contract: c, version: ver };
      }
    } catch {}
  }

  // 3. Fallback to V4 (most standard default)
  const defaultContract = contracts.V4;
  const v4Addr = contracts.V4.address.toString({ bounceable: false });
  const v3Addr = contracts.V3R2.address.toString({ bounceable: false });

  logger.warn(
    { v4Address: v4Addr, v3Address: v3Addr },
    "Bot hot wallet has 0 balance on all versions",
  );

  return { contract: defaultContract, version: "V4" as const };
}

export async function getEffectiveMnemonic(): Promise<string | null> {
  const dbMnemonic = await getSetting("ton_wallet_mnemonic");
  const dbSecret = await getSetting("owner_secret_key");
  const envKey =
    process.env.OWNER_SECRET_KEY ||
    process.env.TON_WALLET_MNEMONIC ||
    process.env.TON_MNEMONIC ||
    process.env.SECRET_KEY ||
    process.env.WALLET_SECRET_KEY ||
    process.env.WALLET_PRIVATE_KEY;

  return (envKey || dbMnemonic || dbSecret || null)?.trim() || null;
}

export async function resolveKeyPair(
  secretInput: string,
): Promise<{ publicKey: Buffer; secretKey: Buffer }> {
  const trimmed = secretInput.trim();

  // 1. JSON Array of byte numbers (e.g. from TonWeb config: [1, 2, 3, ...])
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr) && arr.length >= 32) {
        const buf = Buffer.from(arr);
        if (buf.length === 64) {
          return {
            secretKey: buf,
            publicKey: buf.subarray(32),
          };
        } else if (buf.length === 32) {
          const kp = keyPairFromSeed(buf);
          return { publicKey: kp.publicKey, secretKey: kp.secretKey };
        }
      }
    } catch {}
  }

  // 2. Mnemonic words (contains spaces)
  const words = trimmed.split(/\s+/);
  if (words.length >= 12 && words.every((w) => /^[a-zA-Z]+$/.test(w))) {
    const keyPair = await mnemonicToPrivateKey(words);
    return {
      publicKey: keyPair.publicKey,
      secretKey: keyPair.secretKey,
    };
  }

  // 3. 64 or 128 character hex string
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const seed = Buffer.from(trimmed, "hex");
    const kp = keyPairFromSeed(seed);
    return { publicKey: kp.publicKey, secretKey: kp.secretKey };
  }
  if (/^[0-9a-fA-F]{128}$/.test(trimmed)) {
    const buf = Buffer.from(trimmed, "hex");
    return {
      secretKey: buf,
      publicKey: buf.subarray(32),
    };
  }

  // 4. Base64 string
  try {
    const buf = Buffer.from(trimmed, "base64");
    if (buf.length === 64) {
      return {
        secretKey: buf,
        publicKey: buf.subarray(32),
      };
    } else if (buf.length === 32) {
      const kp = keyPairFromSeed(buf);
      return { publicKey: kp.publicKey, secretKey: kp.secretKey };
    }
  } catch {}

  // Fallback to mnemonic parser
  return mnemonicToPrivateKey(words);
}

export interface TonSendResult {
  txRef: string;
}

export async function sendTon(
  toAddress: string,
  amountTon: string,
): Promise<TonSendResult> {
  const secret = await getEffectiveMnemonic();
  if (!secret) {
    throw new Error(
      "محفظة البوت غير مهيأة: يرجى ضبط الكلمات السرية أو المفتاح السري في لوحة الإدارة (TON_WALLET_MNEMONIC not configured)",
    );
  }

  const keyPair = await resolveKeyPair(secret);
  const client = await getClient();

  const { contract, version } = await detectWallet(client, keyPair.publicKey);

  // Check balance before attempting transfer
  const currentBalance = await client.getBalance(contract.address);
  const neededNano = toNano(amountTon);
  if (currentBalance < neededNano + toNano("0.05")) {
    const hotAddr = contract.address.toString({ bounceable: false });
    throw new Error(
      `رصيد محفظة السحب غير كافٍ (${(Number(currentBalance) / 1e9).toFixed(4)} TON). يرجى شحن المحفظة بـ TON على العنوان:\n${hotAddr}`,
    );
  }

  type OpenedWallet =
    | ReturnType<typeof client.open<WalletContractV4>>
    | ReturnType<typeof client.open<WalletContractV3R2>>
    | ReturnType<typeof client.open<WalletContractV5R1>>;

  let wallet: OpenedWallet;
  if (version === "V3R2") {
    wallet = client.open(contract as WalletContractV3R2);
  } else if (version === "V5R1") {
    wallet = client.open(contract as WalletContractV5R1);
  } else {
    wallet = client.open(contract as WalletContractV4);
  }

  let seqno = 0;
  try {
    seqno = await wallet.getSeqno();
  } catch {
    seqno = 0;
  }

  logger.info(
    { to: toAddress, amount: amountTon, seqno, version, from: contract.address.toString({ bounceable: false }) },
    "Executing TON transfer on blockchain",
  );

  const cleanDest = Address.parse(toAddress.trim());

  await wallet.sendTransfer({
    secretKey: keyPair.secretKey,
    seqno,
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    messages: [
      internal({
        to: cleanDest,
        value: neededNano,
        bounce: false,
        body: "@GRAMGO1_bot withdrawal",
      }),
    ],
  });

  // Wait for seqno update to confirm on-chain inclusion
  let currentSeqno = seqno;
  let attempts = 0;
  while (currentSeqno === seqno && attempts < 35) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      currentSeqno = await wallet.getSeqno();
    } catch {
      // ignore
    }
    attempts++;
  }

  if (currentSeqno === seqno) {
    throw new Error(
      "تم إرسال المعاملة للبلوكشين ولكن لم يتم تأكيد زيادة الـ seqno خلال المهلة المحددة.",
    );
  }

  let txRef = `seqno-${seqno}-${Date.now()}`;
  try {
    const recentTxs = await client.getTransactions(contract.address, { limit: 5 });
    if (recentTxs && recentTxs.length > 0) {
      for (const tx of recentTxs) {
        if (tx.outMessages && tx.outMessages.size > 0) {
          txRef = tx.hash().toString("hex");
          break;
        }
      }
    }
  } catch {}

  logger.info(
    { to: toAddress, amount: amountTon, txRef, from: contract.address.toString({ bounceable: false }) },
    "TON transfer confirmed on blockchain",
  );

  return { txRef };
}

export async function getWalletAddress(): Promise<string | null> {
  const secret = await getEffectiveMnemonic();
  if (!secret) return null;
  try {
    const keyPair = await resolveKeyPair(secret);
    const client = await getClient();
    const { contract } = await detectWallet(client, keyPair.publicKey);
    return contract.address.toString({ bounceable: false, testOnly: false });
  } catch {
    return null;
  }
}

export async function getWalletBalance(): Promise<string | null> {
  const secret = await getEffectiveMnemonic();
  if (!secret) return null;
  try {
    const keyPair = await resolveKeyPair(secret);
    const client = await getClient();
    const contracts = buildContracts(keyPair.publicKey);

    // Sum balances across all supported wallet versions
    let totalNano = 0n;
    for (const ver of WALLET_VERSIONS) {
      const c = contracts[ver];
      try {
        const bal = await client.getBalance(c.address);
        totalNano += bal;
      } catch {}
    }

    return (Number(totalNano) / 1e9).toFixed(4);
  } catch {
    return null;
  }
}

export async function isTonConfigured(): Promise<boolean> {
  const secret = await getEffectiveMnemonic();
  return !!secret;
}
