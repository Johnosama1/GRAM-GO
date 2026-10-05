import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import leaderboardVideo from "../assets/stickers/leaderboard_video.webm";
import { useUser } from "../lib/userContext";
import {
  api,
  ReferralEntry,
  MilestoneItem,
  ReferralCommissionRate,
  ReferralCommissionHistoryItem,
} from "../lib/api";
import {
  Users,
  Share2,
  Copy,
  CheckCheck,
  Link2,
  Lock,
  CheckCircle2,
  Flame,
  ChevronRight,
  Sparkles,
  BookOpen,
  Coins,
  X,
  Layers,
  Award,
  Check,
} from "lucide-react";

const DEFAULT_LEVELS: ReferralCommissionRate[] = [
  { level: 1, percent: 10 },
  { level: 2, percent: 5 },
  { level: 3, percent: 2 },
  { level: 4, percent: 1 },
  { level: 5, percent: 1 },
];

const DEFAULT_MILESTONES: MilestoneItem[] = [
  { id: 1, requiredReferrals: 5, rewardAmount: "3", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
  { id: 2, requiredReferrals: 10, rewardAmount: "10", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
  { id: 3, requiredReferrals: 25, rewardAmount: "25", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
  { id: 4, requiredReferrals: 50, rewardAmount: "60", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
  { id: 5, requiredReferrals: 100, rewardAmount: "150", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
];

export default function ReferralPage() {
  const { user, initialized } = useUser();
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const [botUsername, setBotUsername] = useState("GRAMGO1_bot");
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [levels, setLevels] = useState<ReferralCommissionRate[]>(DEFAULT_LEVELS);
  const [milestones, setMilestones] = useState<MilestoneItem[]>(DEFAULT_MILESTONES);
  const [commissions, setCommissions] = useState<ReferralCommissionHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "successful" | "pending">("all");
  const [totalEarnedCommissionGo, setTotalEarnedCommissionGo] = useState(0);
  const [showRulesModal, setShowRulesModal] = useState(false);

  // 1. Fetch Referral Summary & Dynamic Levels from DB
  useEffect(() => {
    if (!user) return;
    setLoadingReferrals(true);

    api
      .getReferralSummary(user.id)
      .then((res) => {
        if (res.levels && Array.isArray(res.levels)) {
          setLevels(res.levels);
        }
        if (res.referrals && Array.isArray(res.referrals)) {
          setReferrals(res.referrals);
        }
        if (res.commissions && Array.isArray(res.commissions)) {
          setCommissions(res.commissions);
        }
        if (res.botUsername) {
          setBotUsername(res.botUsername);
        }
        setTotalEarnedCommissionGo(res.totalEarnedGo || 0);
      })
      .catch(() => {
        api.getUserReferrals(user.id).then(setReferrals).catch(() => {});
      })
      .finally(() => setLoadingReferrals(false));

    api
      .getMilestones()
      .then((ms) => {
        if (Array.isArray(ms) && ms.length > 0) {
          setMilestones(ms.sort((a, b) => a.requiredReferrals - b.requiredReferrals));
        }
      })
      .catch(() => {});
  }, [user?.id]);

  const totalInvited = referrals.length;
  const successfulCount = useMemo(
    () => referrals.filter((r) => r.status === "successful" || r.status === "approved").length,
    [referrals],
  );
  const pendingCount = totalInvited - successfulCount;

  const filteredReferrals = useMemo(() => {
    if (activeTab === "successful") {
      return referrals.filter((r) => r.status === "successful" || r.status === "approved");
    }
    if (activeTab === "pending") {
      return referrals.filter((r) => r.status === "pending");
    }
    return referrals;
  }, [referrals, activeTab]);

  const refLink = user ? `https://t.me/${botUsername}?start=ref_${user.id}` : "";
  const loadFailed = initialized && !user;

  // Milestone calculations
  const nextMilestone = useMemo(() => {
    return milestones.find((m) => m.requiredReferrals > successfulCount) || null;
  }, [milestones, successfulCount]);

  const prevMilestoneReq = useMemo(() => {
    const achieved = milestones.filter((m) => m.requiredReferrals <= successfulCount);
    return achieved.length > 0 ? achieved[achieved.length - 1].requiredReferrals : 0;
  }, [milestones, successfulCount]);

  const progressPercent = useMemo(() => {
    if (!nextMilestone) return 100;
    const range = nextMilestone.requiredReferrals - prevMilestoneReq;
    const currentInRange = Math.max(0, successfulCount - prevMilestoneReq);
    return Math.min(100, Math.max(0, (currentInRange / range) * 100));
  }, [nextMilestone, prevMilestoneReq, successfulCount]);

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
        `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(text)}`,
      );
    } else {
      window.open(
        `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(text)}`,
        "_blank",
      );
    }
  };

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
      <div
        className="page-content-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          padding:
            "calc(max(env(safe-area-inset-top, 0px), 10px) + 12px) 14px calc(86px + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* HEADER: TITLE ON LEFT, BOOK ICON ON RIGHT (SAME ROW) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: "linear-gradient(135deg, rgba(0, 242, 254, 0.15), rgba(168, 85, 247, 0.15))",
                border: "1px solid rgba(0, 242, 254, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 20px rgba(0, 242, 254, 0.2)",
              }}
            >
              <Users size={24} color="#00f2fe" />
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
                Referral Program
              </h1>
              <p
                style={{
                  color: "rgba(255, 255, 255, 0.55)",
                  fontSize: 12,
                  fontWeight: 600,
                  margin: "2px 0 0",
                }}
              >
                5-Level Network &amp; Instant GO Commissions
              </p>
            </div>
          </div>

          {/* BOOK ICON BUTTON (OPPOSITE SIDE, SAME ROW) */}
          <button
            onClick={() => setShowRulesModal(true)}
            aria-label="Referral Qualification Rules"
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              background: "linear-gradient(135deg, rgba(0, 242, 254, 0.16), rgba(168, 85, 247, 0.12))",
              border: "1px solid rgba(0, 242, 254, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#00f2fe",
              boxShadow: "0 0 16px rgba(0, 242, 254, 0.25)",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
              flexShrink: 0,
            }}
            onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
            onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <BookOpen size={20} color="#00f2fe" strokeWidth={2.4} />
          </button>
        </div>

        {/* 1. INVITE LINK CARD (TOP PRIORITY POSITION) */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 24,
            background: "linear-gradient(145deg, rgba(14, 20, 48, 0.92), rgba(7, 10, 26, 0.96))",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(0, 242, 254, 0.28)",
            padding: "18px",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(0, 242, 254, 0.2)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -30,
              right: -30,
              width: 140,
              height: 140,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(0, 242, 254, 0.15) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Link2 size={16} color="#00f2fe" />
            <span
              style={{
                color: "rgba(255, 255, 255, 0.65)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
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
              borderRadius: 14,
              padding: "8px 10px 8px 14px",
            }}
          >
            <p
              style={{
                color: "rgba(255, 255, 255, 0.9)",
                fontSize: 13,
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
                padding: "8px 14px",
                borderRadius: 10,
                border: copied
                  ? "1px solid rgba(16, 185, 129, 0.5)"
                  : "1px solid rgba(0, 242, 254, 0.35)",
                background: copied
                  ? "rgba(16, 185, 129, 0.22)"
                  : "linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(0, 242, 254, 0.08))",
                color: copied ? "#34d399" : "#00f2fe",
                cursor: refLink ? "pointer" : "not-allowed",
                fontWeight: 800,
                fontSize: 12,
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
                transition: "all 0.2s ease",
                boxShadow: copied ? "0 0 12px rgba(16, 185, 129, 0.3)" : "none",
              }}
            >
              {copied ? (
                <>
                  <CheckCheck size={14} strokeWidth={2.4} />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={14} strokeWidth={2.4} />
                  COPY
                </>
              )}
            </button>
          </div>

          <button
            onClick={shareLink}
            disabled={!refLink}
            style={{
              width: "100%",
              padding: "15px 20px",
              borderRadius: 16,
              border: "none",
              cursor: refLink ? "pointer" : "not-allowed",
              fontWeight: 900,
              fontSize: 15,
              letterSpacing: "0.03em",
              fontFamily: "inherit",
              background: "linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)",
              color: "#0a0600",
              boxShadow: "0 4px 20px rgba(0, 242, 254, 0.3), 0 0 28px rgba(0, 242, 254, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "transform 0.15s, box-shadow 0.15s",
              opacity: refLink ? 1 : 0.6,
            }}
          >
            <Share2 size={18} strokeWidth={2.4} />
            Share Invite Link
          </button>

          {/* Key Statistics Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              marginTop: 4,
              paddingTop: 14,
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            {/* Total Invited */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 3,
                alignItems: "center",
                padding: "8px 4px",
                background: "rgba(255, 255, 255, 0.03)",
                borderRadius: 12,
              }}
            >
              <span
                style={{
                  color: "rgba(255, 255, 255, 0.55)",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                Total
              </span>
              <span style={{ color: "#ffffff", fontSize: 18, fontWeight: 900, lineHeight: 1 }}>
                {totalInvited}
              </span>
            </div>

            {/* Successful */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 3,
                alignItems: "center",
                padding: "8px 4px",
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                borderRadius: 12,
              }}
            >
              <span
                style={{
                  color: "#34d399",
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                🟢 Successful
              </span>
              <span style={{ color: "#34d399", fontSize: 18, fontWeight: 900, lineHeight: 1 }}>
                {successfulCount}
              </span>
            </div>

            {/* Pending */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 3,
                alignItems: "center",
                padding: "8px 4px",
                background: "rgba(251, 191, 36, 0.08)",
                border: "1px solid rgba(251, 191, 36, 0.2)",
                borderRadius: 12,
              }}
            >
              <span
                style={{
                  color: "#fbbf24",
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                🟡 Pending
              </span>
              <span style={{ color: "#fbbf24", fontSize: 18, fontWeight: 900, lineHeight: 1 }}>
                {pendingCount}
              </span>
            </div>
          </div>
        </div>

        {/* 2. LEADERBOARD CARD (TOP PRIORITY POSITION) */}
        <div
          onClick={() => setLocation("/leaderboard")}
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 24,
            background: "linear-gradient(145deg, rgba(30, 24, 8, 0.88), rgba(20, 15, 4, 0.94))",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(251, 191, 36, 0.28)",
            padding: "18px",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(251, 191, 36, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            transition: "transform 0.15s ease",
          }}
          onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onPointerLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, zIndex: 1 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: "linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.08))",
                border: "1px solid rgba(251, 191, 36, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 16px rgba(251, 191, 36, 0.25)",
              }}
            >
              <video src={leaderboardVideo} autoPlay loop muted playsInline style={{ width: 28, height: 28 }} />
            </div>
            <div>
              <h2
                style={{
                  color: "#ffffff",
                  fontSize: 16,
                  fontWeight: 900,
                  letterSpacing: "0.04em",
                  margin: 0,
                  textShadow: "0 2px 14px rgba(251, 191, 36, 0.35)",
                }}
              >
                LEADERBOARD
              </h2>
              <p
                style={{
                  color: "rgba(255, 255, 255, 0.6)",
                  fontSize: 12,
                  fontWeight: 600,
                  margin: "2px 0 0",
                }}
              >
                Top referrers earn additional GO prizes
              </p>
            </div>
          </div>

          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(251, 191, 36, 0.1)",
              border: "1px solid rgba(251, 191, 36, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1,
            }}
          >
            <ChevronRight size={20} color="#fbbf24" />
          </div>
        </div>

        {/* 3. COMPACT 5-LEVEL COMMISSION STRUCTURE (5 EQUAL BOXES ROW/GRID) */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 20,
            background: "linear-gradient(145deg, rgba(14, 20, 48, 0.88), rgba(7, 10, 26, 0.94))",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 242, 254, 0.22)",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Layers size={16} color="#00f2fe" />
              <span
                style={{
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 900,
                  letterSpacing: "0.04em",
                }}
              >
                5-LEVEL COMMISSIONS
              </span>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#fbbf24",
                background: "rgba(251, 191, 36, 0.12)",
                padding: "2px 8px",
                borderRadius: 8,
                border: "1px solid rgba(251, 191, 36, 0.25)",
              }}
            >
              1 Gram = 1,000 GO
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 6,
            }}
          >
            {levels.map((lvl) => (
              <div
                key={lvl.level}
                style={{
                  background: "linear-gradient(145deg, rgba(0, 242, 254, 0.08), rgba(168, 85, 247, 0.04))",
                  border: "1px solid rgba(0, 242, 254, 0.25)",
                  borderRadius: 12,
                  padding: "10px 2px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <span
                  style={{
                    color: "rgba(255, 255, 255, 0.55)",
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: "uppercase",
                  }}
                >
                  L{lvl.level}
                </span>
                <span
                  style={{
                    color: "#00f2fe",
                    fontSize: 15,
                    fontWeight: 900,
                    lineHeight: 1.1,
                    textShadow: "0 0 10px rgba(0, 242, 254, 0.45)",
                  }}
                >
                  {lvl.percent}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 4. REFERRAL MILESTONES */}
        <div
          style={{
            borderRadius: 24,
            background: "rgba(8, 12, 30, 0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 242, 254, 0.16)",
            padding: "18px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Flame size={18} color="#00f2fe" />
            <span style={{ color: "#ffffff", fontSize: 14, fontWeight: 900, letterSpacing: "0.04em" }}>
              REFERRAL MILESTONES
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: "rgba(255, 255, 255, 0.9)", fontSize: 13, fontWeight: 800 }}>
                {nextMilestone
                  ? `${successfulCount} / ${nextMilestone.requiredReferrals} Successful Friends`
                  : `${successfulCount} Friends (All Unlocked!)`}
              </span>
            </div>

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

          <div
            style={{
              display: "flex",
              gap: 10,
              overflowX: "auto",
              paddingBottom: 4,
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
            }}
          >
            {milestones.map((m) => {
              const isAchieved = successfulCount >= m.requiredReferrals;
              const isCurrent = nextMilestone?.id === m.id;

              return (
                <div
                  key={m.id}
                  style={{
                    flexShrink: 0,
                    width: 120,
                    borderRadius: 16,
                    padding: "12px",
                    background:
                      isAchieved || isCurrent
                        ? "linear-gradient(145deg, rgba(0, 242, 254, 0.1), rgba(168, 85, 247, 0.05))"
                        : "rgba(4, 7, 20, 0.5)",
                    border:
                      isAchieved || isCurrent
                        ? "1px solid rgba(0, 242, 254, 0.5)"
                        : "1px solid rgba(255, 255, 255, 0.05)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    boxShadow: isAchieved || isCurrent ? "0 0 16px rgba(0, 242, 254, 0.15)" : "none",
                    opacity: isAchieved || isCurrent ? 1 : 0.5,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: isAchieved || isCurrent ? "#00f2fe" : "rgba(255, 255, 255, 0.6)",
                      }}
                    >
                      {m.requiredReferrals} Friends
                    </span>
                    {isAchieved ? (
                      <CheckCircle2 size={14} color="#00f2fe" />
                    ) : (
                      <Lock size={12} color="rgba(255, 255, 255, 0.4)" />
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 900,
                      color: isAchieved || isCurrent ? "#ffffff" : "rgba(255, 255, 255, 0.4)",
                      marginTop: 4,
                      textShadow: isAchieved || isCurrent ? "0 0 10px rgba(0, 242, 254, 0.3)" : "none",
                    }}
                  >
                    +{m.rewardAmount} {m.rewardCurrency}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. REFERRAL LIST (SIMPLIFIED CARDS WITH PROFILE IMAGE, NO LARGE PROGRESS ROW) */}
        <div
          style={{
            borderRadius: 24,
            background: "rgba(8, 12, 30, 0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 242, 254, 0.16)",
            padding: "18px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Users size={18} color="#00f2fe" />
              <h2 style={{ color: "#ffffff", fontSize: 15, fontWeight: 900, margin: 0 }}>
                YOUR REFERRALS ({totalInvited})
              </h2>
            </div>

            {/* Filter Pills */}
            <div
              style={{
                display: "flex",
                background: "rgba(4, 7, 20, 0.6)",
                borderRadius: 12,
                padding: 3,
                border: "1px solid rgba(255, 255, 255, 0.08)",
                gap: 2,
              }}
            >
              <button
                onClick={() => setActiveTab("all")}
                style={{
                  padding: "4px 8px",
                  borderRadius: 8,
                  border: "none",
                  background: activeTab === "all" ? "rgba(0, 242, 254, 0.25)" : "transparent",
                  color: activeTab === "all" ? "#00f2fe" : "rgba(255, 255, 255, 0.6)",
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                All ({totalInvited})
              </button>
              <button
                onClick={() => setActiveTab("successful")}
                style={{
                  padding: "4px 8px",
                  borderRadius: 8,
                  border: "none",
                  background: activeTab === "successful" ? "rgba(16, 185, 129, 0.25)" : "transparent",
                  color: activeTab === "successful" ? "#34d399" : "rgba(255, 255, 255, 0.6)",
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                🟢 ({successfulCount})
              </button>
              <button
                onClick={() => setActiveTab("pending")}
                style={{
                  padding: "4px 8px",
                  borderRadius: 8,
                  border: "none",
                  background: activeTab === "pending" ? "rgba(251, 191, 36, 0.25)" : "transparent",
                  color: activeTab === "pending" ? "#fbbf24" : "rgba(255, 255, 255, 0.6)",
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                🟡 ({pendingCount})
              </button>
            </div>
          </div>

          {loadingReferrals ? (
            <div style={{ textAlign: "center", padding: "24px", color: "rgba(255, 255, 255, 0.5)", fontSize: 13 }}>
              Loading referrals…
            </div>
          ) : filteredReferrals.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "30px 16px",
                background: "rgba(4, 7, 20, 0.4)",
                borderRadius: 16,
                border: "1px dashed rgba(255, 255, 255, 0.1)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Users size={32} color="rgba(255, 255, 255, 0.2)" />
              <p style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: 13, margin: 0, fontWeight: 600 }}>
                {activeTab === "all"
                  ? "No friends invited yet. Share your invite link to start earning GO!"
                  : activeTab === "successful"
                    ? "No successful referrals yet. Remind your friends to complete their Check-in, Combo, and 3 Tasks!"
                    : "No pending referrals."}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredReferrals.map((ref) => {
                const isSuccessful = ref.status === "successful" || ref.status === "approved";

                return (
                  <div
                    key={ref.id}
                    style={{
                      background: isSuccessful
                        ? "linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(4, 7, 20, 0.65))"
                        : "linear-gradient(135deg, rgba(251, 191, 36, 0.06), rgba(4, 7, 20, 0.65))",
                      border: isSuccessful
                        ? "1px solid rgba(16, 185, 129, 0.28)"
                        : "1px solid rgba(251, 191, 36, 0.24)",
                      borderRadius: 16,
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      boxShadow: isSuccessful
                        ? "0 4px 16px rgba(16, 185, 129, 0.08)"
                        : "0 4px 16px rgba(0, 0, 0, 0.2)",
                    }}
                  >
                    {/* Left: Avatar + Names + Level */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                      {ref.photoUrl ? (
                        <img
                          src={ref.photoUrl}
                          alt=""
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            border: "1px solid rgba(255, 255, 255, 0.2)",
                            objectFit: "cover",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            background: isSuccessful
                              ? "linear-gradient(135deg, #10b981, #059669)"
                              : "linear-gradient(135deg, #f59e0b, #d97706)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#ffffff",
                            fontWeight: 900,
                            fontSize: 15,
                            flexShrink: 0,
                            boxShadow: isSuccessful
                              ? "0 0 10px rgba(16, 185, 129, 0.3)"
                              : "0 0 10px rgba(245, 158, 11, 0.3)",
                          }}
                        >
                          {(ref.name || "U")[0].toUpperCase()}
                        </div>
                      )}

                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            style={{
                              color: "#ffffff",
                              fontSize: 14,
                              fontWeight: 800,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {ref.name}
                          </span>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 800,
                              color: "rgba(255, 255, 255, 0.6)",
                              background: "rgba(255, 255, 255, 0.08)",
                              padding: "1px 5px",
                              borderRadius: 6,
                              flexShrink: 0,
                            }}
                          >
                            Level {ref.level || 1}
                          </span>
                        </div>
                        {ref.username && (
                          <span
                            style={{
                              color: "rgba(255, 255, 255, 0.5)",
                              fontSize: 11,
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            @{ref.username}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Status Badge & Optional Commission */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 900,
                          letterSpacing: "0.02em",
                          background: isSuccessful
                            ? "rgba(16, 185, 129, 0.18)"
                            : "rgba(251, 191, 36, 0.18)",
                          color: isSuccessful ? "#34d399" : "#fbbf24",
                          border: isSuccessful
                            ? "1px solid rgba(16, 185, 129, 0.4)"
                            : "1px solid rgba(251, 191, 36, 0.4)",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {isSuccessful ? "🟢 Successful" : "🟡 Pending"}
                      </span>

                      {ref.totalCommissionGo !== undefined && ref.totalCommissionGo > 0 && (
                        <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 900 }}>
                          +{ref.totalCommissionGo.toFixed(2)} GO
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 6. REFERRAL COMMISSION HISTORY SECTION (5-LEVEL DEPOSIT COMMISSIONS) */}
        <div
          style={{
            borderRadius: 24,
            background: "rgba(8, 12, 30, 0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 242, 254, 0.16)",
            padding: "18px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Coins size={18} color="#fbbf24" />
              <h2 style={{ color: "#ffffff", fontSize: 15, fontWeight: 900, margin: 0 }}>
                COMMISSION HISTORY
              </h2>
            </div>
            {totalEarnedCommissionGo > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  color: "#fbbf24",
                  background: "rgba(251, 191, 36, 0.12)",
                  padding: "3px 8px",
                  borderRadius: 8,
                  border: "1px solid rgba(251, 191, 36, 0.25)",
                }}
              >
                +{totalEarnedCommissionGo.toFixed(2)} GO Total
              </span>
            )}
          </div>

          {commissions.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "24px 16px",
                background: "rgba(4, 7, 20, 0.4)",
                borderRadius: 16,
                border: "1px dashed rgba(255, 255, 255, 0.1)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Coins size={28} color="rgba(255, 255, 255, 0.2)" />
              <p style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: 12, margin: 0, fontWeight: 600 }}>
                No commission history yet. When your referrals make qualifying deposits, your 5-level commissions in GO will appear here.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {commissions.map((c) => {
                const dateStr = new Date(c.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={c.id}
                    style={{
                      background: "linear-gradient(135deg, rgba(20, 15, 45, 0.6), rgba(4, 7, 20, 0.7))",
                      border: "1px solid rgba(168, 85, 247, 0.25)",
                      borderRadius: 16,
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
                    }}
                  >
                    {/* Top Row: Level & Rate Badge + Amount */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 8,
                            fontSize: 11,
                            fontWeight: 900,
                            background: "rgba(0, 242, 254, 0.15)",
                            color: "#00f2fe",
                            border: "1px solid rgba(0, 242, 254, 0.3)",
                          }}
                        >
                          Level {c.level}
                        </span>
                        <span style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: 11, fontWeight: 700 }}>
                          ({c.percentage}%)
                        </span>
                      </div>

                      <span style={{ color: "#fbbf24", fontSize: 15, fontWeight: 900, textShadow: "0 0 10px rgba(251, 191, 36, 0.3)" }}>
                        +{c.commissionAmountGo.toFixed(2)} GO
                      </span>
                    </div>

                    {/* Middle Row: Depositing User & Clear Statement */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {c.depositingUserPhotoUrl ? (
                        <img
                          src={c.depositingUserPhotoUrl}
                          alt=""
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 10,
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 10,
                            background: "linear-gradient(135deg, #a855f7, #6366f1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#ffffff",
                            fontWeight: 900,
                            fontSize: 13,
                          }}
                        >
                          {(c.depositingUserName || "U")[0].toUpperCase()}
                        </div>
                      )}

                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span style={{ color: "#ffffff", fontSize: 13, fontWeight: 800 }}>
                          {c.depositingUserName}
                        </span>
                        <span style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: 11, fontWeight: 600 }}>
                          Level {c.level} — You earned {c.commissionAmountGo.toFixed(2)} GO from this referral.
                        </span>
                      </div>
                    </div>

                    {/* Bottom Row: Deposit Details & Timestamp */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingTop: 6,
                        borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                        fontSize: 10,
                        color: "rgba(255, 255, 255, 0.45)",
                        fontWeight: 600,
                      }}
                    >
                      <span>
                        Deposit: {parseFloat(c.depositAmountGram).toFixed(4)} Gram ({parseFloat(c.depositAmountGo).toFixed(2)} GO)
                      </span>
                      <span>{dateStr}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 7. QUALIFICATION RULES MODAL / POPUP (OPENED BY BOOK ICON) */}
      {showRulesModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={() => setShowRulesModal(false)}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 420,
              borderRadius: 24,
              background: "linear-gradient(145deg, rgba(14, 20, 48, 0.98), rgba(7, 10, 26, 0.98))",
              border: "1px solid rgba(0, 242, 254, 0.35)",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 242, 254, 0.2)",
              padding: "22px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              maxHeight: "85vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: "rgba(0, 242, 254, 0.15)",
                    border: "1px solid rgba(0, 242, 254, 0.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <BookOpen size={18} color="#00f2fe" />
                </div>
                <div>
                  <h3 style={{ color: "#ffffff", fontSize: 16, fontWeight: 900, margin: 0 }}>
                    Referral Qualification
                  </h3>
                  <p style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 11, fontWeight: 600, margin: 0 }}>
                    Requirements &amp; Rewards
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowRulesModal(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "rgba(255, 255, 255, 0.7)",
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Qualification Conditions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: 13, fontWeight: 700 }}>
                A referral becomes <b style={{ color: "#34d399" }}>Successful</b> after the referred user completes:
              </span>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                <div
                  style={{
                    background: "rgba(0, 242, 254, 0.06)",
                    border: "1px solid rgba(0, 242, 254, 0.2)",
                    borderRadius: 14,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 18 }}>📅</span>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ color: "#ffffff", fontSize: 13, fontWeight: 800 }}>1. Daily Check-in</span>
                    <span style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: 11 }}>Claim at least 1 daily mining check-in</span>
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(0, 242, 254, 0.06)",
                    border: "1px solid rgba(0, 242, 254, 0.2)",
                    borderRadius: 14,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 18 }}>🧩</span>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ color: "#ffffff", fontSize: 13, fontWeight: 800 }}>2. Daily Combo</span>
                    <span style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: 11 }}>Complete at least 1 daily combo puzzle</span>
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(0, 242, 254, 0.06)",
                    border: "1px solid rgba(0, 242, 254, 0.2)",
                    borderRadius: 14,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 18 }}>⭐</span>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ color: "#ffffff", fontSize: 13, fontWeight: 800 }}>3. Complete 3 Tasks</span>
                    <span style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: 11 }}>Finish at least 3 community or partner tasks</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Status Breakdown */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                background: "rgba(4, 7, 20, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 14,
                padding: "10px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 900 }}>🟡 Pending</span>
                <span style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: 10, lineHeight: 1.3 }}>
                  Until all requirements are completed.
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ color: "#34d399", fontSize: 12, fontWeight: 900 }}>🟢 Successful</span>
                <span style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: 10, lineHeight: 1.3 }}>
                  After all requirements are completed.
                </span>
              </div>
            </div>

            {/* Direct Reward Callout (+1 GO) */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(245, 158, 11, 0.06))",
                border: "1px solid rgba(251, 191, 36, 0.35)",
                borderRadius: 16,
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 24 }}>🎁</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ color: "#fbbf24", fontSize: 13, fontWeight: 900 }}>
                  +1 GO Qualification Reward
                </span>
                <span style={{ color: "rgba(255, 255, 255, 0.75)", fontSize: 11, lineHeight: 1.4 }}>
                  The referrer receives <b>+1 GO</b> credited directly to their GO balance when the referred friend successfully completes the qualification requirements.
                </span>
              </div>
            </div>

            {/* 5-Level Network Commissions explanation */}
            <div
              style={{
                background: "rgba(168, 85, 247, 0.08)",
                border: "1px solid rgba(168, 85, 247, 0.25)",
                borderRadius: 14,
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Coins size={18} color="#c084fc" style={{ flexShrink: 0 }} />
              <span style={{ color: "rgba(255, 255, 255, 0.75)", fontSize: 11, lineHeight: 1.4 }}>
                Successful referrals unlock <b>5-Level Network Commissions</b> paid automatically in GO on confirmed deposits.
              </span>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setShowRulesModal(false)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 14,
                border: "none",
                background: "linear-gradient(135deg, #00f2fe, #4facfe)",
                color: "#0a0600",
                fontSize: 14,
                fontWeight: 900,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
