import React, { useState, useEffect, useRef } from "react";
import { useUser } from "../lib/userContext";
import { useLanguage } from "../lib/i18nContext";
import {
  api,
  Withdrawal,
  Deposit,
  swapGramToGo,
  recordDeposit,
  getWithdrawalsOnce,
  getDepositsOnce,
  invalidateUserCaches,
} from "../lib/api";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import {
  User as UserIcon,
  Wallet,
  ArrowDownUp,
  Settings as SettingsIcon,
  Copy,
  Check,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Send,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  CheckCheck,
  Globe,
  Headphones,
  ShieldCheck,
  Sparkles,
  Zap,
  Info,
  QrCode,
  X,
} from "lucide-react";
import { useLocation } from "wouter";

const MIN_WITHDRAWAL = 0.1;
const TON_IMG = "https://assets.coingecko.com/coins/images/17980/standard/photo_2024-09-10_17.09.00.jpeg?1725963446";

function GramLogo({ size = 28 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #fef08a, #fbbf24)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.52,
        boxShadow: "0 0 12px rgba(251, 191, 36, 0.4)",
        flexShrink: 0,
      }}
    >
      💎
    </div>
  );
}

function GoLogo({ size = 28 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #c084fc, #9333ea)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.52,
        boxShadow: "0 0 12px rgba(168, 85, 247, 0.4)",
        flexShrink: 0,
      }}
    >
      ⚡
    </div>
  );
}

function TonLogo({ size = 28 }: { size?: number }) {
  return (
    <img
      src={TON_IMG}
      alt="TON"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        boxShadow: "0 0 10px rgba(0, 152, 234, 0.4)",
      }}
    />
  );
}

function maskWallet(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return addr.slice(0, 6) + "•••" + addr.slice(-5);
}

export default function ProfilePage() {
  const { user, refresh } = useUser();
  const { t, language, setLanguage, isRtl } = useLanguage();
  const [, setLocation] = useLocation();

  // Active Main Tab: "wallet" | "swap" | "settings"
  const [activeTab, setActiveTab] = useState<"wallet" | "swap" | "settings">(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "swap" || tabParam === "settings") return tabParam;
    } catch {
      // ignore
    }
    return "wallet";
  });

  // Wallet Sub-Tab: "withdraw" | "deposit" | "history"
  const [walletTab, setWalletTab] = useState<"withdraw" | "deposit" | "history">("withdraw");

  // TonConnect UI hook
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const prevAddressRef = useRef("");

  // Price & Config
  const [tonPrice, setTonPrice] = useState<number>(2.5);
  const [depositWallet, setDepositWallet] = useState<string>("UQD2_1mZ8p4Fk8_e2m8pWq98bWbV57YkXj5Xv_9Xb4vB2B_1");
  const [minDeposit, setMinDeposit] = useState<number>(0.1);
  const [gramRate, setGramRate] = useState<number>(50); // 1 GRAM = 50 GO

  // Copy states
  const [copiedId, setCopiedId] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedDepAddress, setCopiedDepAddress] = useState(false);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  // Deposit state
  const [depositAmount, setDepositAmount] = useState("1.0");
  const [depositing, setDepositing] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);
  const [depositError, setDepositError] = useState("");
  const [showQrModal, setShowQrModal] = useState(false);

  // Swap state
  const [swapGramAmount, setSwapGramAmount] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [swapSuccess, setSwapSuccess] = useState(false);
  const [swapResult, setSwapResult] = useState<{ gramAmount: string; goAmount: string } | null>(null);
  const [swapError, setSwapError] = useState("");

  // History state
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Auto-sync TON Wallet with account ──────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const prev = prevAddressRef.current;
    prevAddressRef.current = connectedAddress;
    if (connectedAddress && connectedAddress !== user.savedWalletAddress) {
      api.saveWallet(user.id, connectedAddress).then(() => refresh()).catch(() => {});
    } else if (!connectedAddress && prev && user.savedWalletAddress) {
      api.saveWallet(user.id, "").then(() => refresh()).catch(() => {});
    }
  }, [connectedAddress, user?.id]);

  // ── Fetch price & config ──────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/price/ton")
      .then((r) => r.json())
      .then((d) => {
        if (d?.usd) setTonPrice(d.usd);
      })
      .catch(() => {});

    api.getConfig()
      .then((cfg) => {
        if (cfg.depositWalletAddress) setDepositWallet(cfg.depositWalletAddress);
        if (cfg.minDeposit) setMinDeposit(cfg.minDeposit);
        if (cfg.gramToGoRate) setGramRate(cfg.gramToGoRate);
      })
      .catch(() => {});
  }, []);

  // ── Load history ──────────────────────────────────────────────────────
  const loadHistory = () => {
    if (!user) return;
    setHistoryLoading(true);
    Promise.allSettled([getWithdrawalsOnce(user.id), getDepositsOnce(user.id)])
      .then(([wRes, dRes]) => {
        if (wRes.status === "fulfilled") setWithdrawals(wRes.value);
        if (dRes.status === "fulfilled") setDeposits(dRes.value);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  };

  useEffect(() => {
    if (user?.id) loadHistory();
  }, [user?.id]);

  // Balances
  const gramBalance = parseFloat(user?.gramBalance || "0");
  const goBalance = parseFloat(user?.goBalance || user?.balance || "0");
  const tonBalance = parseFloat(user?.tonBalance || "0");
  const savedWallet = user?.savedWalletAddress || connectedAddress || null;
  const isWalletConnected = Boolean(connectedAddress || user?.savedWalletAddress);

  const copyUserId = () => {
    if (!user) return;
    navigator.clipboard.writeText(String(user.id));
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const copyConnectedAddress = () => {
    if (!savedWallet) return;
    navigator.clipboard.writeText(savedWallet);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const copyDepositAddress = () => {
    navigator.clipboard.writeText(depositWallet);
    setCopiedDepAddress(true);
    setTimeout(() => setCopiedDepAddress(false), 2000);
  };

  // ── Handle Withdraw ───────────────────────────────────────────────────
  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || withdrawing) return;
    setWithdrawError("");
    setWithdrawSuccess(false);

    if (!savedWallet) {
      setWithdrawError(t.connectWalletPrompt);
      return;
    }

    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < MIN_WITHDRAWAL) {
      setWithdrawError(`${t.minWithdrawal}`);
      return;
    }
    if (amt > tonBalance) {
      setWithdrawError(t.insufficientTon);
      return;
    }

    setWithdrawing(true);
    try {
      await api.requestWithdrawal({
        userId: user.id,
        amount: withdrawAmount,
        walletAddress: savedWallet,
      });
      invalidateUserCaches(user.id);
      setWithdrawSuccess(true);
      setWithdrawAmount("");
      await refresh();
      loadHistory();
      setTimeout(() => setWithdrawSuccess(false), 4000);
    } catch (err: unknown) {
      setWithdrawError(err instanceof Error ? err.message : t.withdrawFailed);
    } finally {
      setWithdrawing(false);
    }
  };

  // ── Handle Instant Deposit via TonConnect ─────────────────────────────
  const handleDepositViaTonConnect = async () => {
    if (!user || depositing) return;
    setDepositError("");
    setDepositSuccess(false);

    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt < minDeposit) {
      setDepositError(`${t.minDepositNotice}`);
      return;
    }

    if (!connectedAddress) {
      tonConnectUI.openModal();
      return;
    }

    setDepositing(true);
    try {
      // nanoTon = amt * 10^9
      const nanoTon = BigInt(Math.floor(amt * 1e9)).toString();
      const commentPayload = `user_${user.id}`;

      // TonConnect sendTransaction
      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300, // 5 mins
        messages: [
          {
            address: depositWallet,
            amount: nanoTon,
            // Simple text payload
            payload: undefined,
          },
        ],
      });

      // Record deposit attempt in backend
      await recordDeposit({
        userId: user.id,
        amount: String(amt),
        walletAddress: connectedAddress,
        txHash: result.boc ? "tc_boc_" + Date.now() : undefined,
      }).catch(() => {});

      invalidateUserCaches(user.id);
      setDepositSuccess(true);
      setDepositAmount("1.0");
      loadHistory();
      setTimeout(() => setDepositSuccess(false), 5000);
    } catch (err: unknown) {
      setDepositError(err instanceof Error ? err.message : t.depositFailed);
    } finally {
      setDepositing(false);
    }
  };

  // ── Handle Swap GRAM -> GO ────────────────────────────────────────────
  const handleSwapGramToGo = async () => {
    if (!user || swapping) return;
    setSwapError("");
    setSwapSuccess(false);
    setSwapResult(null);

    const amt = parseFloat(swapGramAmount);
    if (isNaN(amt) || amt <= 0) {
      setSwapError(t.enterValidAmount);
      return;
    }
    if (amt > gramBalance) {
      setSwapError(t.insufficientGram);
      return;
    }

    setSwapping(true);
    try {
      const res = await swapGramToGo(user.id, amt);
      setSwapResult({ gramAmount: res.gramAmount, goAmount: res.goAmount });
      setSwapSuccess(true);
      setSwapGramAmount("");
      invalidateUserCaches(user.id);
      await refresh();
      setTimeout(() => setSwapSuccess(false), 5000);
    } catch (err: unknown) {
      setSwapError(err instanceof Error ? err.message : t.swapFailed);
    } finally {
      setSwapping(false);
    }
  };

  // Display name & avatar initial
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || t.telegramUser;
  const usernameDisplay = user?.username ? `@${user.username}` : t.noUsername;
  const avatarInitial = (fullName.trim()[0] || "U").toUpperCase();

  const statusLabel = (s: string) => {
    switch (s) {
      case "approved":
      case "completed":
        return t.approved;
      case "rejected":
      case "failed":
        return t.rejected;
      case "processing":
        return t.processing;
      default:
        return t.pending;
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "approved":
      case "completed":
        return "#34d399";
      case "rejected":
      case "failed":
        return "#f87171";
      case "processing":
        return "#fbbf24";
      default:
        return "rgba(255,255,255,0.45)";
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        direction: isRtl ? "rtl" : "ltr",
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .tab-fade { animation: fadeIn 0.22s ease forwards; }
        .no-spinner::-webkit-inner-spin-button,
        .no-spinner::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinner { -moz-appearance: textfield; }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════
          1. HEADER (Profile Info & Balances)
      ══════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          flexShrink: 0,
          padding: "max(env(safe-area-inset-top, 0px), 14px) 16px 10px",
          background: "linear-gradient(180deg, rgba(6, 10, 28, 0.96) 0%, rgba(6, 10, 28, 0.85) 100%)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(0, 242, 254, 0.12)",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.4)",
        }}
      >
        {/* Top bar title & Back button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setLocation("/")}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                background: "rgba(255, 255, 255, 0.06)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              {isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
            <div>
              <div style={{ color: "#ffffff", fontSize: 18, fontWeight: 900, letterSpacing: -0.3 }}>
                {t.profileTitle}
              </div>
              <div style={{ color: "rgba(0, 242, 254, 0.75)", fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
                GRAM GO MINING
              </div>
            </div>
          </div>

          {/* Quick Language Indicator Chip */}
          <button
            onClick={() => setActiveTab("settings")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 20,
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#e2e8f0",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            <Globe size={13} color="#00f2fe" />
            <span>{language.toUpperCase()}</span>
          </button>
        </div>

        {/* User Profile Card */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "12px 14px",
            borderRadius: 18,
            background: "linear-gradient(135deg, rgba(0, 242, 254, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)",
            border: "1px solid rgba(0, 242, 254, 0.22)",
            marginBottom: 12,
          }}
        >
          {/* Avatar Photo */}
          {user?.photoUrl ? (
            <img
              src={user.photoUrl}
              alt="avatar"
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid #00f2fe",
                boxShadow: "0 0 14px rgba(0, 242, 254, 0.4)",
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #00f2fe, #a855f7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                color: "#ffffff",
                fontSize: 22,
                boxShadow: "0 0 14px rgba(0, 242, 254, 0.4)",
                flexShrink: 0,
              }}
            >
              {avatarInitial}
            </div>
          )}

          {/* Name & ID */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  color: "#ffffff",
                  fontSize: 16,
                  fontWeight: 900,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {fullName}
              </span>
              <span style={{ fontSize: 13 }}>👑</span>
            </div>

            {/* Username */}
            <div style={{ color: "#38bdf8", fontSize: 12, fontWeight: 700, marginTop: 1 }}>
              {usernameDisplay}
            </div>

            {/* User ID with Copy */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: 11 }}>
                {t.userId}: <strong style={{ color: "#e2e8f0" }}>{user?.id}</strong>
              </span>
              <button
                onClick={copyUserId}
                style={{
                  background: "rgba(0, 242, 254, 0.12)",
                  border: "1px solid rgba(0, 242, 254, 0.25)",
                  borderRadius: 6,
                  padding: "2px 6px",
                  color: copiedId ? "#34d399" : "#00f2fe",
                  fontSize: 10,
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  cursor: "pointer",
                }}
              >
                {copiedId ? (
                  <>
                    <Check size={10} /> {t.copied}
                  </>
                ) : (
                  <>
                    <Copy size={10} /> {t.copyId}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 3 Balances Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          {/* GRAM */}
          <div
            style={{
              borderRadius: 14,
              padding: "8px 10px",
              background: "rgba(251, 191, 36, 0.10)",
              border: "1px solid rgba(251, 191, 36, 0.28)",
              textAlign: "center",
            }}
          >
            <div style={{ color: "rgba(251, 191, 36, 0.85)", fontSize: 9, fontWeight: 800, letterSpacing: 0.5 }}>
              GRAM
            </div>
            <div style={{ color: "#fbbf24", fontSize: 14, fontWeight: 900, marginTop: 2 }}>
              {gramBalance.toFixed(3)}
            </div>
          </div>

          {/* GO */}
          <div
            style={{
              borderRadius: 14,
              padding: "8px 10px",
              background: "rgba(168, 85, 247, 0.10)",
              border: "1px solid rgba(168, 85, 247, 0.28)",
              textAlign: "center",
            }}
          >
            <div style={{ color: "rgba(192, 132, 252, 0.85)", fontSize: 9, fontWeight: 800, letterSpacing: 0.5 }}>
              GO POWER
            </div>
            <div style={{ color: "#c084fc", fontSize: 14, fontWeight: 900, marginTop: 2 }}>
              {goBalance.toFixed(1)}
            </div>
          </div>

          {/* TON */}
          <div
            style={{
              borderRadius: 14,
              padding: "8px 10px",
              background: "rgba(0, 152, 234, 0.10)",
              border: "1px solid rgba(0, 152, 234, 0.28)",
              textAlign: "center",
            }}
          >
            <div style={{ color: "rgba(56, 189, 248, 0.85)", fontSize: 9, fontWeight: 800, letterSpacing: 0.5 }}>
              TON
            </div>
            <div style={{ color: "#38bdf8", fontSize: 14, fontWeight: 900, marginTop: 2 }}>
              {tonBalance.toFixed(3)}
            </div>
          </div>
        </div>

        {/* 3 Main Tabs Switcher */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            background: "rgba(255, 255, 255, 0.05)",
            borderRadius: 16,
            padding: 4,
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          {/* Wallet Tab */}
          <button
            onClick={() => setActiveTab("wallet")}
            style={{
              padding: "9px 0",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: 800,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "all 0.2s ease",
              background:
                activeTab === "wallet"
                  ? "linear-gradient(135deg, #0098EA, #005fa3)"
                  : "transparent",
              color: activeTab === "wallet" ? "#ffffff" : "rgba(255, 255, 255, 0.45)",
              boxShadow: activeTab === "wallet" ? "0 4px 14px rgba(0, 152, 234, 0.4)" : "none",
            }}
          >
            <Wallet size={14} />
            {t.tabWallet}
          </button>

          {/* Swap Tab */}
          <button
            onClick={() => setActiveTab("swap")}
            style={{
              padding: "9px 0",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: 800,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "all 0.2s ease",
              background:
                activeTab === "swap"
                  ? "linear-gradient(135deg, #fbbf24, #d97706)"
                  : "transparent",
              color: activeTab === "swap" ? "#080c1a" : "rgba(255, 255, 255, 0.45)",
              boxShadow: activeTab === "swap" ? "0 4px 14px rgba(251, 191, 36, 0.4)" : "none",
            }}
          >
            <ArrowDownUp size={14} />
            {t.tabSwap}
          </button>

          {/* Settings Tab */}
          <button
            onClick={() => setActiveTab("settings")}
            style={{
              padding: "9px 0",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: 800,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "all 0.2s ease",
              background:
                activeTab === "settings"
                  ? "linear-gradient(135deg, #a855f7, #7e22ce)"
                  : "transparent",
              color: activeTab === "settings" ? "#ffffff" : "rgba(255, 255, 255, 0.45)",
              boxShadow: activeTab === "settings" ? "0 4px 14px rgba(168, 85, 247, 0.4)" : "none",
            }}
          >
            <SettingsIcon size={14} />
            {t.tabSettings}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          2. CONTENT BODY
      ══════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch" as never,
          padding: "16px 16px 90px",
          background: "rgba(4, 6, 24, 0.60)",
        }}
      >
        {/* ════════════════════════════════════════════════════════════════
            TAB 1: WALLET (Deposit + Withdraw + History)
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "wallet" && (
          <div className="tab-fade" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Wallet Connection Status Card */}
            <div
              style={{
                borderRadius: 20,
                padding: "16px",
                background: isWalletConnected
                  ? "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 40, 30, 0.65))"
                  : "linear-gradient(135deg, rgba(0, 152, 234, 0.12), rgba(6, 25, 50, 0.65))",
                border: isWalletConnected
                  ? "1px solid rgba(52, 211, 153, 0.35)"
                  : "1px solid rgba(0, 152, 234, 0.30)",
                boxShadow: "0 8px 30px rgba(0, 0, 0, 0.3)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: isWalletConnected ? "rgba(52, 211, 153, 0.18)" : "rgba(0, 152, 234, 0.18)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: isWalletConnected
                        ? "1px solid rgba(52, 211, 153, 0.3)"
                        : "1px solid rgba(0, 152, 234, 0.3)",
                    }}
                  >
                    <Wallet size={20} color={isWalletConnected ? "#34d399" : "#38bdf8"} />
                  </div>
                  <div>
                    <div
                      style={{
                        color: "rgba(255, 255, 255, 0.45)",
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: 1.5,
                        fontWeight: 800,
                      }}
                    >
                      {isWalletConnected ? t.connectedWallet : t.connectWalletPrompt}
                    </div>
                    <div style={{ color: "#ffffff", fontWeight: 800, fontSize: 13, marginTop: 2 }}>
                      {isWalletConnected ? maskWallet(savedWallet || "") : t.notConnected}
                    </div>
                  </div>
                </div>

                {isWalletConnected ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={copyConnectedAddress}
                      style={{
                        padding: "7px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        background: "rgba(255, 255, 255, 0.06)",
                        color: copiedAddress ? "#34d399" : "#fff",
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {copiedAddress ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await tonConnectUI.disconnect();
                        } catch {}
                      }}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(248, 113, 113, 0.35)",
                        background: "rgba(248, 113, 113, 0.12)",
                        color: "#fca5a5",
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {t.disconnect}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => tonConnectUI.openModal()}
                    style={{
                      padding: "9px 16px",
                      borderRadius: 12,
                      border: "none",
                      background: "linear-gradient(135deg, #0098EA, #005fa3)",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      boxShadow: "0 4px 14px rgba(0, 152, 234, 0.45)",
                    }}
                  >
                    <TonLogo size={16} />
                    {t.connectWallet}
                  </button>
                )}
              </div>
            </div>

            {/* If NOT connected prompt banner */}
            {!isWalletConnected && (
              <div
                style={{
                  borderRadius: 18,
                  padding: "20px 16px",
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(0, 152, 234, 0.2)",
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "rgba(0, 152, 234, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <TonLogo size={36} />
                </div>
                <div>
                  <h4 style={{ color: "#fff", fontSize: 16, fontWeight: 900, margin: "0 0 6px" }}>
                    {t.connectWalletPrompt}
                  </h4>
                  <p style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                    {t.connectWalletDesc}
                  </p>
                </div>
                <button
                  onClick={() => tonConnectUI.openModal()}
                  style={{
                    width: "100%",
                    maxWidth: 240,
                    padding: "14px",
                    borderRadius: 14,
                    border: "none",
                    background: "linear-gradient(135deg, #0098EA 0%, #005fa3 100%)",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 6px 20px rgba(0, 152, 234, 0.4)",
                  }}
                >
                  {t.connectWallet}
                </button>
              </div>
            )}

            {/* If connected: Show Deposit / Withdraw / History sub-tabs */}
            {isWalletConnected && (
              <>
                {/* Sub Tab Switcher */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    background: "rgba(255, 255, 255, 0.04)",
                    borderRadius: 14,
                    padding: 4,
                    border: "1px solid rgba(255, 255, 255, 0.07)",
                  }}
                >
                  {(["withdraw", "deposit", "history"] as const).map((wt) => (
                    <button
                      key={wt}
                      onClick={() => setWalletTab(wt)}
                      style={{
                        padding: "8px 0",
                        borderRadius: 10,
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontWeight: 800,
                        fontSize: 12,
                        background:
                          walletTab === wt
                            ? wt === "deposit"
                              ? "linear-gradient(135deg, #10b981, #059669)"
                              : wt === "withdraw"
                              ? "linear-gradient(135deg, #0098EA, #005fa3)"
                              : "rgba(255, 255, 255, 0.12)"
                            : "transparent",
                        color: walletTab === wt ? "#ffffff" : "rgba(255, 255, 255, 0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                      }}
                    >
                      {wt === "withdraw" && <Send size={12} />}
                      {wt === "deposit" && <Download size={12} />}
                      {wt === "history" && <Clock size={12} />}
                      {wt === "withdraw" && t.withdraw}
                      {wt === "deposit" && t.deposit}
                      {wt === "history" && t.history}
                    </button>
                  ))}
                </div>

                {/* ── WITHDRAW SUB-TAB ─────────────────────────────── */}
                {walletTab === "withdraw" && (
                  <form onSubmit={handleWithdraw} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Amount card */}
                    <div
                      style={{
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.09)",
                        borderRadius: 18,
                        padding: "16px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 10,
                        }}
                      >
                        <span
                          style={{
                            color: "rgba(255, 255, 255, 0.4)",
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                          }}
                        >
                          {t.amount}
                        </span>
                        <span
                          style={{
                            background: "rgba(0, 152, 234, 0.14)",
                            border: "1px solid rgba(0, 152, 234, 0.28)",
                            borderRadius: 8,
                            padding: "2px 8px",
                            color: "#38bdf8",
                            fontSize: 10,
                            fontWeight: 800,
                          }}
                        >
                          {t.available}: {tonBalance.toFixed(4)} TON
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <input
                          className="no-spinner"
                          type="number"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          placeholder="0.00"
                          step="any"
                          disabled={withdrawing}
                          style={{
                            flex: 1,
                            background: "none",
                            border: "none",
                            outline: "none",
                            color: parseFloat(withdrawAmount) > 0 ? "#fff" : "rgba(255,255,255,0.25)",
                            fontSize: 26,
                            fontWeight: 900,
                            fontFamily: "inherit",
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            background: "rgba(0, 152, 234, 0.15)",
                            border: "1px solid rgba(0, 152, 234, 0.28)",
                            borderRadius: 12,
                            padding: "6px 10px",
                          }}
                        >
                          <TonLogo size={18} />
                          <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>TON</span>
                        </div>
                      </div>

                      {parseFloat(withdrawAmount) > 0 && tonPrice && (
                        <div style={{ color: "rgba(255, 255, 255, 0.35)", fontSize: 11, marginTop: 8 }}>
                          ≈ ${(parseFloat(withdrawAmount) * tonPrice).toFixed(2)} USD
                        </div>
                      )}
                    </div>

                    {/* Quick Presets */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                      {[0.1, 0.5, 1, tonBalance].map((p, i) => {
                        const isMax = i === 3;
                        const disabled = p <= 0 || p > tonBalance || withdrawing;
                        return (
                          <button
                            key={i}
                            type="button"
                            disabled={disabled}
                            onClick={() => setWithdrawAmount(p.toFixed(isMax ? 4 : 1))}
                            style={{
                              padding: "9px 4px",
                              borderRadius: 12,
                              fontFamily: "inherit",
                              background: isMax ? "rgba(0, 152, 234, 0.18)" : "rgba(255, 255, 255, 0.05)",
                              border: isMax
                                ? "1px solid rgba(0, 152, 234, 0.4)"
                                : "1px solid rgba(255, 255, 255, 0.08)",
                              color: isMax ? "#38bdf8" : "rgba(255, 255, 255, 0.6)",
                              fontSize: 12,
                              fontWeight: 800,
                              cursor: disabled ? "not-allowed" : "pointer",
                              opacity: disabled ? 0.35 : 1,
                            }}
                          >
                            {isMax ? t.all : p}
                          </button>
                        );
                      })}
                    </div>

                    {/* Messages */}
                    {withdrawSuccess && (
                      <div
                        style={{
                          borderRadius: 14,
                          padding: "12px 14px",
                          background: "rgba(16, 185, 129, 0.15)",
                          border: "1px solid rgba(16, 185, 129, 0.35)",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <CheckCircle size={20} color="#34d399" />
                        <div>
                          <div style={{ color: "#34d399", fontSize: 13, fontWeight: 800 }}>{t.withdrawSuccess}</div>
                          <div style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 11 }}>
                            {t.withdrawSuccessDesc}
                          </div>
                        </div>
                      </div>
                    )}

                    {withdrawError && (
                      <div
                        style={{
                          borderRadius: 12,
                          padding: "10px 14px",
                          background: "rgba(248, 113, 113, 0.10)",
                          border: "1px solid rgba(248, 113, 113, 0.3)",
                          color: "#fca5a5",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {withdrawError}
                      </div>
                    )}

                    {/* Withdraw Submit CTA */}
                    <button
                      type="submit"
                      disabled={withdrawing || tonBalance < MIN_WITHDRAWAL}
                      style={{
                        width: "100%",
                        padding: "16px",
                        borderRadius: 16,
                        border: "none",
                        background:
                          tonBalance >= MIN_WITHDRAWAL
                            ? "linear-gradient(135deg, #0098EA 0%, #005fa3 100%)"
                            : "rgba(255, 255, 255, 0.06)",
                        color: tonBalance >= MIN_WITHDRAWAL ? "#ffffff" : "rgba(255, 255, 255, 0.3)",
                        fontSize: 15,
                        fontWeight: 800,
                        cursor: tonBalance >= MIN_WITHDRAWAL && !withdrawing ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        boxShadow: tonBalance >= MIN_WITHDRAWAL ? "0 6px 24px rgba(0, 152, 234, 0.4)" : "none",
                      }}
                    >
                      {withdrawing ? (
                        <>
                          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> {t.withdrawing}
                        </>
                      ) : (
                        <>
                          <Send size={16} /> {t.withdrawTon}
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* ── DEPOSIT SUB-TAB ──────────────────────────────── */}
                {walletTab === "deposit" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* Instant TonConnect Deposit Card */}
                    <div
                      style={{
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.09)",
                        borderRadius: 18,
                        padding: "16px",
                      }}
                    >
                      <div style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 11, fontWeight: 700, marginBottom: 10 }}>
                        {t.depositTonConnect}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                        <input
                          className="no-spinner"
                          type="number"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="1.0"
                          step="0.1"
                          min="0.1"
                          disabled={depositing}
                          style={{
                            flex: 1,
                            background: "none",
                            border: "none",
                            outline: "none",
                            color: "#fff",
                            fontSize: 26,
                            fontWeight: 900,
                            fontFamily: "inherit",
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            background: "rgba(16, 185, 129, 0.15)",
                            border: "1px solid rgba(16, 185, 129, 0.3)",
                            borderRadius: 12,
                            padding: "6px 10px",
                          }}
                        >
                          <TonLogo size={18} />
                          <span style={{ color: "#34d399", fontWeight: 800, fontSize: 13 }}>TON</span>
                        </div>
                      </div>

                      {/* Presets */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 14 }}>
                        {[0.5, 1.0, 2.0, 5.0].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setDepositAmount(String(val))}
                            style={{
                              padding: "8px 4px",
                              borderRadius: 10,
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              background: depositAmount === String(val) ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.04)",
                              color: depositAmount === String(val) ? "#34d399" : "rgba(255, 255, 255, 0.6)",
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            +{val} TON
                          </button>
                        ))}
                      </div>

                      {depositSuccess && (
                        <div
                          style={{
                            borderRadius: 12,
                            padding: "10px 14px",
                            background: "rgba(16, 185, 129, 0.15)",
                            border: "1px solid rgba(16, 185, 129, 0.3)",
                            color: "#34d399",
                            fontSize: 12,
                            fontWeight: 700,
                            marginBottom: 10,
                          }}
                        >
                          {t.depositSuccess} {t.depositSuccessDesc}
                        </div>
                      )}

                      {depositError && (
                        <div
                          style={{
                            borderRadius: 12,
                            padding: "10px 14px",
                            background: "rgba(248, 113, 113, 0.10)",
                            border: "1px solid rgba(248, 113, 113, 0.3)",
                            color: "#fca5a5",
                            fontSize: 12,
                            fontWeight: 700,
                            marginBottom: 10,
                          }}
                        >
                          {depositError}
                        </div>
                      )}

                      <button
                        onClick={handleDepositViaTonConnect}
                        disabled={depositing}
                        style={{
                          width: "100%",
                          padding: "14px",
                          borderRadius: 14,
                          border: "none",
                          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                          color: "#fff",
                          fontSize: 14,
                          fontWeight: 800,
                          cursor: depositing ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          boxShadow: "0 4px 18px rgba(16, 185, 129, 0.35)",
                        }}
                      >
                        {depositing ? (
                          <>
                            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> {t.depositing}
                          </>
                        ) : (
                          <>
                            <Download size={16} /> {t.depositNow}
                          </>
                        )}
                      </button>
                    </div>

                    {/* Manual Deposit Address & Memo */}
                    <div
                      style={{
                        borderRadius: 18,
                        padding: "14px 16px",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                      }}
                    >
                      <div style={{ color: "#fff", fontSize: 13, fontWeight: 800, marginBottom: 10 }}>
                        {t.depositManual}
                      </div>

                      {/* Address */}
                      <div style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                        {t.depositAddress}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: "rgba(0, 0, 0, 0.3)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          marginBottom: 10,
                        }}
                      >
                        <span style={{ color: "#38bdf8", fontSize: 11, fontFamily: "monospace" }}>
                          {maskWallet(depositWallet)}
                        </span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => setShowQrModal(true)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 8,
                              border: "1px solid rgba(0, 242, 254, 0.3)",
                              background: "rgba(0, 242, 254, 0.1)",
                              color: "#00f2fe",
                              fontSize: 10,
                              fontWeight: 800,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 3,
                            }}
                          >
                            <QrCode size={11} /> QR
                          </button>
                          <button
                            onClick={copyDepositAddress}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 8,
                              border: "1px solid rgba(52, 211, 153, 0.3)",
                              background: "rgba(52, 211, 153, 0.1)",
                              color: copiedDepAddress ? "#34d399" : "#a7f3d0",
                              fontSize: 10,
                              fontWeight: 800,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 3,
                            }}
                          >
                            {copiedDepAddress ? <Check size={11} /> : <Copy size={11} />}
                          </button>
                        </div>
                      </div>

                      {/* Memo Warning */}
                      <div
                        style={{
                          borderRadius: 12,
                          padding: "10px 12px",
                          background: "rgba(251, 191, 36, 0.10)",
                          border: "1px solid rgba(251, 191, 36, 0.30)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 900 }}>
                            {t.depositMemo}: <code>{user?.id}</code>
                          </span>
                          <button
                            onClick={copyUserId}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#fbbf24",
                              fontSize: 10,
                              fontWeight: 800,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 3,
                            }}
                          >
                            <Copy size={10} /> {copiedId ? t.copied : t.copyId}
                          </button>
                        </div>
                        <div style={{ color: "rgba(251, 191, 36, 0.8)", fontSize: 10, lineHeight: 1.5 }}>
                          {t.memoNotice}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── HISTORY SUB-TAB ──────────────────────────────── */}
                {walletTab === "history" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {historyLoading ? (
                      <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(255, 255, 255, 0.4)" }}>
                        <Loader2 size={20} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />
                        {t.processing}...
                      </div>
                    ) : withdrawals.length === 0 && deposits.length === 0 ? (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "28px 16px",
                          background: "rgba(255, 255, 255, 0.02)",
                          borderRadius: 16,
                          border: "1px solid rgba(255, 255, 255, 0.06)",
                          color: "rgba(255, 255, 255, 0.35)",
                          fontSize: 13,
                        }}
                      >
                        {t.noHistory}
                      </div>
                    ) : (
                      <>
                        {withdrawals.map((w) => (
                          <div
                            key={w.id}
                            style={{
                              padding: "12px 14px",
                              borderRadius: 16,
                              background: "rgba(255, 255, 255, 0.04)",
                              border: "1px solid rgba(255, 255, 255, 0.07)",
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <TonLogo size={28} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>
                                -{parseFloat(w.amount).toFixed(4)} TON
                              </div>
                              <div
                                style={{
                                  color: "rgba(255, 255, 255, 0.3)",
                                  fontSize: 10,
                                  marginTop: 2,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {maskWallet(w.walletAddress)}
                              </div>
                            </div>
                            <div
                              style={{
                                padding: "4px 8px",
                                borderRadius: 8,
                                background: "rgba(255, 255, 255, 0.05)",
                                border: `1px solid ${statusColor(w.status)}40`,
                                color: statusColor(w.status),
                                fontSize: 10,
                                fontWeight: 800,
                              }}
                            >
                              {statusLabel(w.status)}
                            </div>
                          </div>
                        ))}

                        {deposits.map((d) => (
                          <div
                            key={"dep-" + d.id}
                            style={{
                              padding: "12px 14px",
                              borderRadius: 16,
                              background: "rgba(16, 185, 129, 0.05)",
                              border: "1px solid rgba(16, 185, 129, 0.15)",
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: "rgba(16, 185, 129, 0.2)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Download size={14} color="#34d399" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: "#34d399", fontWeight: 800, fontSize: 13 }}>
                                +{parseFloat(d.amount).toFixed(4)} TON
                              </div>
                              <div style={{ color: "rgba(255, 255, 255, 0.3)", fontSize: 10, marginTop: 2 }}>
                                {t.deposit}
                              </div>
                            </div>
                            <div
                              style={{
                                padding: "4px 8px",
                                borderRadius: 8,
                                background: "rgba(16, 185, 129, 0.1)",
                                border: `1px solid ${statusColor(d.status)}40`,
                                color: statusColor(d.status),
                                fontSize: 10,
                                fontWeight: 800,
                              }}
                            >
                              {statusLabel(d.status)}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 2: SWAP (GRAM -> GO)
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "swap" && (
          <div className="tab-fade" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Header Description */}
            <div
              style={{
                borderRadius: 16,
                padding: "12px 14px",
                background: "rgba(251, 191, 36, 0.08)",
                border: "1px solid rgba(251, 191, 36, 0.2)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Zap size={20} color="#fbbf24" style={{ flexShrink: 0 }} />
              <div style={{ color: "#fef3c7", fontSize: 12, lineHeight: 1.5 }}>
                {t.swapSubtitle}
              </div>
            </div>

            {/* Swap Card */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.09)",
                borderRadius: 20,
                overflow: "hidden",
              }}
            >
              {/* You Pay (GRAM) */}
              <div style={{ padding: "16px 16px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 11, fontWeight: 700 }}>
                    {t.youPay} (GRAM)
                  </span>
                  <span
                    style={{
                      background: "rgba(251, 191, 36, 0.15)",
                      border: "1px solid rgba(251, 191, 36, 0.28)",
                      borderRadius: 8,
                      padding: "2px 8px",
                      color: "#fbbf24",
                      fontSize: 10,
                      fontWeight: 800,
                    }}
                  >
                    {t.yourBalance}: {gramBalance.toFixed(4)}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    className="no-spinner"
                    type="number"
                    value={swapGramAmount}
                    onChange={(e) => setSwapGramAmount(e.target.value)}
                    placeholder="0.00"
                    step="any"
                    min="0.0001"
                    disabled={swapping}
                    style={{
                      flex: 1,
                      background: "none",
                      border: "none",
                      outline: "none",
                      color: parseFloat(swapGramAmount) > 0 ? "#fff" : "rgba(255, 255, 255, 0.25)",
                      fontSize: 28,
                      fontWeight: 900,
                      fontFamily: "inherit",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      background: "rgba(251, 191, 36, 0.12)",
                      border: "1px solid rgba(251, 191, 36, 0.25)",
                      borderRadius: 12,
                      padding: "6px 10px",
                    }}
                  >
                    <GramLogo size={20} />
                    <span style={{ color: "#fbbf24", fontWeight: 800, fontSize: 13 }}>GRAM</span>
                  </div>
                </div>
              </div>

              {/* Arrow Divider */}
              <div style={{ position: "relative", height: 1, background: "rgba(255, 255, 255, 0.07)", margin: "0 16px" }}>
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #fbbf24, #d97706)",
                    border: "2px solid #060a1c",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 0 14px rgba(251, 191, 36, 0.5)",
                    zIndex: 1,
                  }}
                >
                  <ArrowDownUp size={14} color="#080c1a" />
                </div>
              </div>

              {/* You Receive (GO) */}
              <div style={{ padding: "14px 16px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 11, fontWeight: 700 }}>
                    {t.youReceive} (GO)
                  </span>
                  <span style={{ color: "rgba(192, 132, 252, 0.8)", fontSize: 10, fontWeight: 700 }}>
                    1 GRAM = {gramRate} GO
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      flex: 1,
                      color: parseFloat(swapGramAmount) > 0 ? "#c084fc" : "rgba(255, 255, 255, 0.25)",
                      fontSize: 28,
                      fontWeight: 900,
                    }}
                  >
                    {parseFloat(swapGramAmount) > 0 ? (parseFloat(swapGramAmount) * gramRate).toFixed(2) : "0.00"}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      background: "rgba(168, 85, 247, 0.15)",
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      borderRadius: 12,
                      padding: "6px 10px",
                    }}
                  >
                    <GoLogo size={20} />
                    <span style={{ color: "#c084fc", fontWeight: 800, fontSize: 13 }}>GO</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Presets */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {[0.25, 0.5, 0.75, 1.0].map((pct, i) => {
                const isMax = i === 3;
                const calcVal = gramBalance * pct;
                const disabled = gramBalance <= 0 || swapping;
                return (
                  <button
                    key={pct}
                    type="button"
                    disabled={disabled}
                    onClick={() => setSwapGramAmount(calcVal.toFixed(4))}
                    style={{
                      padding: "9px 4px",
                      borderRadius: 12,
                      fontFamily: "inherit",
                      background: isMax ? "rgba(251, 191, 36, 0.18)" : "rgba(255, 255, 255, 0.05)",
                      border: isMax
                        ? "1px solid rgba(251, 191, 36, 0.45)"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                      color: isMax ? "#fbbf24" : "rgba(255, 255, 255, 0.6)",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.35 : 1,
                    }}
                  >
                    {isMax ? t.all : `${pct * 100}%`}
                  </button>
                );
              })}
            </div>

            {/* Messages */}
            {swapSuccess && swapResult && (
              <div
                style={{
                  borderRadius: 14,
                  padding: "12px 14px",
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid rgba(16, 185, 129, 0.35)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <CheckCircle size={20} color="#34d399" />
                <div>
                  <div style={{ color: "#34d399", fontSize: 13, fontWeight: 800 }}>{t.swapSuccess}</div>
                  <div style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 11, marginTop: 2 }}>
                    +{swapResult.goAmount} GO tokens added to mining power!
                  </div>
                </div>
              </div>
            )}

            {swapError && (
              <div
                style={{
                  borderRadius: 12,
                  padding: "10px 14px",
                  background: "rgba(248, 113, 113, 0.10)",
                  border: "1px solid rgba(248, 113, 113, 0.3)",
                  color: "#fca5a5",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {swapError}
              </div>
            )}

            {/* Swap CTA */}
            <button
              onClick={handleSwapGramToGo}
              disabled={swapping || gramBalance <= 0 || parseFloat(swapGramAmount) <= 0}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: 16,
                border: "none",
                background:
                  gramBalance > 0 && parseFloat(swapGramAmount) > 0
                    ? "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)"
                    : "rgba(255, 255, 255, 0.06)",
                color: gramBalance > 0 && parseFloat(swapGramAmount) > 0 ? "#080c1a" : "rgba(255, 255, 255, 0.3)",
                fontSize: 15,
                fontWeight: 900,
                cursor: gramBalance > 0 && parseFloat(swapGramAmount) > 0 && !swapping ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow:
                  gramBalance > 0 && parseFloat(swapGramAmount) > 0
                    ? "0 6px 24px rgba(251, 191, 36, 0.45)"
                    : "none",
              }}
            >
              {swapping ? (
                <>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> {t.swapping}
                </>
              ) : (
                <>
                  <ArrowDownUp size={16} /> {t.swapGramToGo}
                </>
              )}
            </button>

            {/* Hint Notice */}
            <div
              style={{
                borderRadius: 14,
                padding: "10px 14px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                color: "rgba(255, 255, 255, 0.4)",
                fontSize: 11,
                lineHeight: 1.6,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Info size={14} color="#c084fc" style={{ flexShrink: 0 }} />
              <span>{t.swapBoostNotice}</span>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 3: SETTINGS (Languages & Bot Info)
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "settings" && (
          <div className="tab-fade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Language Selection Card */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.09)",
                borderRadius: 20,
                padding: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Globe size={16} color="#00f2fe" />
                <span style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>{t.botLanguage}</span>
              </div>
              <div style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 11, marginBottom: 14 }}>
                {t.selectLanguage}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* 1. English (Default) */}
                <button
                  onClick={() => setLanguage("en")}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    border:
                      language === "en"
                        ? "1.5px solid #00f2fe"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                    background:
                      language === "en"
                        ? "linear-gradient(135deg, rgba(0, 242, 254, 0.15), rgba(0, 152, 234, 0.25))"
                        : "rgba(255, 255, 255, 0.03)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    boxShadow: language === "en" ? "0 4px 18px rgba(0, 242, 254, 0.25)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>🇬🇧</span>
                    <div style={{ textAlign: isRtl ? "right" : "left" }}>
                      <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>English</div>
                      <div style={{ color: "rgba(0, 242, 254, 0.8)", fontSize: 10, fontWeight: 700 }}>
                        {t.defaultBadge} (Primary)
                      </div>
                    </div>
                  </div>
                  {language === "en" && (
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "#00f2fe",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#080c1a",
                      }}
                    >
                      <Check size={14} strokeWidth={3} />
                    </div>
                  )}
                </button>

                {/* 2. Arabic */}
                <button
                  onClick={() => setLanguage("ar")}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    border:
                      language === "ar"
                        ? "1.5px solid #00f2fe"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                    background:
                      language === "ar"
                        ? "linear-gradient(135deg, rgba(0, 242, 254, 0.15), rgba(0, 152, 234, 0.25))"
                        : "rgba(255, 255, 255, 0.03)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    boxShadow: language === "ar" ? "0 4px 18px rgba(0, 242, 254, 0.25)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>🇸🇦</span>
                    <div style={{ textAlign: isRtl ? "right" : "left" }}>
                      <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>العربية (Arabic)</div>
                      <div style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 10 }}>اللغة العربية</div>
                    </div>
                  </div>
                  {language === "ar" && (
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "#00f2fe",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#080c1a",
                      }}
                    >
                      <Check size={14} strokeWidth={3} />
                    </div>
                  )}
                </button>

                {/* 3. Russian */}
                <button
                  onClick={() => setLanguage("ru")}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    border:
                      language === "ru"
                        ? "1.5px solid #00f2fe"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                    background:
                      language === "ru"
                        ? "linear-gradient(135deg, rgba(0, 242, 254, 0.15), rgba(0, 152, 234, 0.25))"
                        : "rgba(255, 255, 255, 0.03)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    boxShadow: language === "ru" ? "0 4px 18px rgba(0, 242, 254, 0.25)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>🇷🇺</span>
                    <div style={{ textAlign: isRtl ? "right" : "left" }}>
                      <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>Русский (Russian)</div>
                      <div style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 10 }}>Русский язык</div>
                    </div>
                  </div>
                  {language === "ru" && (
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "#00f2fe",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#080c1a",
                      }}
                    >
                      <Check size={14} strokeWidth={3} />
                    </div>
                  )}
                </button>
              </div>
            </div>

            {/* Support & Bot Info Card */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.09)",
                borderRadius: 20,
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={16} color="#c084fc" />
                <span style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>{t.botInfo}</span>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <a
                  href="https://t.me/GramGoSupport"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 14,
                    background: "rgba(168, 85, 247, 0.12)",
                    border: "1px solid rgba(168, 85, 247, 0.35)",
                    color: "#c084fc",
                    fontSize: 12,
                    fontWeight: 800,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Headphones size={14} /> {t.contactSupport}
                </a>

                <a
                  href="https://t.me/GramGoCommunity"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 14,
                    background: "rgba(0, 242, 254, 0.12)",
                    border: "1px solid rgba(0, 242, 254, 0.35)",
                    color: "#00f2fe",
                    fontSize: 12,
                    fontWeight: 800,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <ExternalLink size={14} /> {t.officialChannel}
                </a>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: 8,
                  borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                  color: "rgba(255, 255, 255, 0.35)",
                  fontSize: 11,
                }}
              >
                <span>GRAM GO Application</span>
                <span>{t.appVersion}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          QR CODE MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {showQrModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(12px)",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 320,
              background: "#0d152c",
              border: "1px solid rgba(0,242,254,0.30)",
              borderRadius: 24,
              padding: 24,
              textAlign: "center",
              position: "relative",
            }}
          >
            <button
              onClick={() => setShowQrModal(false)}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                background: "rgba(255,255,255,0.1)",
                border: "none",
                borderRadius: "50%",
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>

            <h4 style={{ color: "#fff", fontSize: 16, fontWeight: 900, margin: "0 0 14px" }}>
              {t.depositTitle}
            </h4>

            {/* QR Image */}
            <div
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: 16,
                display: "inline-block",
                marginBottom: 14,
              }}
            >
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                  `ton://transfer/${depositWallet}?text=user_${user?.id}`
                )}`}
                alt="QR Code"
                style={{ width: 180, height: 180, display: "block" }}
              />
            </div>

            <div style={{ color: "#38bdf8", fontSize: 11, fontFamily: "monospace", marginBottom: 12 }}>
              {maskWallet(depositWallet)}
            </div>

            <button
              onClick={copyDepositAddress}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #0098EA, #005fa3)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {copiedDepAddress ? t.addressCopied : t.copyAddress}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
