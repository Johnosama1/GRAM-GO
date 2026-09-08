import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "../lib/userContext";
import { api, MiningStatus } from "../lib/api";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import SwapModal from "../components/SwapModal";
import {
  Wallet,
  ChevronDown,
  Clock,
  Rocket,
  Loader2,
  ArrowDownUp,
  Sparkles,
} from "lucide-react";

// ── Glowing GO Coin Icon ──────────────────────────────────────────────
function GOCoinIcon({ size = 44 }: { size?: number }) {
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <img
        src="/go.png"
        alt="GO"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          filter: "drop-shadow(0 0 12px rgba(234, 179, 8, 0.7))",
        }}
      />
    </div>
  );
}

// ── Glowing Gram Coin Icon ────────────────────────────────────────────
function GramCoinIcon({ size = 44 }: { size?: number }) {
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <img
        src="/gram.png"
        alt="Gram"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          filter: "drop-shadow(0 0 12px rgba(0, 242, 254, 0.7))",
        }}
      />
    </div>
  );
}

// ── Multi-Ring Circular Animated Mining Reactor ──────────────────────
function MiningReactor() {
  return (
    <div
      style={{
        position: "relative",
        width: 140,
        height: 140,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {/* Outer Segmented Purple Ring Rotating */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: "2px dashed rgba(168, 85, 247, 0.75)",
          boxShadow: "0 0 16px rgba(168, 85, 247, 0.35)",
          animation: "spinClockwise 12s linear infinite",
        }}
      />

      {/* Outer Glow Highlight Arcs */}
      <div
        style={{
          position: "absolute",
          inset: 6,
          borderRadius: "50%",
          border: "1.5px solid transparent",
          borderTopColor: "#a855f7",
          borderBottomColor: "#c084fc",
          animation: "spinCounterClockwise 8s linear infinite",
          filter: "drop-shadow(0 0 8px #a855f7)",
        }}
      />

      {/* Middle Neon Cyan Ring */}
      <div
        style={{
          position: "absolute",
          inset: 14,
          borderRadius: "50%",
          border: "2.5px solid #00f2fe",
          boxShadow: "0 0 20px rgba(0, 242, 254, 0.5), inset 0 0 15px rgba(0, 242, 254, 0.3)",
          animation: "pulseGlow 2.5s ease-in-out infinite",
        }}
      />

      {/* Middle Cyan Dashed Ring */}
      <div
        style={{
          position: "absolute",
          inset: 22,
          borderRadius: "50%",
          border: "1.5px dashed rgba(0, 242, 254, 0.4)",
          animation: "spinClockwise 18s linear infinite",
        }}
      />

      {/* Center Dark Core with Electric Cyan Bolt */}
      <div
        style={{
          position: "absolute",
          inset: 28,
          borderRadius: "50%",
          background: "radial-gradient(circle at 40% 35%, #0d1e3d 0%, #050a18 100%)",
          border: "2px solid rgba(0, 242, 254, 0.8)",
          boxShadow: "0 0 18px rgba(0, 242, 254, 0.6), inset 0 0 12px rgba(0, 242, 254, 0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            animation: "boltPulse 2s ease-in-out infinite",
            filter: "drop-shadow(0 0 10px rgba(0, 242, 254, 0.9))",
          }}
        >
          <path
            d="M13 2L3 14H12L11 22L21 10H12L13 2Z"
            fill="#00f2fe"
            stroke="#ffffff"
            strokeWidth="1.2"
          />
        </svg>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user, refresh, initialized, updateUser } = useUser();
  const [, setLocation] = useLocation();

  const [connectedAddress] = [useTonAddress()];
  const [tonConnectUI] = useTonConnectUI();

  const [miningStatus, setMiningStatus] = useState<MiningStatus | null>(null);
  const [liveUnclaimed, setLiveUnclaimed] = useState<number>(0);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);

  // Mining Countdown timer (seconds remaining in 24h cycle)
  const [timerSeconds, setTimerSeconds] = useState<number>(86400); // 24:00:00

  // Status fetch timestamp & initial values
  const lastFetchRef = useRef<{ ts: number; baseUnclaimed: number; perSec: number }>({
    ts: Date.now(),
    baseUnclaimed: 0,
    perSec: 0,
  });

  // ── Auto-sync connected TON wallet with user account ────────────────
  useEffect(() => {
    if (!user) return;
    if (connectedAddress && connectedAddress !== user.savedWalletAddress) {
      api.saveWallet(user.id, connectedAddress)
        .then(() => refresh())
        .catch(() => {});
    }
  }, [connectedAddress, user?.id, user?.savedWalletAddress]);

  // ── Fetch Mining Status ───────────────────────────────────────────
  const fetchMining = async () => {
    try {
      const res = await api.getMiningStatus();
      setMiningStatus(res);
      const base = parseFloat(res.unclaimedGram || res.unclaimedGo || "0");
      const perSec = parseFloat(res.perSecondYield || "0");
      lastFetchRef.current = {
        ts: Date.now(),
        baseUnclaimed: base,
        perSec: perSec,
      };
      setLiveUnclaimed(base);
      if (typeof res.remainingSeconds === "number") {
        setTimerSeconds(res.remainingSeconds);
      } else if (res.lastMiningAt) {
        const elapsed = Math.max(0, (Date.now() - new Date(res.lastMiningAt).getTime()) / 1000);
        setTimerSeconds(Math.max(0, Math.floor(86400 - elapsed)));
      }
    } catch {
      // Fallback calculation using user balance
      if (user) {
        const go = parseFloat(user.goBalance || user.balance || "0");
        const rate = 0.00125; // 0.125% daily Gram yield per GO
        const daily = go * rate;
        const perSec = daily / 86400;
        const lastAt = user.lastMiningAt ? new Date(user.lastMiningAt).getTime() : Date.now();
        const elapsed = Math.max(0, (Date.now() - lastAt) / 1000);
        const rem = Math.max(0, Math.floor(86400 - elapsed));
        const unclaimed = Math.min(daily, elapsed * perSec);
        lastFetchRef.current = {
          ts: Date.now(),
          baseUnclaimed: unclaimed,
          perSec,
        };
        setLiveUnclaimed(unclaimed);
        setTimerSeconds(rem);
      }
    }
  };

  useEffect(() => {
    if (initialized) {
      fetchMining();
    }
  }, [initialized, user?.id]);

  // ── Auto-sync when app is reopened / foregrounded (Offline cloud mining sync) ──
  useEffect(() => {
    const handleSyncOnVisible = () => {
      if (document.visibilityState === "visible") {
        fetchMining();
        refresh();
      }
    };
    document.addEventListener("visibilitychange", handleSyncOnVisible);
    window.addEventListener("focus", handleSyncOnVisible);
    window.addEventListener("pageshow", handleSyncOnVisible);
    return () => {
      document.removeEventListener("visibilitychange", handleSyncOnVisible);
      window.removeEventListener("focus", handleSyncOnVisible);
      window.removeEventListener("pageshow", handleSyncOnVisible);
    };
  }, [user?.id]);

  // ── 60fps Real-Time Ticker for live continuous yield ───────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const { ts, baseUnclaimed, perSec } = lastFetchRef.current;
      if (perSec > 0) {
        const elapsedSec = (Date.now() - ts) / 1000;
        const current = baseUnclaimed + elapsedSec * perSec;
        setLiveUnclaimed(current);
      }
    }, 50);

    return () => clearInterval(interval);
  }, []);

  // ── Timer countdown (24-hour cycle) ────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // ── Handle Claim Gram ───────────────────────────────────────────────
  const handleClaim = async () => {
    if (claiming || liveUnclaimed <= 0) return;
    setClaiming(true);
    setError("");

    try {
      const res = await api.claimMining();
      if (res.success) {
        setLiveUnclaimed(0);
        setTimerSeconds(86400);
        lastFetchRef.current.baseUnclaimed = 0;
        lastFetchRef.current.ts = Date.now();
        if (res.user) {
          updateUser(res.user);
        } else if (res.gramBalance !== undefined && res.goBalance !== undefined) {
          updateUser({ gramBalance: res.gramBalance, goBalance: res.goBalance });
        }
        await fetchMining();
        // Fire refresh in background to keep data fully in sync without blocking
        refresh().catch(() => {});
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to claim reward");
    } finally {
      setClaiming(false);
    }
  };

  const handleWalletClick = () => {
    setLocation("/profile");
  };

  const openSwap = () => {
    setIsSwapModalOpen(true);
  };

  // User formatted values
  const goBalanceNum = parseFloat(user?.goBalance || user?.balance || "0");
  const gramBalanceNum = parseFloat(user?.gramBalance || "0");
  const dailyGramYield = (goBalanceNum * 0.00125).toFixed(6);

  const activeWallet = user?.savedWalletAddress || connectedAddress;
  const walletDisplay = activeWallet
    ? `${activeWallet.slice(0, 4)}...${activeWallet.slice(-4)}`
    : "Connect Wallet";

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "Telegram User";
  const usernameDisplay = user?.username ? `@${user.username}` : (user?.id ? `ID: ${user.id}` : "");
  const avatarInitial = (fullName.trim()[0] || "U").toUpperCase();

  return (
    <div
      className="page-content"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        maxWidth: 440,
        margin: "0 auto",
        paddingLeft: 14,
        paddingRight: 14,
        paddingTop: "calc(max(env(safe-area-inset-top, 0px), 12px) + 54px)",
        paddingBottom: "calc(max(env(safe-area-inset-bottom, 0px), 8px) + 70px)",
        gap: 12,
        direction: "ltr",
        userSelect: "none",
      }}
    >
      <style>{`
        @keyframes spinClockwise {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spinCounterClockwise {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.85; filter: drop-shadow(0 0 12px rgba(0,242,254,0.4)); }
          50% { opacity: 1; filter: drop-shadow(0 0 24px rgba(0,242,254,0.8)); }
        }
        @keyframes boltPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px #00f2fe); }
          50% { transform: scale(1.08); filter: drop-shadow(0 0 18px #00f2fe); }
        }
        @keyframes popInModal {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* ── Swap Modal Component ───────────────────────────────────────── */}
      <SwapModal
        isOpen={isSwapModalOpen}
        onClose={() => setIsSwapModalOpen(false)}
        onSuccess={() => {
          fetchMining();
          refresh();
        }}
      />

      {/* ══════════════════════════════════════════════════════════════════
          1. USER CARD
      ══════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          width: "100%",
          background: "rgba(8, 14, 32, 0.72)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(0, 242, 254, 0.14)",
          borderRadius: 22,
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
        }}
      >
        {/* Left: Avatar + Names */}
        <div
          onClick={() => setLocation("/profile")}
          style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, cursor: "pointer" }}
        >
          {/* Avatar with double glowing ring */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            {user?.photoUrl ? (
              <img
                src={user.photoUrl}
                alt="avatar"
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "2px solid #00f2fe",
                  boxShadow: "0 0 14px rgba(0, 242, 254, 0.5)",
                }}
              />
            ) : (
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #00f2fe 0%, #7f00ff 100%)",
                  border: "2px solid #00f2fe",
                  boxShadow: "0 0 14px rgba(0, 242, 254, 0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  color: "#ffffff",
                  fontSize: 18,
                }}
              >
                {avatarInitial}
              </div>
            )}
          </div>

          {/* User Name + Telegram Handle */}
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  color: "#ffffff",
                  fontWeight: 900,
                  fontSize: 15,
                  letterSpacing: -0.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {fullName}
              </span>
              <span style={{ color: "#a855f7", fontSize: 13 }}>👑</span>
            </div>
            <div
              style={{
                color: "#38bdf8",
                fontSize: 11.5,
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {usernameDisplay}
            </div>
          </div>
        </div>

        {/* Right: Functional Wallet Button */}
        <button
          onClick={handleWalletClick}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(0, 242, 254, 0.08)",
            border: "1px solid rgba(0, 242, 254, 0.35)",
            borderRadius: 14,
            padding: "8px 12px",
            color: activeWallet ? "#00f2fe" : "rgba(255,255,255,0.75)",
            fontSize: 11.5,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0, 242, 254, 0.12)",
            flexShrink: 0,
            transition: "all 0.2s ease",
          }}
        >
          <Wallet size={14} color="#00f2fe" />
          <span style={{ fontFamily: activeWallet ? "monospace" : "inherit", letterSpacing: 0.5 }}>{walletDisplay}</span>
          <ChevronDown size={13} color="#00f2fe" />
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          2. DUAL BALANCES GRID (GO Balance & Gram Balance Separated)
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {/* CARD 1: GO Balance (Mining Power) */}
        <div
          style={{
            background: "linear-gradient(145deg, rgba(20, 16, 8, 0.85) 0%, rgba(10, 12, 24, 0.92) 100%)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1.5px solid rgba(234, 179, 8, 0.35)",
            borderRadius: 20,
            padding: "14px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45), 0 0 16px rgba(234, 179, 8, 0.12)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <GOCoinIcon size={28} />
              <span style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>
                GO BALANCE
              </span>
            </div>
            <span
              style={{
                background: "rgba(234, 179, 8, 0.18)",
                border: "1px solid rgba(234, 179, 8, 0.4)",
                borderRadius: 999,
                padding: "1px 6px",
                fontSize: 9,
                fontWeight: 900,
                color: "#fbbf24",
              }}
            >
              POWER ⚡
            </span>
          </div>

          <div
            style={{
              color: "#ffffff",
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: -0.5,
              fontFamily: "monospace",
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {goBalanceNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: -2 }}>
            <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 10, fontWeight: 700 }}>
              Games & Power
            </span>
            <span style={{ color: "rgba(251, 191, 36, 0.7)", fontSize: 10, fontWeight: 800 }}>
              Mining Multiplier
            </span>
          </div>
        </div>

        {/* CARD 2: Gram Balance (Mined Asset - Swap to GO) */}
        <div
          onClick={openSwap}
          style={{
            background: "linear-gradient(145deg, rgba(8, 20, 40, 0.85) 0%, rgba(6, 10, 24, 0.92) 100%)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1.5px solid rgba(0, 242, 254, 0.35)",
            borderRadius: 20,
            padding: "14px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45), 0 0 16px rgba(0, 242, 254, 0.12)",
            cursor: "pointer",
            position: "relative",
            overflow: "hidden",
            transition: "transform 0.15s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <GramCoinIcon size={28} />
              <span style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>
                GRAM BALANCE
              </span>
            </div>
            <span
              style={{
                background: "rgba(0, 242, 254, 0.18)",
                border: "1px solid rgba(0, 242, 254, 0.4)",
                borderRadius: 999,
                padding: "1px 6px",
                fontSize: 9,
                fontWeight: 900,
                color: "#00f2fe",
              }}
            >
              CRYPTO 💎
            </span>
          </div>

          <div
            style={{
              color: "#00f2fe",
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: -0.5,
              fontFamily: "monospace",
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {gramBalanceNum.toFixed(6)}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: -2 }}>
            <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 10, fontWeight: 700 }}>
              Mined Gram
            </span>
            <span style={{ color: "#00f2fe", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", gap: 3 }}>
              Swap to GO ⚡
            </span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          3. 24H EARNINGS PILL (Calculated Gram Yield)
      ══════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          width: "100%",
          background: "rgba(8, 14, 32, 0.65)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(0, 242, 254, 0.15)",
          borderRadius: 999,
          padding: "11px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={16} color="#00f2fe" style={{ filter: "drop-shadow(0 0 6px rgba(0,242,254,0.6))" }} />
          <span style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>
            24H ESTIMATED YIELD
          </span>
        </div>
        <div
          style={{
            color: "#00f2fe",
            fontSize: 13.5,
            fontWeight: 900,
            letterSpacing: 0.3,
            filter: "drop-shadow(0 0 8px rgba(0,242,254,0.5))",
            fontFamily: "monospace",
          }}
        >
          + {dailyGramYield} Gram / 24H
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          4. MINING SECTION (Large Premium Mining Card with Live Gram Ticker)
      ══════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          width: "100%",
          background: "linear-gradient(165deg, rgba(10, 16, 38, 0.85) 0%, rgba(4, 7, 18, 0.95) 100%)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(0, 242, 254, 0.20)",
          borderRadius: 26,
          padding: "20px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(0, 242, 254, 0.1)",
        }}
      >
        {/* Top Split: Left Reactor & Right Metrics */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* LEFT: Animated Mining Reactor */}
          <MiningReactor />

          {/* RIGHT: Mining Stats & Live Unclaimed Gram Ticker */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
            {/* Status indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#00f2fe",
                  boxShadow: "0 0 8px #00f2fe",
                }}
              />
              <span
                style={{
                  color: "#c084fc",
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                }}
              >
                MINING GRAM ACTIVE
              </span>
            </div>

            {/* Large Timer */}
            <div
              style={{
                color: "#ffffff",
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: -0.5,
                fontFamily: "monospace",
                lineHeight: 1.1,
              }}
            >
              {formatTimer(timerSeconds)}
            </div>

            {/* Subtitle */}
            <span style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: 11, fontWeight: 700 }}>
              24/7 Cloud Mining (Active Offline)
            </span>

            {/* Boost Badge */}
            <div
              style={{
                alignSelf: "flex-start",
                background: "rgba(124, 58, 237, 0.25)",
                border: "1px solid rgba(168, 85, 247, 0.45)",
                borderRadius: 999,
                padding: "3px 10px",
                display: "flex",
                alignItems: "center",
                gap: 5,
                marginTop: 2,
              }}
            >
              <Rocket size={12} color="#c084fc" />
              <span style={{ color: "#c084fc", fontSize: 10.5, fontWeight: 900, letterSpacing: 0.5 }}>
                2.5x BOOST
              </span>
            </div>

            {/* Live Ticking Unclaimed Gram Amount */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <span
                style={{
                  color: "#ffffff",
                  fontSize: 20,
                  fontWeight: 900,
                  letterSpacing: -0.2,
                  fontFamily: "monospace",
                }}
              >
                {liveUnclaimed.toFixed(8)}
              </span>
              <span style={{ color: "#00f2fe", fontSize: 13, fontWeight: 800 }}>Gram</span>
            </div>
          </div>
        </div>

        {/* BOTTOM: One Large Full-Width Claim Button */}
        <button
          onClick={handleClaim}
          disabled={claiming || liveUnclaimed <= 0}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 18,
            border: "none",
            background:
              liveUnclaimed > 0
                ? "linear-gradient(90deg, #00c6ff 0%, #0072ff 35%, #7f00ff 70%, #a855f7 100%)"
                : "rgba(255, 255, 255, 0.07)",
            color: liveUnclaimed > 0 ? "#ffffff" : "rgba(255, 255, 255, 0.3)",
            fontSize: 15,
            fontWeight: 900,
            letterSpacing: 1,
            textTransform: "uppercase",
            cursor: liveUnclaimed > 0 ? "pointer" : "not-allowed",
            boxShadow:
              liveUnclaimed > 0
                ? "0 0 25px rgba(0, 242, 254, 0.4), 0 0 35px rgba(127, 0, 255, 0.25)"
                : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all 0.15s ease",
          }}
        >
          {claiming ? (
            <>
              <Loader2 size={18} style={{ animation: "spinSlow 1s linear infinite" }} />
              Claiming Gram Reward...
            </>
          ) : (
            <>
              <span style={{ fontSize: 17 }}>⚡</span>
              CLAIM GRAM REWARD
            </>
          )}
        </button>
      </div>

      {error && (
        <div
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 14,
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "#fca5a5",
            fontSize: 12,
            textAlign: "center",
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
