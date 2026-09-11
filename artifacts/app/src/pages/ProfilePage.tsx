import React, { useState, useEffect, useRef } from "react";
import { useUser } from "../lib/userContext";
import { useLanguage } from "../lib/i18nContext";
import {
  api,
  Withdrawal,
  Deposit,
  recordDeposit,
  getWithdrawalsOnce,
  getDepositsOnce,
  invalidateUserCaches,
} from "../lib/api";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import {
  Wallet,
  Send,
  Settings as SettingsIcon,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  CheckCircle,
  Loader2,
  Globe,
  Headphones,
  ExternalLink,
  QrCode,
  X,
  Sparkles,
  Download,
  ArrowDownUp,
} from "lucide-react";
import { useLocation } from "wouter";
import SwapModal from "../components/SwapModal";

const MIN_WITHDRAWAL = 0.2;

function maskWallet(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return addr.slice(0, 4) + " . . . " + addr.slice(-4);
}

function formatTxTime(dStr: string | null | undefined) {
  if (!dStr) return "—";
  try {
    const d = new Date(dStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (isToday) return `Today, ${timeStr}`;
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;
  } catch {
    return dStr;
  }
}

export default function ProfilePage() {
  const { user, refresh } = useUser();
  const { t, language, setLanguage, isRtl } = useLanguage();
  const [, setLocation] = useLocation();

  // Current view inside Profile: "menu" | "wallet" | "settings"
  const [currentView, setCurrentView] = useState<"menu" | "wallet" | "settings">(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "wallet" || tabParam === "settings") {
        return tabParam;
      }
    } catch {
      // ignore
    }
    return "menu";
  });

  // Wallet mode: "deposit" | "withdraw"
  const [walletMode, setWalletMode] = useState<"deposit" | "withdraw">("deposit");

  // History tab: "deposits" | "withdrawals"
  const [historyTab, setHistoryTab] = useState<"deposits" | "withdrawals">("deposits");

  // TonConnect UI hook
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const prevAddressRef = useRef("");
  const [disconnecting, setDisconnecting] = useState(false);

  // Price & Config
  const [tonPrice, setTonPrice] = useState<number>(2.5);
  const [depositWallet, setDepositWallet] = useState<string>("UQD2_1mZ8p4Fk8_e2m8pWq98bWbV57YkXj5Xv_9Xb4vB2B_1");
  const [minDeposit, setMinDeposit] = useState<number>(0.1);
  const [gramRate, setGramRate] = useState<number>(800); // 1 GRAM = 800 GO

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
  const [depositAmount, setDepositAmount] = useState("0.00");
  const [depositing, setDepositing] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);
  const [depositError, setDepositError] = useState("");
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);

  // History state
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Disconnect Wallet Handler ──────────────────────────────────────────
  const handleDisconnectWallet = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (disconnecting || !user) return;
    setDisconnecting(true);
    try {
      try {
        await tonConnectUI.disconnect();
      } catch (tcErr) {
        console.warn("TON Connect disconnect error:", tcErr);
      }
      await api.saveWallet(user.id, null);
      invalidateUserCaches(user.id);
      await refresh();
    } catch (err) {
      console.error("Failed to disconnect wallet:", err);
    } finally {
      setDisconnecting(false);
    }
  };

  // ── Connect Wallet Handler ─────────────────────────────────────────────
  const handleConnectWallet = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await tonConnectUI.openModal();
    } catch (err) {
      console.error("Failed to open TON Connect modal:", err);
    }
  };

  // ── Auto-sync TON Wallet with account ──────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const prev = prevAddressRef.current;
    prevAddressRef.current = connectedAddress;
    if (connectedAddress && connectedAddress !== user.savedWalletAddress) {
      api.saveWallet(user.id, connectedAddress).then(() => refresh()).catch(() => {});
    } else if (!connectedAddress && prev && user.savedWalletAddress) {
      api.saveWallet(user.id, null).then(() => refresh()).catch(() => {});
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
      setWithdrawError(t.connectWalletPrompt || "Please connect your TON wallet first");
      return;
    }

    const amt = parseFloat(withdrawAmount);
    if (!withdrawAmount || isNaN(amt) || amt < MIN_WITHDRAWAL) {
      setWithdrawError(t.minWithdrawal || `Minimum withdrawal is ${MIN_WITHDRAWAL} TON`);
      return;
    }
    if (amt > tonBalance) {
      setWithdrawError(`${t.insufficientTon || "Insufficient TON balance"} (Available: ${tonBalance.toFixed(4)} TON)`);
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
      setDepositError(`Min ${minDeposit} TON`);
      return;
    }

    if (!connectedAddress) {
      tonConnectUI.openModal();
      return;
    }

    setDepositing(true);
    try {
      const nanoTon = BigInt(Math.round(amt * 1e9)).toString();
      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [
          {
            address: depositWallet,
            amount: nanoTon,
            payload: undefined,
          },
        ],
      });

      const res = await recordDeposit({
        userId: user.id,
        amount: String(amt),
        walletAddress: connectedAddress,
        boc: result.boc,
      });

      if (res.success && res.verified) {
        setDepositSuccess(true);
        setDepositAmount("0.00");
      } else if (res.pending) {
        setDepositError("⏳ المعاملة قيد التأكيد على شبكة TON. سيتم إضافة الرصيد فور تأكيدها.");
      } else {
        setDepositError(res.error || "فشل التحقق من معاملة الإيداع على شبكة TON");
      }

      invalidateUserCaches(user.id);
      await refresh();
      loadHistory();
      setTimeout(() => setDepositSuccess(false), 5000);
    } catch (err: unknown) {
      setDepositError(err instanceof Error ? err.message : t.depositFailed);
    } finally {
      setDepositing(false);
    }
  };


  // Display name & avatar initial (fully dynamic for each user)
  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    (user?.username ? `@${user.username}` : (user?.id ? `User #${user.id}` : "User"));
  const usernameDisplay = user?.username ? `@${user.username}` : null;
  const avatarInitial = (([user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "U")[0] || "U").toUpperCase();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#080911",
        color: "#ffffff",
        direction: isRtl ? "rtl" : "ltr",
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .page-fade { animation: fadeIn 0.22s ease forwards; }
        .no-spin::-webkit-inner-spin-button,
        .no-spin::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spin { -moz-appearance: textfield; }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════
          VIEW 1: MAIN PROFILE MENU (Screenshot 1 & 2)
      ══════════════════════════════════════════════════════════════════ */}
      {currentView === "menu" && (
        <div
          className="page-fade"
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch" as never,
            padding: "max(env(safe-area-inset-top, 0px), 24px) 18px 90px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Centered Avatar with Ring (Screenshot 2) */}
          <div style={{ position: "relative", marginBottom: 12 }}>
            <div
              style={{
                width: 86,
                height: 86,
                borderRadius: "50%",
                padding: 3,
                background: "linear-gradient(135deg, #7c3aed 0%, #3b82f6 50%, #f59e0b 100%)",
                boxShadow: "0 0 24px rgba(124, 58, 237, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {user?.photoUrl ? (
                <img
                  src={user.photoUrl}
                  alt="avatar"
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    objectFit: "cover",
                    background: "#121124",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #1e1b4b, #0f172a)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 32,
                    fontWeight: 900,
                    color: "#fff",
                  }}
                >
                  {avatarInitial}
                </div>
              )}
            </div>
          </div>

          {/* User Full Name with Emoji */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: "#ffffff", letterSpacing: -0.3 }}>
              {fullName}
            </span>
            <span style={{ fontSize: 20 }}>🧢</span>
          </div>

          {/* @Username in Purple (Only if user has a username) */}
          {usernameDisplay && (
            <div style={{ color: "#818cf8", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
              {usernameDisplay}
            </div>
          )}

          {/* User ID with Copy Icon (Dynamic from user.id) */}
          {user?.id && (
            <div
              onClick={copyUserId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "rgba(255, 255, 255, 0.5)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                marginBottom: 14,
              }}
            >
              <span>ID: {user.id}</span>
              <button
                style={{
                  background: "none",
                  border: "none",
                  color: copiedId ? "#34d399" : "rgba(255, 255, 255, 0.5)",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {copiedId ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          )}

          {/* Wallet Connection Status & Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28, flexWrap: "wrap", justifyContent: "center" }}>
            {isWalletConnected ? (
              <>
                <button
                  type="button"
                  onClick={() => setCurrentView("wallet")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 16px",
                    borderRadius: 24,
                    border: "1px solid rgba(34, 197, 94, 0.35)",
                    background: "rgba(34, 197, 94, 0.12)",
                    color: "#4ade80",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 9 }}>🟢</span> {maskWallet(savedWallet || "")}
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectWallet}
                  disabled={disconnecting}
                  title="Disconnect wallet"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "7px 14px",
                    borderRadius: 24,
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                    background: "rgba(239, 68, 68, 0.12)",
                    color: "#f87171",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: disconnecting ? "not-allowed" : "pointer",
                  }}
                >
                  {disconnecting ? (
                    <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <X size={12} strokeWidth={2.5} />
                  )}
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleConnectWallet}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "8px 20px",
                  borderRadius: 24,
                  border: "none",
                  background: "linear-gradient(135deg, #0098EA 0%, #0077c2 100%)",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(0, 152, 234, 0.4)",
                }}
              >
                <Wallet size={14} /> Connect Wallet
              </button>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════
              VERTICAL MENU CARDS LIST (Screenshot 1)
          ══════════════════════════════════════════════════════════════ */}
          <div style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 12 }}>
            {/* 1. Wallet Card */}
            <div
              onClick={() => setCurrentView("wallet")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px",
                borderRadius: 20,
                background: "rgba(18, 16, 32, 0.85)",
                border: "1px solid rgba(139, 92, 246, 0.16)",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background: "rgba(59, 130, 246, 0.18)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#38bdf8",
                  }}
                >
                  <Wallet size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>Wallet</div>
                  <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.45)", marginTop: 2 }}>
                    Manage connected wallets
                  </div>
                </div>
              </div>
              <ChevronRight size={18} color="rgba(255, 255, 255, 0.35)" />
            </div>

            {/* 2. Swap Card */}
            <div
              onClick={() => setIsSwapModalOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px",
                borderRadius: 20,
                background: "rgba(18, 16, 32, 0.85)",
                border: "1px solid rgba(0, 242, 254, 0.25)",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background: "rgba(0, 242, 254, 0.18)",
                    border: "1px solid rgba(0, 242, 254, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#00f2fe",
                  }}
                >
                  <ArrowDownUp size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>Swap Gram → GO</div>
                  <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.45)", marginTop: 2 }}>
                    1 Gram = {gramRate} GO (Boost Power)
                  </div>
                </div>
              </div>
              <ChevronRight size={18} color="rgba(255, 255, 255, 0.35)" />
            </div>

            {/* 3. Settings Card */}
            <div
              onClick={() => setCurrentView("settings")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px",
                borderRadius: 20,
                background: "rgba(18, 16, 32, 0.85)",
                border: "1px solid rgba(139, 92, 246, 0.16)",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background: "rgba(139, 92, 246, 0.18)",
                    border: "1px solid rgba(139, 92, 246, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#a78bfa",
                  }}
                >
                  <SettingsIcon size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>Settings</div>
                  <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.45)", marginTop: 2 }}>
                    App preferences
                  </div>
                </div>
              </div>
              <ChevronRight size={18} color="rgba(255, 255, 255, 0.35)" />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          VIEW 2: WALLET SUBPAGE
      ══════════════════════════════════════════════════════════════════ */}
      {currentView === "wallet" && (
        <div
          className="page-fade"
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch" as never,
            padding: "max(env(safe-area-inset-top, 0px), 16px) 16px 90px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* Header with Back Button */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
            <button
              onClick={() => setCurrentView("menu")}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: "rgba(49, 39, 74, 0.7)",
                border: "1px solid rgba(139, 92, 246, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                cursor: "pointer",
              }}
            >
              <ChevronLeft size={20} />
            </button>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#ffffff" }}>Wallet</div>
          </div>

          {/* Switcher Pills (Deposit vs Withdraw) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              background: "rgba(18, 16, 32, 0.9)",
              borderRadius: 18,
              padding: 4,
              border: "1px solid rgba(139, 92, 246, 0.16)",
            }}
          >
            <button
              type="button"
              onClick={() => setWalletMode("deposit")}
              style={{
                padding: "12px 0",
                borderRadius: 14,
                border: "none",
                cursor: "pointer",
                fontWeight: 900,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                background:
                  walletMode === "deposit"
                    ? "linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)"
                    : "transparent",
                color: walletMode === "deposit" ? "#ffffff" : "rgba(255, 255, 255, 0.45)",
                boxShadow: walletMode === "deposit" ? "0 4px 16px rgba(168, 85, 247, 0.4)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              <Download size={16} />
              Deposit
            </button>
            <button
              type="button"
              onClick={() => setWalletMode("withdraw")}
              style={{
                padding: "12px 0",
                borderRadius: 14,
                border: "none",
                cursor: "pointer",
                fontWeight: 900,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                background:
                  walletMode === "withdraw"
                    ? "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)"
                    : "transparent",
                color: walletMode === "withdraw" ? "#ffffff" : "rgba(255, 255, 255, 0.45)",
                boxShadow: walletMode === "withdraw" ? "0 4px 16px rgba(59, 130, 246, 0.4)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              <Send size={15} />
              Withdraw
            </button>
          </div>

          {/* ── DEPOSIT MODE CONTENT ───────────────────────────────── */}
          {walletMode === "deposit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Green Wallet Address Card */}
              <div
                style={{
                  borderRadius: 18,
                  padding: "16px 18px",
                  background: "rgba(5, 30, 20, 0.8)",
                  border: "1px solid rgba(34, 197, 94, 0.4)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ color: "rgba(134, 239, 172, 0.7)", fontSize: 12, fontWeight: 700 }}>
                  Wallet Address
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9 }}>🟢</span>
                    <span style={{ color: "#4ade80", fontSize: 14, fontWeight: 800, fontFamily: "monospace" }}>
                      {isWalletConnected ? maskWallet(savedWallet || "") : "Not Connected"}
                    </span>
                  </div>
                  {isWalletConnected ? (
                    <button
                      type="button"
                      onClick={handleDisconnectWallet}
                      disabled={disconnecting}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 8,
                        border: "1px solid rgba(239, 68, 68, 0.4)",
                        background: "rgba(239, 68, 68, 0.15)",
                        color: "#fca5a5",
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: disconnecting ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <X size={10} /> Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConnectWallet}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: "#22c55e",
                        color: "#052e16",
                        fontSize: 11,
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>

              {/* Amount Card */}
              <div
                style={{
                  borderRadius: 18,
                  padding: "18px",
                  background: "rgba(18, 16, 32, 0.9)",
                  border: "1px solid rgba(139, 92, 246, 0.16)",
                }}
              >
                <div
                  style={{
                    color: "rgba(255, 255, 255, 0.45)",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  AMOUNT
                </div>
                <input
                  className="no-spin"
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.1"
                  min="0.1"
                  style={{
                    width: "100%",
                    background: "none",
                    border: "none",
                    outline: "none",
                    color: "#ffffff",
                    fontSize: 32,
                    fontWeight: 900,
                    fontFamily: "inherit",
                    marginBottom: 6,
                  }}
                />
                <div style={{ color: "#a78bfa", fontSize: 12, fontWeight: 700 }}>
                  Min 0.1 TON
                </div>
              </div>

              {/* Presets */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {["0.5", "1.0", "2.0", "5.0"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDepositAmount(v)}
                    style={{
                      padding: "10px 0",
                      borderRadius: 12,
                      border: "1px solid rgba(139, 92, 246, 0.2)",
                      background: depositAmount === v ? "rgba(168, 85, 247, 0.25)" : "rgba(18, 16, 32, 0.8)",
                      color: depositAmount === v ? "#c084fc" : "rgba(255, 255, 255, 0.6)",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    +{v}
                  </button>
                ))}
              </div>

              {depositSuccess && (
                <div
                  style={{
                    borderRadius: 14,
                    padding: "12px 14px",
                    background: "rgba(34, 197, 94, 0.15)",
                    border: "1px solid rgba(34, 197, 94, 0.4)",
                    color: "#4ade80",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  ✅ Deposit confirmed & added to TON Balance successfully!
                </div>
              )}

              {depositError && (
                <div
                  style={{
                    borderRadius: 14,
                    padding: "12px 14px",
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#f87171",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {depositError}
                </div>
              )}

              {/* Big Purple Deposit Button */}
              <button
                type="button"
                onClick={handleDepositViaTonConnect}
                disabled={depositing}
                style={{
                  width: "100%",
                  padding: "18px",
                  borderRadius: 18,
                  border: "none",
                  background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
                  color: "#ffffff",
                  fontSize: 16,
                  fontWeight: 900,
                  cursor: depositing ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: "0 8px 28px rgba(124, 58, 237, 0.45)",
                }}
              >
                {depositing ? (
                  <>
                    <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Processing...
                  </>
                ) : (
                  "Deposit"
                )}
              </button>
            </div>
          )}

          {/* ── WITHDRAW MODE CONTENT ──────────────────────────────── */}
          {walletMode === "withdraw" && (
            <form onSubmit={handleWithdraw} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Destination Card */}
              <div
                style={{
                  borderRadius: 18,
                  padding: "16px 18px",
                  background: "rgba(18, 16, 32, 0.9)",
                  border: "1px solid rgba(139, 92, 246, 0.16)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: 11, fontWeight: 700 }}>
                    Destination Wallet
                  </div>
                  <div style={{ color: "#ffffff", fontSize: 13, fontWeight: 800, fontFamily: "monospace", marginTop: 2 }}>
                    {isWalletConnected ? maskWallet(savedWallet || "") : "Connect wallet first"}
                  </div>
                </div>
                {isWalletConnected ? (
                  <button
                    type="button"
                    onClick={handleDisconnectWallet}
                    disabled={disconnecting}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(239, 68, 68, 0.35)",
                      background: "rgba(239, 68, 68, 0.12)",
                      color: "#f87171",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: disconnecting ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <X size={11} /> Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectWallet}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: "#3b82f6",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Connect
                  </button>
                )}
              </div>

              {/* Amount Card */}
              <div
                style={{
                  borderRadius: 18,
                  padding: "18px",
                  background: "rgba(18, 16, 32, 0.9)",
                  border: "1px solid rgba(139, 92, 246, 0.16)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                    AMOUNT
                  </span>
                  <span style={{ color: "#38bdf8", fontSize: 11, fontWeight: 800 }}>
                    Available: {tonBalance.toFixed(4)} TON
                  </span>
                </div>
                <input
                  className="no-spin"
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.20"
                  step="any"
                  style={{
                    width: "100%",
                    background: "none",
                    border: "none",
                    outline: "none",
                    color: "#ffffff",
                    fontSize: 32,
                    fontWeight: 900,
                    fontFamily: "inherit",
                    marginBottom: 6,
                  }}
                />
                <div style={{ color: "#a78bfa", fontSize: 12, fontWeight: 700 }}>
                  Min 0.2 TON
                </div>
              </div>

              {/* Presets */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {[0.2, 0.5, 1.0, tonBalance].map((p, i) => {
                  const isMax = i === 3;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={withdrawing}
                      onClick={() => setWithdrawAmount(isMax ? (tonBalance > 0 ? tonBalance.toFixed(4) : "0.20") : p.toFixed(1))}
                      style={{
                        padding: "10px 0",
                        borderRadius: 12,
                        border: "1px solid rgba(59, 130, 246, 0.25)",
                        background: "rgba(18, 16, 32, 0.8)",
                        color: isMax ? "#38bdf8" : "rgba(255, 255, 255, 0.8)",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: withdrawing ? "not-allowed" : "pointer",
                        opacity: withdrawing ? 0.35 : 1,
                      }}
                    >
                      {isMax ? "MAX" : p}
                    </button>
                  );
                })}
              </div>

              {withdrawSuccess && (
                <div
                  style={{
                    borderRadius: 14,
                    padding: "12px 14px",
                    background: "rgba(34, 197, 94, 0.15)",
                    border: "1px solid rgba(34, 197, 94, 0.4)",
                    color: "#4ade80",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  ✅ Withdrawal request submitted successfully!
                </div>
              )}

              {withdrawError && (
                <div
                  style={{
                    borderRadius: 14,
                    padding: "12px 14px",
                    background: "rgba(239, 68, 68, 0.18)",
                    border: "1px solid rgba(239, 68, 68, 0.5)",
                    color: "#fca5a5",
                    fontSize: 13,
                    fontWeight: 700,
                    lineHeight: 1.4,
                  }}
                >
                  ⚠️ {withdrawError}
                </div>
              )}

              {/* Big Blue Withdraw Button */}
              <button
                type="submit"
                disabled={withdrawing}
                style={{
                  width: "100%",
                  padding: "18px",
                  borderRadius: 18,
                  border: "none",
                  background: withdrawing
                    ? "rgba(255, 255, 255, 0.12)"
                    : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                  color: "#ffffff",
                  fontSize: 16,
                  fontWeight: 900,
                  cursor: withdrawing ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: "0 8px 28px rgba(37, 99, 235, 0.45)",
                  transition: "all 0.2s ease",
                }}
              >
                {withdrawing ? (
                  <>
                    <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Submitting...
                  </>
                ) : (
                  "Withdraw TON"
                )}
              </button>
            </form>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TRANSACTION HISTORY SECTION WITH SUB-TABS
          ══════════════════════════════════════════════════════════════ */}
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Sub-tabs [ Deposits ] [ Withdrawals ] */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                background: "rgba(18, 16, 32, 0.9)",
                borderRadius: 14,
                padding: 3,
                border: "1px solid rgba(139, 92, 246, 0.16)",
              }}
            >
              <button
                type="button"
                onClick={() => setHistoryTab("deposits")}
                style={{
                  padding: "9px 0",
                  borderRadius: 11,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background:
                    historyTab === "deposits"
                      ? "linear-gradient(135deg, rgba(168, 85, 247, 0.35), rgba(126, 34, 206, 0.35))"
                      : "transparent",
                  color: historyTab === "deposits" ? "#c084fc" : "rgba(255, 255, 255, 0.45)",
                  borderBottom: historyTab === "deposits" ? "2px solid #a855f7" : "none",
                  transition: "all 0.2s ease",
                }}
              >
                <Download size={13} />
                Deposits
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab("withdrawals")}
                style={{
                  padding: "9px 0",
                  borderRadius: 11,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background:
                    historyTab === "withdrawals"
                      ? "linear-gradient(135deg, rgba(59, 130, 246, 0.35), rgba(29, 78, 216, 0.35))"
                      : "transparent",
                  color: historyTab === "withdrawals" ? "#60a5fa" : "rgba(255, 255, 255, 0.45)",
                  borderBottom: historyTab === "withdrawals" ? "2px solid #3b82f6" : "none",
                  transition: "all 0.2s ease",
                }}
              >
                <Send size={12} />
                Withdrawals
              </button>
            </div>

            {/* History List Content */}
            {historyLoading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "30px 0",
                  color: "rgba(255, 255, 255, 0.3)",
                  fontSize: 13,
                }}
              >
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                Loading history...
              </div>
            ) : historyTab === "deposits" ? (
              deposits.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    background: "rgba(18, 16, 32, 0.6)",
                    borderRadius: 18,
                    border: "1px solid rgba(139, 92, 246, 0.12)",
                  }}
                >
                  <Download size={28} color="rgba(255, 255, 255, 0.2)" style={{ margin: "0 auto 8px" }} />
                  <div style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: 13, fontWeight: 700 }}>
                    No deposits yet
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {deposits.map((dep) => {
                    const st = dep.status?.toLowerCase();
                    const isConfirmed = st === "confirmed";
                    const isFailed = st === "failed" || st === "cancelled" || st === "expired";
                    const statusText = isConfirmed ? "🟢 Confirmed" : isFailed ? "🔴 Failed" : "🟡 Pending";
                    const badgeBg = isConfirmed
                      ? "rgba(34, 197, 94, 0.15)"
                      : isFailed
                      ? "rgba(239, 68, 68, 0.15)"
                      : "rgba(234, 179, 8, 0.15)";
                    const badgeBorder = isConfirmed
                      ? "rgba(34, 197, 94, 0.35)"
                      : isFailed
                      ? "rgba(239, 68, 68, 0.35)"
                      : "rgba(234, 179, 8, 0.35)";
                    const badgeColor = isConfirmed ? "#4ade80" : isFailed ? "#f87171" : "#facc15";

                    return (
                      <div
                        key={dep.id}
                        style={{
                          borderRadius: 16,
                          padding: "13px 15px",
                          background: "rgba(18, 16, 32, 0.85)",
                          border: "1px solid rgba(139, 92, 246, 0.14)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ color: "#4ade80", fontWeight: 900, fontSize: 15 }}>
                            +{parseFloat(dep.amount).toFixed(2)} TON
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              padding: "3px 8px",
                              borderRadius: 8,
                              background: badgeBg,
                              border: `1px solid ${badgeBorder}`,
                              color: badgeColor,
                            }}
                          >
                            {statusText}
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            color: "rgba(255, 255, 255, 0.4)",
                            fontSize: 11,
                          }}
                        >
                          <span style={{ fontFamily: "monospace" }}>
                            TX: {dep.txHash ? maskWallet(dep.txHash) : "—"}
                          </span>
                          <span>{formatTxTime(dep.confirmedAt || dep.createdAt)}</span>
                        </div>
                        {isFailed && dep.reason && (
                          <div style={{ color: "#f87171", fontSize: 10, marginTop: 2 }}>
                            {dep.reason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              withdrawals.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    background: "rgba(18, 16, 32, 0.6)",
                    borderRadius: 18,
                    border: "1px solid rgba(139, 92, 246, 0.12)",
                  }}
                >
                  <Send size={28} color="rgba(255, 255, 255, 0.2)" style={{ margin: "0 auto 8px" }} />
                  <div style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: 13, fontWeight: 700 }}>
                    No withdrawals yet
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {withdrawals.map((w) => {
                    const st = w.status?.toLowerCase();
                    const isApproved = st === "approved" || st === "completed";
                    const isRejected = st === "rejected" || st === "failed";
                    const statusText = isApproved ? "🟢 Completed" : isRejected ? "🔴 Rejected" : "🟡 Pending";
                    const badgeBg = isApproved
                      ? "rgba(34, 197, 94, 0.15)"
                      : isRejected
                      ? "rgba(239, 68, 68, 0.15)"
                      : "rgba(234, 179, 8, 0.15)";
                    const badgeBorder = isApproved
                      ? "rgba(34, 197, 94, 0.35)"
                      : isRejected
                      ? "rgba(239, 68, 68, 0.35)"
                      : "rgba(234, 179, 8, 0.35)";
                    const badgeColor = isApproved ? "#4ade80" : isRejected ? "#f87171" : "#facc15";

                    const errorMsg = (w as any).errorMsg || (w as any).reason;

                    return (
                      <div
                        key={w.id}
                        style={{
                          borderRadius: 16,
                          padding: "13px 15px",
                          background: "rgba(18, 16, 32, 0.85)",
                          border: "1px solid rgba(139, 92, 246, 0.14)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ color: "#ffffff", fontWeight: 900, fontSize: 15 }}>
                            -{parseFloat(w.amount).toFixed(2)} TON
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              padding: "3px 8px",
                              borderRadius: 8,
                              background: badgeBg,
                              border: `1px solid ${badgeBorder}`,
                              color: badgeColor,
                            }}
                          >
                            {statusText}
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            color: "rgba(255, 255, 255, 0.4)",
                            fontSize: 11,
                          }}
                        >
                          <span style={{ fontFamily: "monospace" }}>
                            Wallet: {maskWallet(w.walletAddress)}
                          </span>
                          <span>{formatTxTime(w.createdAt)}</span>
                        </div>
                        {isRejected && errorMsg && (
                          <div style={{ color: "#f87171", fontSize: 10, marginTop: 2 }}>
                            السبب: {errorMsg}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      )}



      {/* ══════════════════════════════════════════════════════════════════
          VIEW 4: SETTINGS SUBPAGE
      ══════════════════════════════════════════════════════════════════ */}
      {currentView === "settings" && (
        <div
          className="page-fade"
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch" as never,
            padding: "max(env(safe-area-inset-top, 0px), 16px) 16px 90px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            <button
              onClick={() => setCurrentView("menu")}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: "rgba(49, 39, 74, 0.7)",
                border: "1px solid rgba(139, 92, 246, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                cursor: "pointer",
              }}
            >
              <ChevronLeft size={20} />
            </button>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#ffffff" }}>Settings</div>
          </div>

          {/* Languages Section */}
          <div
            style={{
              background: "rgba(18, 16, 32, 0.9)",
              border: "1px solid rgba(139, 92, 246, 0.16)",
              borderRadius: 20,
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: "#ffffff", marginBottom: 4 }}>
              Bot Language
            </div>

            {/* 1. English */}
            <button
              onClick={() => setLanguage("en")}
              style={{
                padding: "14px 16px",
                borderRadius: 14,
                border: language === "en" ? "1.5px solid #8b5cf6" : "1px solid rgba(255, 255, 255, 0.08)",
                background: language === "en" ? "rgba(139, 92, 246, 0.18)" : "rgba(255, 255, 255, 0.03)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>🇬🇧</span>
                <div style={{ textAlign: "left" }}>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>English</div>
                  <div style={{ color: "#a78bfa", fontSize: 10, fontWeight: 700 }}>Default Primary</div>
                </div>
              </div>
              {language === "en" && <Check size={16} color="#c084fc" strokeWidth={3} />}
            </button>

            {/* 2. Arabic */}
            <button
              onClick={() => setLanguage("ar")}
              style={{
                padding: "14px 16px",
                borderRadius: 14,
                border: language === "ar" ? "1.5px solid #8b5cf6" : "1px solid rgba(255, 255, 255, 0.08)",
                background: language === "ar" ? "rgba(139, 92, 246, 0.18)" : "rgba(255, 255, 255, 0.03)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>🇸🇦</span>
                <div style={{ textAlign: "left" }}>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>العربية (Arabic)</div>
                  <div style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 10 }}>اللغة العربية</div>
                </div>
              </div>
              {language === "ar" && <Check size={16} color="#c084fc" strokeWidth={3} />}
            </button>

            {/* 3. Russian */}
            <button
              onClick={() => setLanguage("ru")}
              style={{
                padding: "14px 16px",
                borderRadius: 14,
                border: language === "ru" ? "1.5px solid #8b5cf6" : "1px solid rgba(255, 255, 255, 0.08)",
                background: language === "ru" ? "rgba(139, 92, 246, 0.18)" : "rgba(255, 255, 255, 0.03)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>🇷🇺</span>
                <div style={{ textAlign: "left" }}>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>Русский (Russian)</div>
                  <div style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 10 }}>Русский язык</div>
                </div>
              </div>
              {language === "ru" && <Check size={16} color="#c084fc" strokeWidth={3} />}
            </button>
          </div>

          {/* Support Info */}
          <div
            style={{
              background: "rgba(18, 16, 32, 0.9)",
              border: "1px solid rgba(139, 92, 246, 0.16)",
              borderRadius: 20,
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: "#ffffff" }}>Support & Info</div>
            <a
              href="https://t.me/GramGoSupport"
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "12px",
                borderRadius: 14,
                background: "rgba(139, 92, 246, 0.14)",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                color: "#c084fc",
                fontSize: 13,
                fontWeight: 800,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Headphones size={15} /> Contact Support
            </a>
          </div>
        </div>
      )}




      {/* ── Swap Modal ──────────────────────────────────────────────── */}
      <SwapModal
        isOpen={isSwapModalOpen}
        onClose={() => setIsSwapModalOpen(false)}
        onSuccess={() => {
          if (user?.id) invalidateUserCaches(user.id);
          refresh();
        }}
      />
    </div>
  );
}
