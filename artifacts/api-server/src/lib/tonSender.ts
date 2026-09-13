import {
  TonClient,
  WalletContractV4,
  WalletContractV3R2,
  WalletContractV3R1,
  WalletContractV5R1,
  toNano,
  Address,
  internal,
  SendMode,
} from "@ton/ton";
import {
  mnemonicToPrivateKey,
  mnemonicToHDSeed,
  deriveEd25519Path,
  keyPairFromSeed,
} from "@ton/crypto";
import { logger } from "./logger";
import { getSetting } from "./settingsCache";

export interface ResolvedWallet {
  contract: WalletContractV5R1 | WalletContractV4 | WalletContractV3R2 | WalletContractV3R1;
  version: "V5R1" | "V4" | "V3R2" | "V3R1";
  keyPair: { publicKey: Buffer; secretKey: Buffer };
  address: string;
}

export async function getClient(): Promise<TonClient> {
  const dbApiKey = await getSetting("ton_api_key");
  const apiKey = (process.env.TON_API_KEY || dbApiKey || "").trim() || undefined;

  const endpoint =
    process.env.TON_ENDPOINT || "https://toncenter.com/api/v2/jsonRPC";
  return new TonClient({ endpoint, ...(apiKey ? { apiKey } : {}) });
}

export async function getEffectiveMnemonic(): Promise<string | null> {
  const envKey =
    process.env.OWNER_SECRET_KEY ||
    process.env.TON_WALLET_MNEMONIC ||
    process.env.TON_MNEMONIC ||
    process.env.SECRET_KEY ||
    process.env.WALLET_SECRET_KEY ||
    process.env.WALLET_PRIVATE_KEY;

  if (envKey && envKey.trim().length > 0) {
    return envKey.trim();
  }

  const dbMnemonic = await getSetting("ton_wallet_mnemonic");
  const dbSecret = await getSetting("owner_secret_key");
  return (dbMnemonic || dbSecret || null)?.trim() || null;
}

/**
 * Resolves all candidate keypairs from the secret input.
 * Supports:
 * 1. TON Native mnemonic (24 / 12 words)
 * 2. BIP-39 HD mnemonic (TonSpace / Telegram Wallet path m/44'/607'/0')
 * 3. Hex seed / 64-byte secret key
 * 4. JSON byte array
 */
export async function getAllCandidateKeyPairs(
  secretInput: string,
): Promise<{ derivation: string; keyPair: { publicKey: Buffer; secretKey: Buffer } }[]> {
  const trimmed = secretInput.trim();
  const results: { derivation: string; keyPair: { publicKey: Buffer; secretKey: Buffer } }[] = [];

  // 1. JSON Array of byte numbers
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr) && arr.length >= 32) {
        const buf = Buffer.from(arr);
        if (buf.length === 64) {
          results.push({
            derivation: "byte-array-64",
            keyPair: { secretKey: buf, publicKey: buf.subarray(32) },
          });
        } else if (buf.length === 32) {
          const kp = keyPairFromSeed(buf);
          results.push({ derivation: "byte-array-32", keyPair: kp });
        }
      }
    } catch {}
  }

  // 2. Mnemonic words (contains spaces)
  const words = trimmed.split(/\s+/);
  if (words.length >= 12 && words.every((w) => /^[a-zA-Z]+$/.test(w))) {
    // 2a. TON Native derivation (Tonkeeper / Standard TON)
    try {
      const kpTon = await mnemonicToPrivateKey(words);
      results.push({ derivation: "ton-native", keyPair: kpTon });
    } catch (e) {
      logger.warn({ err: e }, "Failed ton-native mnemonic derivation");
    }

    // 2b. BIP-39 derivation (Telegram Wallet / TonSpace / Ledger path m/44'/607'/0')
    try {
      const hdSeed = await mnemonicToHDSeed(words);
      const derivedSeed = await deriveEd25519Path(hdSeed, [44, 607, 0]);
      const kpBip39 = keyPairFromSeed(derivedSeed);
      results.push({ derivation: "bip39-tonspace", keyPair: kpBip39 });
    } catch (e) {
      logger.warn({ err: e }, "Failed bip39 mnemonic derivation");
    }
  }

  // 3. 64 or 128 character hex string
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const seed = Buffer.from(trimmed, "hex");
    const kp = keyPairFromSeed(seed);
    results.push({ derivation: "hex-seed-32", keyPair: kp });
  } else if (/^[0-9a-fA-F]{128}$/.test(trimmed)) {
    const buf = Buffer.from(trimmed, "hex");
    results.push({
      derivation: "hex-secret-64",
      keyPair: { secretKey: buf, publicKey: buf.subarray(32) },
    });
  }

  return results;
}

/**
 * Resolves the exact active wallet according to WALLET_ADDRESS environment variable,
 * or on-chain active/funded status.
 */
export async function resolveActiveWallet(client: TonClient): Promise<ResolvedWallet> {
  const secret = await getEffectiveMnemonic();
  if (!secret) {
    throw new Error(
      "محفظة البوت غير مهيأة: يرجى وضع الكلمات السرية في متغير OWNER_SECRET_KEY (TON_WALLET_MNEMONIC not configured)",
    );
  }

  const keyCandidates = await getAllCandidateKeyPairs(secret);
  if (keyCandidates.length === 0) {
    throw new Error("فشل فك تشفير الكلمات السرية أو المفتاح السري لمحفظة البوت");
  }

  // Build all contract variations for all key derivation paths
  const allWalletOptions: ResolvedWallet[] = [];
  for (const { keyPair } of keyCandidates) {
    const pk = keyPair.publicKey;
    const variations: {
      contract: WalletContractV5R1 | WalletContractV4 | WalletContractV3R2 | WalletContractV3R1;
      version: "V5R1" | "V4" | "V3R2" | "V3R1";
    }[] = [
      { contract: WalletContractV5R1.create({ publicKey: pk, workchain: 0 }), version: "V5R1" },
      { contract: WalletContractV4.create({ publicKey: pk, workchain: 0 }), version: "V4" },
      { contract: WalletContractV3R2.create({ publicKey: pk, workchain: 0 }), version: "V3R2" },
      { contract: WalletContractV3R1.create({ publicKey: pk, workchain: 0 }), version: "V3R1" },
    ];

    for (const v of variations) {
      allWalletOptions.push({
        contract: v.contract,
        version: v.version,
        keyPair,
        address: v.contract.address.toString({ bounceable: false, testOnly: false }),
      });
    }
  }

  // 1. PRIORITY 1: Exact match with process.env.WALLET_ADDRESS
  const targetEnvAddress = (process.env.WALLET_ADDRESS || process.env.DEPOSIT_WALLET_ADDRESS || "").trim();
  if (targetEnvAddress) {
    try {
      const parsedTarget = Address.parse(targetEnvAddress);
      for (const opt of allWalletOptions) {
        if (opt.contract.address.equals(parsedTarget)) {
          logger.info(
            { version: opt.version, address: opt.address, targetEnvAddress },
            "Successfully matched exact WALLET_ADDRESS configured in environment variables",
          );
          return opt;
        }
      }
      logger.warn(
        { targetEnvAddress },
        "Configured WALLET_ADDRESS does not match any derived contract version from OWNER_SECRET_KEY",
      );
    } catch (err) {
      logger.warn({ err, targetEnvAddress }, "Invalid WALLET_ADDRESS environment variable string");
    }
  }

  // 2. PRIORITY 2: Check which wallet is already deployed or has positive on-chain balance
  for (const opt of allWalletOptions) {
    try {
      const isDeployed = await client.isContractDeployed(opt.contract.address);
      if (isDeployed) {
        const bal = await client.getBalance(opt.contract.address);
        if (bal > 0n) {
          logger.info(
            { version: opt.version, address: opt.address, balance: (Number(bal) / 1e9).toFixed(4) + " TON" },
            "Found deployed funded bot wallet",
          );
          return opt;
        }
      }
    } catch {}
  }

  // 3. PRIORITY 3: Any wallet with positive balance
  for (const opt of allWalletOptions) {
    try {
      const bal = await client.getBalance(opt.contract.address);
      if (bal > 0n) {
        logger.info(
          { version: opt.version, address: opt.address, balance: (Number(bal) / 1e9).toFixed(4) + " TON" },
          "Found funded undeployed bot wallet",
        );
        return opt;
      }
    } catch {}
  }

  // 4. Fallback: Default to first option (V5R1 / Tonkeeper standard)
  return allWalletOptions[0];
}

export interface TonSendResult {
  txRef: string;
}

export async function sendTon(
  toAddress: string,
  amountTon: string,
): Promise<TonSendResult> {
  const client = await getClient();
  const activeWallet = await resolveActiveWallet(client);
  const { contract, version, keyPair } = activeWallet;

  // Check balance before attempting transfer (0.01 TON gas margin is plenty for native transfer)
  const currentBalance = await client.getBalance(contract.address);
  const neededNano = toNano(amountTon);
  const minFeeNano = toNano("0.01");
  if (currentBalance < neededNano + minFeeNano) {
    const hotAddr = contract.address.toString({ bounceable: false });
    throw new Error(
      `رصيد محفظة السحب غير كافٍ (${(Number(currentBalance) / 1e9).toFixed(4)} TON). يرجى شحن المحفظة بـ TON على العنوان:\n${hotAddr}`,
    );
  }

  type OpenedWallet =
    | ReturnType<typeof client.open<WalletContractV5R1>>
    | ReturnType<typeof client.open<WalletContractV4>>
    | ReturnType<typeof client.open<WalletContractV3R2>>
    | ReturnType<typeof client.open<WalletContractV3R1>>;

  let wallet: OpenedWallet;
  if (version === "V5R1") {
    wallet = client.open(contract as WalletContractV5R1);
  } else if (version === "V3R2") {
    wallet = client.open(contract as WalletContractV3R2);
  } else if (version === "V3R1") {
    wallet = client.open(contract as WalletContractV3R1);
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
      }),
    ],
  });

  // Wait for seqno update to confirm on-chain inclusion (up to 4 attempts of 1.5s = ~6s max, safe for serverless)
  let currentSeqno = seqno;
  let attempts = 0;
  while (currentSeqno === seqno && attempts < 4) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      currentSeqno = await wallet.getSeqno();
    } catch {
      // ignore
    }
    attempts++;
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
    {
      to: toAddress,
      amount: amountTon,
      txRef,
      confirmed: currentSeqno > seqno,
      from: contract.address.toString({ bounceable: false }),
    },
    "TON transfer dispatched to blockchain",
  );

  return { txRef };
}

export async function getWalletAddress(): Promise<string | null> {
  const secret = await getEffectiveMnemonic();
  if (!secret) {
    return process.env.WALLET_ADDRESS?.trim() || null;
  }
  try {
    const client = await getClient();
    const activeWallet = await resolveActiveWallet(client);
    return activeWallet.address;
  } catch {
    return process.env.WALLET_ADDRESS?.trim() || null;
  }
}

export async function getWalletBalance(): Promise<string | null> {
  const secret = await getEffectiveMnemonic();
  if (!secret) return null;
  try {
    const client = await getClient();
    const activeWallet = await resolveActiveWallet(client);
    const bal = await client.getBalance(activeWallet.contract.address);
    return (Number(bal) / 1e9).toFixed(4);
  } catch {
    return null;
  }
}

export async function isTonConfigured(): Promise<boolean> {
  const secret = await getEffectiveMnemonic();
  return !!secret;
}
