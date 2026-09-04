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
  Wallet,
  Send,
  ArrowDownUp,
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
} from "lucide-react";
import { useLocation } from "wouter";

const MIN_WITHDRAWAL = 0.1;

function maskWallet(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return addr.slice(0, 4) + " . . . " + addr.slice(-4);
}

export default function ProfilePage() {
  const { user, refresh } = useUser();
  const { t, language, setLanguage, isRtl } = useLanguage();
  const [, setLocation] = useLocation();

  // Current view inside Profile: "menu" | "wallet" | "swap" | "settings"
  const [currentView, setCurrentView] = useState<"menu" | "wallet" | "swap" | "settings">(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "wallet" || tabParam === "swap" || tabParam === "settings") {
        return tabParam;
      }
    } catch {
      // ignore
    }
    return "menu";
  });

  // Wallet mode: "deposit" | "withdraw"
  const [walletMode, setWalletMode] = useState<"deposit" | "withdraw">("deposit");

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
      setWithdrawError(t.connectWalletPrompt);
      return;
    }

    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < MIN_WITHDRAWAL) {
      setWithdrawError(`Min ${MIN_WITHDRAWAL} TON`);
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
      setDepositError(`Min ${minDeposit} GRAM`);
      return;
    }

    if (!connectedAddress) {
      tonConnectUI.openModal();
      return;
    }

    setDepositing(true);
    try {
      const nanoTon = BigInt(Math.floor(amt * 1e9)).toString();
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

      await recordDeposit({
        userId: user.id,
        amount: String(amt),
        walletAddress: connectedAddress,
        txHash: result.boc ? "tc_boc_" + Date.now() : undefined,
      }).catch(() => {});

      invalidateUserCaches(user.id);
      setDepositSuccess(true);
      setDepositAmount("0.00");
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

            {/* 3. Swap Card */}
            <div
              onClick={() => setCurrentView("swap")}
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
                  <ArrowDownUp size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>Swap</div>
                  <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.45)", marginTop: 2 }}>
                    Convert GRAM to GO
                  </div>
                </div>
              </div>
              <ChevronRight size={18} color="rgba(255, 255, 255, 0.35)" />
            </div>

            {/* 4. Settings Card */}
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
          VIEW 2: WALLET SUBPAGE (Screenshot 3)
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
          {/* Header with Back Button (Screenshot 3) */}
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
            <div style={{ fontSize: 20, fontWeight: 900, color: "#ffffff" }}>Wallet</div>
          </div>

          {/* WALLET CONNECTION Card */}
          <div
            style={{
              borderRadius: 18,
              padding: "16px 18px",
              background: "rgba(18, 16, 32, 0.9)",
              border: "1px solid rgba(139, 92, 246, 0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  color: "rgba(255, 255, 255, 0.45)",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  marginBottom: 3,
                }}
              >
                WALLET CONNECTION
              </div>
              <div style={{ color: "#ffffff", fontSize: 13, fontWeight: 800, fontFamily: "monospace" }}>
                {isWalletConnected ? maskWallet(savedWallet || "") : "Not Connected"}
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
                  gap: 5,
                }}
              >
                {disconnecting ? (
                  <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <X size={11} strokeWidth={2.5} />
                )}
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnectWallet}
                style={{
                  padding: "7px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "linear-gradient(135deg, #0098EA 0%, #0077c2 100%)",
                  color: "#ffffff",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: "0 4px 12px rgba(0, 152, 234, 0.35)",
                }}
              >
                <Wallet size={13} /> Connect
              </button>
            )}
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

          {/* ── DEPOSIT MODE CONTENT (Screenshot 3) ────────────────── */}
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
                  Min 0.1 GRAM
                </div>
              </div>

              {/* Presets */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {["0.5", "1.0", "2.0", "5.0"].map((v) => (
                  <button
                    key={v}
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
                  ✅ Deposit transaction sent successfully!
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

              {/* Big Purple Deposit Button (Screenshot 3) */}
              <button
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

              {/* Manual Transfer / QR Button */}
              <div style={{ textAlign: "center", marginTop: 4 }}>
                <button
                  onClick={() => setShowQrModal(true)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#818cf8",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  View Manual Deposit Address & QR Code
                </button>
              </div>
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
                  placeholder="0.00"
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
                  Min 0.1 TON
                </div>
              </div>

              {/* Presets */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {[0.1, 0.5, 1.0, tonBalance].map((p, i) => {
                  const isMax = i === 3;
                  const disabled = p <= 0 || p > tonBalance || withdrawing;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={disabled}
                      onClick={() => setWithdrawAmount(p.toFixed(isMax ? 4 : 1))}
                      style={{
                        padding: "10px 0",
                        borderRadius: 12,
                        border: "1px solid rgba(59, 130, 246, 0.25)",
                        background: "rgba(18, 16, 32, 0.8)",
                        color: isMax ? "#38bdf8" : "rgba(255, 255, 255, 0.6)",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: disabled ? "not-allowed" : "pointer",
                        opacity: disabled ? 0.35 : 1,
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
                  ✅ Withdrawal request submitted!
                </div>
              )}

              {withdrawError && (
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
                  {withdrawError}
                </div>
              )}

              {/* Big Blue Withdraw Button */}
              <button
                type="submit"
                disabled={withdrawing || tonBalance < MIN_WITHDRAWAL}
                style={{
                  width: "100%",
                  padding: "18px",
                  borderRadius: 18,
                  border: "none",
                  background:
                    tonBalance >= MIN_WITHDRAWAL
                      ? "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)"
                      : "rgba(255, 255, 255, 0.08)",
                  color: tonBalance >= MIN_WITHDRAWAL ? "#ffffff" : "rgba(255, 255, 255, 0.3)",
                  fontSize: 16,
                  fontWeight: 900,
                  cursor: tonBalance >= MIN_WITHDRAWAL && !withdrawing ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: tonBalance >= MIN_WITHDRAWAL ? "0 8px 28px rgba(37, 99, 235, 0.45)" : "none",
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
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          VIEW 3: SWAP SUBPAGE
      ══════════════════════════════════════════════════════════════════ */}
      {currentView === "swap" && (
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
            <div style={{ fontSize: 20, fontWeight: 900, color: "#ffffff" }}>Swap GRAM → GO</div>
          </div>

          {/* Swap Box */}
          <div
            style={{
              background: "rgba(18, 16, 32, 0.9)",
              border: "1px solid rgba(139, 92, 246, 0.16)",
              borderRadius: 20,
              padding: "18px",
            }}
          >
            {/* Pay */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: 11, fontWeight: 800 }}>YOU PAY (GRAM)</span>
              <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 800 }}>
                Balance: {gramBalance.toFixed(4)} GRAM
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <input
                className="no-spin"
                type="number"
                value={swapGramAmount}
                onChange={(e) => setSwapGramAmount(e.target.value)}
                placeholder="0.00"
                step="any"
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  color: "#ffffff",
                  fontSize: 28,
                  fontWeight: 900,
                  fontFamily: "inherit",
                }}
              />
              <div
                style={{
                  padding: "6px 12px",
                  borderRadius: 12,
                  background: "rgba(251, 191, 36, 0.15)",
                  border: "1px solid rgba(251, 191, 36, 0.3)",
                  color: "#fbbf24",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                GRAM
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255, 255, 255, 0.08)", margin: "10px 0 16px" }} />

            {/* Receive */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: 11, fontWeight: 800 }}>YOU RECEIVE (GO)</span>
              <span style={{ color: "#c084fc", fontSize: 11, fontWeight: 800 }}>Rate: 1 GRAM = {gramRate} GO</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, color: "#c084fc", fontSize: 28, fontWeight: 900 }}>
                {parseFloat(swapGramAmount) > 0 ? (parseFloat(swapGramAmount) * gramRate).toFixed(2) : "0.00"}
              </div>
              <div
                style={{
                  padding: "6px 12px",
                  borderRadius: 12,
                  background: "rgba(168, 85, 247, 0.15)",
                  border: "1px solid rgba(168, 85, 247, 0.3)",
                  color: "#c084fc",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                GO
              </div>
            </div>
          </div>

          {/* Presets */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {[0.25, 0.5, 0.75, 1.0].map((pct, i) => {
              const isMax = i === 3;
              const calcVal = gramBalance * pct;
              return (
                <button
                  key={pct}
                  onClick={() => setSwapGramAmount(calcVal.toFixed(4))}
                  style={{
                    padding: "10px 0",
                    borderRadius: 12,
                    border: "1px solid rgba(139, 92, 246, 0.2)",
                    background: "rgba(18, 16, 32, 0.8)",
                    color: isMax ? "#fbbf24" : "rgba(255, 255, 255, 0.6)",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {isMax ? "ALL" : `${pct * 100}%`}
                </button>
              );
            })}
          </div>

          {swapSuccess && (
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
              ✅ Swapped successfully! Mining yield boosted.
            </div>
          )}

          {swapError && (
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
              {swapError}
            </div>
          )}

          {/* Swap CTA */}
          <button
            onClick={handleSwapGramToGo}
            disabled={swapping || gramBalance <= 0 || parseFloat(swapGramAmount) <= 0}
            style={{
              width: "100%",
              padding: "18px",
              borderRadius: 18,
              border: "none",
              background:
                gramBalance > 0 && parseFloat(swapGramAmount) > 0
                  ? "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)"
                  : "rgba(255, 255, 255, 0.08)",
              color: gramBalance > 0 && parseFloat(swapGramAmount) > 0 ? "#ffffff" : "rgba(255, 255, 255, 0.3)",
              fontSize: 16,
              fontWeight: 900,
              cursor: gramBalance > 0 && parseFloat(swapGramAmount) > 0 ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "0 8px 28px rgba(124, 58, 237, 0.45)",
            }}
          >
            {swapping ? (
              <>
                <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Swapping...
              </>
            ) : (
              "Swap GRAM to GO"
            )}
          </button>
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
              background: "#121020",
              border: "1px solid rgba(139, 92, 246, 0.35)",
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
              Deposit Address
            </h4>

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

            <div style={{ color: "#818cf8", fontSize: 11, fontFamily: "monospace", marginBottom: 12 }}>
              {maskWallet(depositWallet)}
            </div>

            <button
              onClick={copyDepositAddress}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {copiedDepAddress ? "Address Copied!" : "Copy Address"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
