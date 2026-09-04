import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "../lib/userContext";
import { api, MiningStatus } from "../lib/api";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import {
  Wallet,
  ChevronDown,
  ChevronRight,
  Clock,
  Rocket,
  Loader2,
  CheckCircle,
} from "lucide-react";

// ── Hexagon Container with Glow ────────────────────────────────────────
function HexagonIcon({
  type,
}: {
  type: "rush" | "gram";
}) {
  const isRush = type === "rush";
  return (
    <div
      style={{
        position: "relative",
        width: 48,
        height: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="48" height="48" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M26 2L48 14.7V40.3L26 51L4 40.3V14.7L26 2Z"
          fill={isRush ? "url(#rushBg)" : "url(#gramBg)"}
          stroke={isRush ? "url(#rushStroke)" : "url(#gramStroke)"}
          strokeWidth="2"
          style={{
            filter: isRush
              ? "drop-shadow(0 0 10px rgba(168, 85, 247, 0.45))"
              : "drop-shadow(0 0 10px rgba(0, 242, 254, 0.45))",
          }}
        />
        <defs>
          <linearGradient id="rushBg" x1="0" y1="0" x2="52" y2="52" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2e1065" stopOpacity="0.8" />
            <stop offset="1" stopColor="#0f0728" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="rushStroke" x1="0" y1="0" x2="52" y2="52" gradientUnits="userSpaceOnUse">
            <stop stopColor="#c084fc" />
            <stop offset="1" stopColor="#7e22ce" />
          </linearGradient>
          <linearGradient id="gramBg" x1="0" y1="0" x2="52" y2="52" gradientUnits="userSpaceOnUse">
            <stop stopColor="#083344" stopOpacity="0.8" />
            <stop offset="1" stopColor="#041824" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="gramStroke" x1="0" y1="0" x2="52" y2="52" gradientUnits="userSpaceOnUse">
            <stop stopColor="#00f2fe" />
            <stop offset="1" stopColor="#0284c7" />
          </linearGradient>
        </defs>
      </svg>

      {/* Icon Content */}
      <div style={{ position: "absolute", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {isRush ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M13 2L3 14H12L11 22L21 10H12L13 2Z"
              fill="#ffffff"
              stroke="#00f2fe"
              strokeWidth="1.2"
              style={{ filter: "drop-shadow(0 0 6px #00f2fe)" }}
            />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M6 3H18L22 9L12 22L2 9L6 3Z"
              fill="#00f2fe"
              stroke="#ffffff"
              strokeWidth="1"
              style={{ filter: "drop-shadow(0 0 6px rgba(0,242,254,0.8))" }}
            />
          </svg>
        )}
      </div>
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
  const { user, refresh, initialized } = useUser();
  const [, setLocation] = useLocation();

  const [connectedAddress] = [useTonAddress()];
  const [tonConnectUI] = useTonConnectUI();

  const [, setMiningStatus] = useState<MiningStatus | null>(null);
  const [liveUnclaimed, setLiveUnclaimed] = useState<number>(0);
  const [claiming, setClaiming] = useState(false);
  const [claimedPopup, setClaimedPopup] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [tonPrice, setTonPrice] = useState<number>(2.5);

  // Mining Countdown timer (seconds remaining in cycle)
  const [timerSeconds, setTimerSeconds] = useState<number>(5101); // 01:25:01

  // Status fetch timestamp & initial values
  const lastFetchRef = useRef<{ ts: number; baseUnclaimed: number; perSec: number }>({
    ts: Date.now(),
    baseUnclaimed: 0,
    perSec: 0,
  });

  // ── Fetch Ton Price ────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/price/ton")
      .then((r) => r.json())
      .then((d) => {
        if (d?.usd) setTonPrice(d.usd);
      })
      .catch(() => {});
  }, []);

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
      const base = parseFloat(res.unclaimedGram || "0");
      const perSec = parseFloat(res.perSecondYield || "0");
      lastFetchRef.current = {
        ts: Date.now(),
        baseUnclaimed: base,
        perSec: perSec,
      };
      setLiveUnclaimed(base);
    } catch {
      // Fallback calculation using user balance
      if (user) {
        const go = parseFloat(user.goBalance || user.balance || "0");
        const rate = 0.03;
        const daily = go * rate;
        const perSec = daily / 86400;
        lastFetchRef.current = {
          ts: Date.now(),
          baseUnclaimed: 0,
          perSec,
        };
        setLiveUnclaimed(0);
      }
    }
  };

  useEffect(() => {
    if (initialized) {
      fetchMining();
    }
  }, [initialized, user?.id]);

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

  // ── Timer countdown ────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 86400));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // ── Handle Claim Gram ──────────────────────────────────────────────
  const handleClaim = async () => {
    if (claiming || liveUnclaimed <= 0) return;
    setClaiming(true);
    setError("");

    try {
      const res = await api.claimMining();
      if (res.success) {
        setClaimedPopup(res.claimedAmount);
        setLiveUnclaimed(0);
        lastFetchRef.current.baseUnclaimed = 0;
        lastFetchRef.current.ts = Date.now();
        await refresh();
        await fetchMining();
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

  // User formatted values
  const rushPoints = Math.round(parseFloat(user?.goBalance || user?.balance || "0"));
  const gramBal = parseFloat(user?.gramBalance || "0").toFixed(4);
  const gramBalNum = parseFloat(gramBal);
  const gramUsdValue = (gramBalNum * tonPrice).toFixed(2);
  const dailyYield = (rushPoints * 0.03).toFixed(4);

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

      {/* ── Claimed Reward Success Popup ───────────────────────────────── */}
      {claimedPopup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(14px)",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 330,
              background: "linear-gradient(165deg, #0d152c 0%, #060a18 100%)",
              border: "1px solid rgba(0,242,254,0.5)",
              borderRadius: 26,
              padding: "32px 24px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              boxShadow: "0 20px 60px rgba(0,242,254,0.3)",
              animation: "popInModal 0.25s cubic-bezier(0.34,1.56,0.64,1)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 50, marginBottom: 8 }}>💎</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase" }}>
              Reward Claimed!
            </div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 900,
                margin: "6px 0",
                background: "linear-gradient(135deg, #00f2fe 0%, #a855f7 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              +{parseFloat(claimedPopup).toFixed(6)}
            </div>
            <div style={{ color: "#00f2fe", fontSize: 13, fontWeight: 800, marginBottom: 16 }}>
              Gram Gold Token
            </div>
            <button
              onClick={() => setClaimedPopup(null)}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 16,
                border: "none",
                background: "linear-gradient(90deg, #00c6ff 0%, #7f00ff 100%)",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 900,
                cursor: "pointer",
                boxShadow: "0 6px 20px rgba(0,242,254,0.4)",
              }}
            >
              Continue Mining ⚡
            </button>
          </div>
        </div>
      )}

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
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "2px solid #00f2fe",
                  boxShadow: "0 0 14px rgba(0, 242, 254, 0.5)",
                }}
              />
            ) : (
              <div
                style={{
                  width: 48,
                  height: 48,
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
                  fontSize: 16,
                  letterSpacing: -0.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {fullName}
              </span>
              <span style={{ color: "#a855f7", fontSize: 14 }}>👑</span>
            </div>
            <div
              style={{
                color: "#38bdf8",
                fontSize: 12,
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
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0, 242, 254, 0.12)",
            flexShrink: 0,
            transition: "all 0.2s ease",
          }}
        >
          <Wallet size={15} color="#00f2fe" />
          <span style={{ fontFamily: activeWallet ? "monospace" : "inherit", letterSpacing: 0.5 }}>{walletDisplay}</span>
          <ChevronDown size={14} color="#00f2fe" />
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          2. BALANCE SECTION (Two Large Side-by-Side Cards)
      ══════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        {/* Left Card: GO Balance */}
        <div
          style={{
            background: "rgba(8, 14, 32, 0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(168, 85, 247, 0.22)",
            borderRadius: 22,
            padding: "16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
          }}
        >
          <HexagonIcon type="rush" />
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: 11, fontWeight: 700, letterSpacing: 0.2 }}>
              GO
            </span>
            <span style={{ color: "#ffffff", fontSize: 24, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.1 }}>
              {rushPoints}
            </span>
          </div>
        </div>

        {/* Right Card: Gram Balance */}
        <div
          style={{
            background: "rgba(8, 14, 32, 0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 242, 254, 0.22)",
            borderRadius: 22,
            padding: "16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
          }}
        >
          <HexagonIcon type="gram" />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: 11, fontWeight: 700, letterSpacing: 0.2 }}>
              Gram Balance
            </span>
            <span style={{ color: "#ffffff", fontSize: 22, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.1 }}>
              {gramBal}
            </span>
            <span style={{ color: "rgba(255, 255, 255, 0.35)", fontSize: 10, fontWeight: 700 }}>
              ≈ ${gramUsdValue}
            </span>
          </div>
        </div>
      </div>

      {/* ── DAILY COMBO QUICK ENTRY CARD ───────────────────────────────── */}
      <div
        onClick={() => setLocation("/combo")}
        style={{
          width: "100%",
          background: "linear-gradient(135deg, rgba(8, 18, 48, 0.85) 0%, rgba(124, 58, 237, 0.25) 100%)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(0, 242, 254, 0.35)",
          borderRadius: 22,
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          boxShadow: "0 8px 30px rgba(0, 242, 254, 0.2)",
          transition: "all 0.25s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              background: "linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(168, 85, 247, 0.3))",
              border: "1px solid rgba(0, 242, 254, 0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              boxShadow: "0 0 15px rgba(0, 242, 254, 0.4)",
            }}
          >
            🧩
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#ffffff", fontSize: 14, fontWeight: 900, letterSpacing: 0.2 }}>
                DAILY COMBO
              </span>
              <span
                style={{
                  background: "linear-gradient(135deg, #00f2fe, #a855f7)",
                  color: "#000",
                  fontSize: 10,
                  fontWeight: 900,
                  padding: "1px 6px",
                  borderRadius: 6,
                }}
              >
                +5 GO
              </span>
            </div>
            <span style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: 11, fontWeight: 600 }}>
              Pick 3 correct catalysts to earn rewards
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            color: "#00f2fe",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          Play <ChevronRight size={16} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          3. 24H EARNINGS PILL
      ══════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          width: "100%",
          background: "rgba(8, 14, 32, 0.65)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(0, 242, 254, 0.15)",
          borderRadius: 999,
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={16} color="#00f2fe" style={{ filter: "drop-shadow(0 0 6px rgba(0,242,254,0.6))" }} />
          <span style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>
            24H EARNED
          </span>
        </div>
        <div
          style={{
            color: "#00f2fe",
            fontSize: 14,
            fontWeight: 900,
            letterSpacing: 0.3,
            filter: "drop-shadow(0 0 8px rgba(0,242,254,0.5))",
          }}
        >
          + {dailyYield} Gram
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          4. MINING SECTION (Large Premium Mining Card)
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

          {/* RIGHT: Mining Stats & Live Unclaimed Ticker */}
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
                MINING ACTIVE
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
            <span style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: 11, fontWeight: 600 }}>
              Mining in progress...
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

            {/* Live Ticking Unclaimed Amount */}
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
              Claiming Reward...
            </>
          ) : (
            <>
              <span style={{ fontSize: 17 }}>💎</span>
              CLAIM REWARD
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

