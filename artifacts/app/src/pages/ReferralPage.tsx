import { useState, useEffect, useMemo } from "react";
import { useUser } from "../lib/userContext";
import { api, ReferralEntry, MilestoneItem } from "../lib/api";
import {
  Users,
  Share2,
  Copy,
  CheckCheck,
  User,
  Trophy,
  Sparkles,
  Link2,
  Lock,
  CheckCircle2,
  Flame,
} from "lucide-react";

interface LeaderEntry {
  rank: number;
  id: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl?: string | null;
  referralCount: number;
}

interface LeaderboardData {
  top: LeaderEntry[];
  myRank: { rank: number; referralCount: number } | null;
}

// Fallback milestone tiers
const DEFAULT_MILESTONES: MilestoneItem[] = [
  { id: 1, requiredReferrals: 5, rewardAmount: "3", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
  { id: 2, requiredReferrals: 10, rewardAmount: "10", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
  { id: 3, requiredReferrals: 25, rewardAmount: "25", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
  { id: 4, requiredReferrals: 50, rewardAmount: "60", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
  { id: 5, requiredReferrals: 100, rewardAmount: "150", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
];

const AVATAR_COLORS = [
  "linear-gradient(135deg, #00f2fe, #4facfe)",
  "linear-gradient(135deg, #a855f7, #6366f1)",
  "linear-gradient(135deg, #ec4899, #f43f5e)",
  "linear-gradient(135deg, #10b981, #059669)",
  "linear-gradient(135deg, #f59e0b, #d97706)",
  "linear-gradient(135deg, #3b82f6, #1d4ed8)",
  "linear-gradient(135deg, #8b5cf6, #7c3aed)",
  "linear-gradient(135deg, #06b6d4, #0891b2)",
];

function getDisplayName(entry: { firstName?: string | null; lastName?: string | null; username?: string | null }): string {
  const full = [entry.firstName, entry.lastName].filter(Boolean).join(" ");
  return full || entry.username || "User";
}

function getInitial(name: string): string {
  return (name.match(/[a-zA-Z0-9\u0600-\u06FF\u0400-\u04FF]/)?.[0] ?? Array.from(name)[0] ?? "?").toUpperCase();
}

function formatJoinDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 24 && now.getDate() === d.getDate()) {
      return "Joined Today";
    }
    if (diffHours < 48) {
      return "Joined Yesterday";
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "Recently";
  }
}

export default function ReferralPage() {
  const { user, initialized, retryInit } = useUser();
  const [copied, setCopied] = useState(false);
  const [botUsername, setBotUsername] = useState("Jojox1bot");
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [milestones, setMilestones] = useState<MilestoneItem[]>(DEFAULT_MILESTONES);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);

  // 1. Fetch Config & Milestones
  useEffect(() => {
    api.getConfig().then((c) => {
      if (c.botUsername) setBotUsername(c.botUsername);
    }).catch(() => {});

    api.getMilestones().then((ms) => {
      if (Array.isArray(ms) && ms.length > 0) {
        setMilestones(ms.sort((a, b) => a.requiredReferrals - b.requiredReferrals));
      }
    }).catch(() => {});
  }, []);

  // 2. Fetch User Referrals
  useEffect(() => {
    if (!user) return;
    setLoadingReferrals(true);
    api.getUserReferrals(user.id)
      .then(setReferrals)
      .catch(() => {})
      .finally(() => setLoadingReferrals(false));
  }, [user?.id]);

  // 3. Fetch Leaderboard
  useEffect(() => {
    const url = user ? `/leaderboard?userId=${user.id}` : "/leaderboard";
    api.getLeaderboard(user?.id)
      .then((data) => setLeaderboard(data as unknown as LeaderboardData))
      .catch(() => {})
      .finally(() => setLoadingLeaderboard(false));
  }, [user?.id]);

  const refCount = user?.referralCount ?? referrals.length;
  const totalEarnedGO = refCount * 10;
  const refLink = user ? `https://t.me/${botUsername}?start=ref_${user.id}` : "";
  const loadFailed = initialized && !user;

  // Milestone calculations
  const nextMilestone = useMemo(() => {
    return milestones.find((m) => m.requiredReferrals > refCount) || null;
  }, [milestones, refCount]);

  const prevMilestoneReq = useMemo(() => {
    const achieved = milestones.filter((m) => m.requiredReferrals <= refCount);
    return achieved.length > 0 ? achieved[achieved.length - 1].requiredReferrals : 0;
  }, [milestones, refCount]);

  const progressPercent = useMemo(() => {
    if (!nextMilestone) return 100;
    const range = nextMilestone.requiredReferrals - prevMilestoneReq;
    const currentInRange = Math.max(0, refCount - prevMilestoneReq);
    return Math.min(100, Math.max(0, (currentInRange / range) * 100));
  }, [nextMilestone, prevMilestoneReq, refCount]);

  const handleCopy = async () => {
    if (!refLink) return;
    try {
      await navigator.clipboard.writeText(refLink);
    } catch {
      const el = document.createElement("textarea");
      el.value = refLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = () => {
    const text = `⛏️ Join GRAM GO Mining Station!\n\n💎 Earn automatic mining yields daily\n🪙 Get +10 GO coins welcome bonus to boost your mining speed immediately!\n🚀 Join via my link:\n${refLink}`;
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(text)}`
      );
    } else {
      window.open(
        `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(text)}`,
        "_blank"
      );
    }
  };

  const approvedCount = referrals.filter((r) => r.status === "approved").length;
  const pendingCount = referrals.filter((r) => r.status === "pending").length;

  // Leaderboard Podium Split
  const top1 = leaderboard?.top?.[0] || null;
  const top2 = leaderboard?.top?.[1] || null;
  const top3 = leaderboard?.top?.[2] || null;
  const restLeaderboard = leaderboard?.top?.slice(3) || [];
  const userRankData = leaderboard?.myRank;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        position: "relative",
        zIndex: 3,
      }}
    >
      {/* ── Scrollable Body ── */}
      <div
        className="page-content-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          padding: "calc(max(env(safe-area-inset-top, 0px), 10px) + 12px) 14px calc(86px + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* ══════════════════════════════════════════════════════════════════
            1. HEADER & MINI STATS CARD
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Header Title Bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(0, 242, 254, 0.25), rgba(168, 85, 247, 0.25))",
                  border: "1px solid rgba(0, 242, 254, 0.45)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 16px rgba(0, 242, 254, 0.25)",
                }}
              >
                <Users size={20} color="#00f2fe" />
              </div>
              <div>
                <h1
                  style={{
                    color: "#ffffff",
                    fontSize: 22,
                    fontWeight: 900,
                    letterSpacing: "0.04em",
                    margin: 0,
                    lineHeight: 1.15,
                    textShadow: "0 2px 14px rgba(0, 242, 254, 0.35)",
                  }}
                >
                  FRIENDS
                </h1>
                <p
                  style={{
                    color: "rgba(255, 255, 255, 0.55)",
                    fontSize: 11,
                    fontWeight: 600,
                    margin: "2px 0 0",
                  }}
                >
                  Invite friends and earn more GO
                </p>
              </div>
            </div>

            {user?.inviterName && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 9px",
                  borderRadius: 999,
                  background: "rgba(0, 242, 254, 0.08)",
                  border: "1px solid rgba(0, 242, 254, 0.25)",
                  color: "#00f2fe",
                  fontSize: 10,
                  fontWeight: 700,
                  maxWidth: 140,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <User size={10} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{user.inviterName}</span>
              </div>
            )}
          </div>

          {/* Mini Stats Card (Glass / Neon) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              background: "rgba(8, 12, 30, 0.72)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(0, 242, 254, 0.18)",
              borderRadius: 18,
              padding: "10px 14px",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(0, 242, 254, 0.12)",
            }}
          >
            {/* Invited Stat */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                borderRight: "1px solid rgba(255, 255, 255, 0.08)",
                paddingRight: 8,
              }}
            >
              <span style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Invited
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ color: "#ffffff", fontSize: 20, fontWeight: 900, lineHeight: 1 }}>
                  {refCount}
                </span>
                <span style={{ color: "rgba(0, 242, 254, 0.8)", fontSize: 11, fontWeight: 700 }}>
                  friends
                </span>
              </div>
            </div>

            {/* Earned Stat */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 8 }}>
              <span style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Earned
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ color: "#fbbf24", fontSize: 20, fontWeight: 900, lineHeight: 1, textShadow: "0 0 10px rgba(251, 191, 36, 0.4)" }}>
                  +{totalEarnedGO}
                </span>
                <span style={{ color: "rgba(251, 191, 36, 0.85)", fontSize: 11, fontWeight: 800 }}>
                  GO
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            2. REFERRAL REWARD CARD (HERO CARD)
        ══════════════════════════════════════════════════════════════════ */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 22,
            background: "linear-gradient(145deg, rgba(14, 20, 48, 0.88), rgba(7, 10, 26, 0.94))",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(0, 242, 254, 0.28)",
            padding: "16px 16px",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(0, 242, 254, 0.2)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Ambient Glow Orbs */}
          <div
            style={{
              position: "absolute",
              top: -30,
              right: -30,
              width: 120,
              height: 120,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(0, 242, 254, 0.18) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -40,
              left: -30,
              width: 130,
              height: 130,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(168, 85, 247, 0.16) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          {/* Subtitle */}
          <div>
            <p style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: 12.5, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
              Invite your friends and earn rewards together!
            </p>
          </div>

          {/* Reward Highlight Box */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderRadius: 16,
              background: "rgba(4, 7, 20, 0.65)",
              border: "1px solid rgba(251, 191, 36, 0.25)",
              boxShadow: "inset 0 0 16px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 900,
                  lineHeight: 1,
                  background: "linear-gradient(135deg, #fde68a, #fbbf24, #f59e0b)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  textShadow: "0 0 20px rgba(251, 191, 36, 0.4)",
                  letterSpacing: "-0.02em",
                }}
              >
                +10 GO
              </div>
              <div style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 3 }}>
                FOR EACH FRIEND
              </div>
            </div>

            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: "linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.08))",
                border: "1px solid rgba(251, 191, 36, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 14px rgba(251, 191, 36, 0.25)",
              }}
            >
              <Sparkles size={22} color="#fbbf24" />
            </div>
          </div>

          {/* Glowing Invite Button */}
          <button
            onClick={shareLink}
            disabled={!refLink}
            style={{
              width: "100%",
              padding: "13px 18px",
              borderRadius: 16,
              border: "none",
              cursor: refLink ? "pointer" : "not-allowed",
              fontWeight: 900,
              fontSize: 14.5,
              letterSpacing: "0.03em",
              fontFamily: "inherit",
              background: "linear-gradient(135deg, #fde68a 0%, #fbbf24 40%, #f59e0b 100%)",
              color: "#0a0600",
              boxShadow: "0 4px 20px rgba(251, 191, 36, 0.45), 0 0 28px rgba(251, 191, 36, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "transform 0.15s, box-shadow 0.15s",
              animation: refLink ? "pulse-gold 2.2s ease-in-out infinite" : "none",
              opacity: refLink ? 1 : 0.6,
            }}
          >
            <Share2 size={17} strokeWidth={2.4} />
            INVITE FRIENDS
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            3. REFERRAL LINK BOX
        ══════════════════════════════════════════════════════════════════ */}
        <div
          style={{
            borderRadius: 18,
            background: "rgba(8, 12, 30, 0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 242, 254, 0.16)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Link2 size={13} color="#00f2fe" />
            <span style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              YOUR INVITE LINK
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(4, 7, 20, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 12,
              padding: "6px 8px 6px 12px",
            }}
          >
            <p
              style={{
                color: "rgba(255, 255, 255, 0.85)",
                fontSize: 12,
                fontFamily: "monospace",
                margin: 0,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                direction: "ltr",
                fontWeight: 600,
              }}
            >
              {refLink || (loadFailed ? "Connection error" : "Generating link…")}
            </p>

            <button
              onClick={handleCopy}
              disabled={!refLink}
              style={{
                padding: "7px 12px",
                borderRadius: 9,
                border: copied ? "1px solid rgba(16, 185, 129, 0.5)" : "1px solid rgba(0, 242, 254, 0.35)",
                background: copied ? "rgba(16, 185, 129, 0.22)" : "linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(0, 242, 254, 0.08))",
                color: copied ? "#34d399" : "#00f2fe",
                cursor: refLink ? "pointer" : "not-allowed",
                fontWeight: 800,
                fontSize: 11,
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: 5,
                flexShrink: 0,
                transition: "all 0.2s ease",
                boxShadow: copied ? "0 0 12px rgba(16, 185, 129, 0.3)" : "none",
              }}
            >
              {copied ? (
                <>
                  <CheckCheck size={12} strokeWidth={2.4} />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={12} strokeWidth={2.4} />
                  COPY
                </>
              )}
            </button>
          </div>
        </div>

        {/* Retry Button if init failed */}
        {loadFailed && (
          <button
            onClick={retryInit}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 14,
              border: "1px solid rgba(251, 191, 36, 0.4)",
              background: "rgba(251, 191, 36, 0.1)",
              color: "#fbbf24",
              fontWeight: 700,
              fontSize: 12,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            🔄 Retry Connection
          </button>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            4. PROGRESS / REFERRAL MILESTONES
        ══════════════════════════════════════════════════════════════════ */}
        <div
          style={{
            borderRadius: 20,
            background: "rgba(8, 12, 30, 0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 242, 254, 0.16)",
            padding: "14px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Milestone Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Flame size={15} color="#00f2fe" />
              <span style={{ color: "#ffffff", fontSize: 13, fontWeight: 800, letterSpacing: "0.04em" }}>
                REFERRAL MILESTONES
              </span>
            </div>
            {nextMilestone && (
              <span style={{ color: "#00f2fe", fontSize: 11, fontWeight: 800, background: "rgba(0, 242, 254, 0.12)", border: "1px solid rgba(0, 242, 254, 0.3)", padding: "2px 8px", borderRadius: 999 }}>
                Next: +{nextMilestone.rewardAmount} {nextMilestone.rewardCurrency}
              </span>
            )}
          </div>

          {/* Visual Progress Bar & Current Target */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: "rgba(255, 255, 255, 0.9)", fontSize: 12.5, fontWeight: 800 }}>
                {nextMilestone ? `${refCount} / ${nextMilestone.requiredReferrals} Friends` : `${refCount} Friends (All Unlocked!)`}
              </span>
              <span style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: 11, fontWeight: 700 }}>
                {nextMilestone ? `Next Reward: +${nextMilestone.rewardAmount} ${nextMilestone.rewardCurrency}` : "Max Tier Reached"}
              </span>
            </div>

            {/* Glowing Neon Bar */}
            <div
              style={{
                width: "100%",
                height: 10,
                borderRadius: 999,
                background: "rgba(255, 255, 255, 0.08)",
                overflow: "hidden",
                position: "relative",
                boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.4)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progressPercent}%`,
                  borderRadius: 999,
                  background: "linear-gradient(90deg, #00f2fe, #a855f7, #fbbf24)",
                  boxShadow: "0 0 12px rgba(0, 242, 254, 0.6)",
                  transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </div>
          </div>

          {/* Milestone Cards Horizontal Timeline */}
          <div
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              paddingBottom: 4,
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
            }}
          >
            {milestones.map((m) => {
              const isAchieved = refCount >= m.requiredReferrals;
              const isCurrent = nextMilestone?.id === m.id;

              return (
                <div
                  key={m.id}
                  style={{
                    flexShrink: 0,
                    width: 105,
                    borderRadius: 14,
                    padding: "9px 10px",
                    background: isAchieved
                      ? "linear-gradient(145deg, rgba(16, 185, 129, 0.16), rgba(6, 78, 59, 0.25))"
                      : isCurrent
                      ? "linear-gradient(145deg, rgba(0, 242, 254, 0.15), rgba(168, 85, 247, 0.15))"
                      : "rgba(4, 7, 20, 0.5)",
                    border: isAchieved
                      ? "1px solid rgba(16, 185, 129, 0.45)"
                      : isCurrent
                      ? "1.5px solid rgba(0, 242, 254, 0.55)"
                      : "1px solid rgba(255, 255, 255, 0.08)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    position: "relative",
                    boxShadow: isCurrent ? "0 0 14px rgba(0, 242, 254, 0.2)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: isAchieved ? "#34d399" : isCurrent ? "#00f2fe" : "rgba(255, 255, 255, 0.4)",
                      }}
                    >
                      {m.requiredReferrals} Friends
                    </span>
                    {isAchieved ? (
                      <CheckCircle2 size={12} color="#34d399" />
                    ) : isCurrent ? (
                      <Flame size={12} color="#00f2fe" />
                    ) : (
                      <Lock size={11} color="rgba(255, 255, 255, 0.3)" />
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      color: isAchieved ? "#34d399" : isCurrent ? "#fbbf24" : "rgba(255, 255, 255, 0.6)",
                      marginTop: 2,
                    }}
                  >
                    +{m.rewardAmount} {m.rewardCurrency}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            5. INVITED USERS ("YOUR FRIENDS")
        ══════════════════════════════════════════════════════════════════ */}
        <div
          style={{
            borderRadius: 20,
            background: "rgba(8, 12, 30, 0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 242, 254, 0.16)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Section Header */}
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Users size={15} color="#00f2fe" />
              <span style={{ color: "#ffffff", fontSize: 13, fontWeight: 800, letterSpacing: "0.04em" }}>
                YOUR FRIENDS
              </span>
              {referrals.length > 0 && (
                <span
                  style={{
                    padding: "2px 7px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 800,
                    background: "rgba(0, 242, 254, 0.15)",
                    border: "1px solid rgba(0, 242, 254, 0.35)",
                    color: "#00f2fe",
                  }}
                >
                  {referrals.length}
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: 5 }}>
              {approvedCount > 0 && (
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 9.5,
                    fontWeight: 700,
                    background: "rgba(16, 185, 129, 0.15)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    color: "#34d399",
                  }}
                >
                  {approvedCount} Active
                </span>
              )}
              {pendingCount > 0 && (
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 9.5,
                    fontWeight: 700,
                    background: "rgba(251, 191, 36, 0.15)",
                    border: "1px solid rgba(251, 191, 36, 0.3)",
                    color: "#fbbf24",
                  }}
                >
                  {pendingCount} Pending
                </span>
              )}
            </div>
          </div>

          {/* Friends List Body */}
          <div style={{ maxHeight: 260, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {loadingReferrals && (
              <div style={{ padding: "28px", textAlign: "center" }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: "2px solid rgba(0, 242, 254, 0.6)",
                    borderTopColor: "transparent",
                    animation: "spin 0.75s linear infinite",
                    margin: "0 auto",
                  }}
                />
              </div>
            )}

            {!loadingReferrals && referrals.length === 0 && (
              <div style={{ padding: "26px 16px", textAlign: "center", color: "rgba(255, 255, 255, 0.45)" }}>
                <Users size={28} style={{ color: "rgba(0, 242, 254, 0.25)", margin: "0 auto 8px" }} />
                <p style={{ color: "#ffffff", fontWeight: 700, fontSize: 13, margin: 0 }}>No friends yet</p>
                <p style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: 11, margin: "4px 0 0" }}>
                  Invite your friends and start earning GO!
                </p>
              </div>
            )}

            {!loadingReferrals &&
              referrals.map((r, idx) => {
                const isApproved = r.status === "approved";
                const isLast = idx === referrals.length - 1;
                const initial = getInitial(r.name);
                const avatarBg = AVATAR_COLORS[idx % AVATAR_COLORS.length];

                return (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      borderBottom: isLast ? "none" : "1px solid rgba(255, 255, 255, 0.05)",
                      background: idx % 2 === 0 ? "rgba(255, 255, 255, 0.015)" : "transparent",
                    }}
                  >
                    {/* Avatar */}
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: avatarBg,
                        border: isApproved ? "1.5px solid rgba(16, 185, 129, 0.55)" : "1.5px solid rgba(251, 191, 36, 0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        fontWeight: 900,
                        color: "#fff",
                        fontSize: 14,
                        boxShadow: isApproved ? "0 0 10px rgba(16, 185, 129, 0.25)" : "none",
                      }}
                    >
                      {r.photoUrl ? (
                        <img
                          src={r.photoUrl}
                          alt={r.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        initial
                      )}
                    </div>

                    {/* Name & Username / Date */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          color: "#ffffff",
                          fontWeight: 700,
                          fontSize: 12.5,
                          margin: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.name}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
                        <p
                          style={{
                            color: "rgba(0, 242, 254, 0.7)",
                            fontSize: 10.5,
                            margin: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.username ? `@${r.username}` : "Member"}
                        </p>
                        <span style={{ color: "rgba(255, 255, 255, 0.2)", fontSize: 9 }}>•</span>
                        <p style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 10, margin: 0 }}>
                          {formatJoinDate(r.joinedAt)}
                        </p>
                      </div>
                    </div>

                    {/* Reward Earned Badge */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 2,
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: isApproved ? "rgba(16, 185, 129, 0.18)" : "rgba(251, 191, 36, 0.15)",
                          border: isApproved ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(251, 191, 36, 0.35)",
                          color: isApproved ? "#34d399" : "#fbbf24",
                          fontSize: 10,
                          fontWeight: 800,
                        }}
                      >
                        {isApproved ? "+10 GO" : "Pending"}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            6. LEADERBOARD ("🏆 LEADERBOARD")
        ══════════════════════════════════════════════════════════════════ */}
        <div
          style={{
            borderRadius: 22,
            background: "rgba(8, 12, 30, 0.75)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(0, 242, 254, 0.2)",
            padding: "16px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            boxShadow: "0 10px 32px rgba(0, 0, 0, 0.5)",
          }}
        >
          {/* Leaderboard Header */}
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              <Trophy size={18} color="#fbbf24" />
              <h2
                style={{
                  color: "#ffffff",
                  fontSize: 18,
                  fontWeight: 900,
                  letterSpacing: "0.06em",
                  margin: 0,
                  textShadow: "0 2px 14px rgba(251, 191, 36, 0.35)",
                }}
              >
                LEADERBOARD
              </h2>
            </div>
            <p style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: 11, fontWeight: 600, margin: "3px 0 0" }}>
              Top referrers earn more GO
            </p>
          </div>

          {/* Loading state */}
          {loadingLeaderboard && (
            <div style={{ padding: "30px", textAlign: "center" }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: "2.5px solid rgba(251, 191, 36, 0.7)",
                  borderTopColor: "transparent",
                  animation: "spin 0.75s linear infinite",
                  margin: "0 auto",
                }}
              />
            </div>
          )}

          {/* ── Top 3 Podium Display ── */}
          {!loadingLeaderboard && (top1 || top2 || top3) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.15fr 1fr",
                gap: 8,
                alignItems: "end",
                padding: "8px 0 4px",
              }}
            >
              {/* #2 2nd Place (Left) */}
              {top2 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    background: "linear-gradient(180deg, rgba(148, 163, 184, 0.15), rgba(8, 12, 30, 0.6))",
                    border: "1px solid rgba(148, 163, 184, 0.35)",
                    borderRadius: 16,
                    padding: "12px 6px 10px",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: -10,
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #e2e8f0, #94a3b8)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 900,
                      color: "#0f172a",
                      boxShadow: "0 0 10px rgba(148, 163, 184, 0.4)",
                    }}
                  >
                    2
                  </div>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #64748b, #475569)",
                      border: "2px solid #cbd5e1",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      fontWeight: 900,
                      color: "#fff",
                      fontSize: 16,
                      marginTop: 4,
                    }}
                  >
                    {top2.photoUrl ? (
                      <img src={top2.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      getInitial(getDisplayName(top2))
                    )}
                  </div>
                  <span style={{ color: "#fff", fontSize: 11, fontWeight: 800, marginTop: 6, maxWidth: 85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {getDisplayName(top2)}
                  </span>
                  <span style={{ color: "rgba(0, 242, 254, 0.8)", fontSize: 9.5, fontWeight: 700 }}>
                    {top2.referralCount} Friends
                  </span>
                  <span style={{ color: "#fbbf24", fontSize: 10.5, fontWeight: 900, marginTop: 2 }}>
                    +{top2.referralCount * 10} GO
                  </span>
                </div>
              ) : <div />}

              {/* #1 1st Place (Center - Elevated) */}
              {top1 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    background: "linear-gradient(180deg, rgba(251, 191, 36, 0.22), rgba(8, 12, 30, 0.75))",
                    border: "1.5px solid rgba(251, 191, 36, 0.6)",
                    borderRadius: 18,
                    padding: "16px 8px 12px",
                    position: "relative",
                    boxShadow: "0 0 24px rgba(251, 191, 36, 0.25)",
                    transform: "translateY(-4px)",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: -14,
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #fde68a, #f59e0b)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      boxShadow: "0 0 14px rgba(251, 191, 36, 0.6)",
                    }}
                  >
                    👑
                  </div>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #d97706, #b45309)",
                      border: "2.5px solid #fbbf24",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      fontWeight: 900,
                      color: "#fff",
                      fontSize: 18,
                      marginTop: 4,
                      boxShadow: "0 0 16px rgba(251, 191, 36, 0.4)",
                    }}
                  >
                    {top1.photoUrl ? (
                      <img src={top1.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      getInitial(getDisplayName(top1))
                    )}
                  </div>
                  <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 900, marginTop: 6, maxWidth: 95, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {getDisplayName(top1)}
                  </span>
                  <span style={{ color: "rgba(255, 255, 255, 0.75)", fontSize: 10, fontWeight: 700 }}>
                    {top1.referralCount} Friends
                  </span>
                  <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 900, marginTop: 2, textShadow: "0 0 8px rgba(251, 191, 36, 0.4)" }}>
                    +{top1.referralCount * 10} GO
                  </span>
                </div>
              ) : <div />}

              {/* #3 3rd Place (Right) */}
              {top3 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    background: "linear-gradient(180deg, rgba(217, 119, 6, 0.15), rgba(8, 12, 30, 0.6))",
                    border: "1px solid rgba(217, 119, 6, 0.35)",
                    borderRadius: 16,
                    padding: "12px 6px 10px",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: -10,
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #f59e0b, #b45309)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 900,
                      color: "#fff",
                      boxShadow: "0 0 10px rgba(217, 119, 6, 0.4)",
                    }}
                  >
                    3
                  </div>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #9a3412, #7c2d12)",
                      border: "2px solid #ea580c",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      fontWeight: 900,
                      color: "#fff",
                      fontSize: 16,
                      marginTop: 4,
                    }}
                  >
                    {top3.photoUrl ? (
                      <img src={top3.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      getInitial(getDisplayName(top3))
                    )}
                  </div>
                  <span style={{ color: "#fff", fontSize: 11, fontWeight: 800, marginTop: 6, maxWidth: 85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {getDisplayName(top3)}
                  </span>
                  <span style={{ color: "rgba(0, 242, 254, 0.8)", fontSize: 9.5, fontWeight: 700 }}>
                    {top3.referralCount} Friends
                  </span>
                  <span style={{ color: "#fbbf24", fontSize: 10.5, fontWeight: 900, marginTop: 2 }}>
                    +{top3.referralCount * 10} GO
                  </span>
                </div>
              ) : <div />}
            </div>
          )}

          {/* ── Ranks #4 to #20 List ── */}
          {!loadingLeaderboard && restLeaderboard.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                background: "rgba(4, 7, 20, 0.6)",
                borderRadius: 16,
                padding: "6px",
                border: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              {restLeaderboard.map((entry) => {
                const isMe = entry.id === user?.id;

                return (
                  <div
                    key={entry.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 12,
                      background: isMe ? "rgba(0, 242, 254, 0.12)" : "transparent",
                      border: isMe ? "1px solid rgba(0, 242, 254, 0.4)" : "none",
                    }}
                  >
                    {/* Rank Number */}
                    <span
                      style={{
                        width: 24,
                        color: isMe ? "#00f2fe" : "rgba(255, 255, 255, 0.45)",
                        fontSize: 12,
                        fontWeight: 900,
                        textAlign: "center",
                      }}
                    >
                      #{entry.rank}
                    </span>

                    {/* Avatar */}
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, rgba(0, 242, 254, 0.3), rgba(168, 85, 247, 0.3))",
                        border: isMe ? "1.5px solid #00f2fe" : "1px solid rgba(255, 255, 255, 0.15)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        fontWeight: 800,
                        color: "#fff",
                        fontSize: 12,
                        flexShrink: 0,
                      }}
                    >
                      {entry.photoUrl ? (
                        <img src={entry.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        getInitial(getDisplayName(entry))
                      )}
                    </div>

                    {/* Name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          color: isMe ? "#00f2fe" : "#ffffff",
                          fontSize: 12,
                          fontWeight: isMe ? 800 : 600,
                          margin: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {getDisplayName(entry)}
                        {isMe ? " (You)" : ""}
                      </p>
                      {entry.username && (
                        <p style={{ color: "rgba(255, 255, 255, 0.35)", fontSize: 9.5, margin: 0 }}>
                          @{entry.username}
                        </p>
                      )}
                    </div>

                    {/* Score */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ color: "#fff", fontSize: 11.5, fontWeight: 800 }}>
                        {entry.referralCount} Friends
                      </div>
                      <div style={{ color: "#fbbf24", fontSize: 10, fontWeight: 900 }}>
                        +{entry.referralCount * 10} GO
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              7. MY RANK CARD
          ══════════════════════════════════════════════════════════════════ */}
          {user && (
            <div
              style={{
                borderRadius: 16,
                padding: "11px 14px",
                background: "linear-gradient(135deg, rgba(0, 242, 254, 0.12), rgba(168, 85, 247, 0.12))",
                border: "1px solid rgba(0, 242, 254, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                boxShadow: "0 0 16px rgba(0, 242, 254, 0.18)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    padding: "4px 8px",
                    borderRadius: 8,
                    background: "rgba(0, 242, 254, 0.2)",
                    border: "1px solid rgba(0, 242, 254, 0.5)",
                    color: "#00f2fe",
                    fontWeight: 900,
                    fontSize: 13,
                  }}
                >
                  #{userRankData?.rank ?? "—"}
                </div>

                <div>
                  <div style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    YOUR RANK
                  </div>
                  <div style={{ color: "#ffffff", fontSize: 13, fontWeight: 800, marginTop: 1 }}>
                    {refCount} Friends
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#fbbf24", fontSize: 14, fontWeight: 900, textShadow: "0 0 10px rgba(251, 191, 36, 0.3)" }}>
                  +{refCount * 10} GO
                </div>
                <div style={{ color: "rgba(251, 191, 36, 0.7)", fontSize: 9.5, fontWeight: 700 }}>
                  Earned
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

