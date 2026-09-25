import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useUser } from "../lib/userContext";
import { api, ReferralEntry, MilestoneItem } from "../lib/api";
import {
  Users,
  Share2,
  Copy,
  CheckCheck,
  Trophy,
  Link2,
  Lock,
  CheckCircle2,
  Flame,
  ChevronRight,
} from "lucide-react";

// Fallback milestone tiers
const DEFAULT_MILESTONES: MilestoneItem[] = [
  { id: 1, requiredReferrals: 5, rewardAmount: "3", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
  { id: 2, requiredReferrals: 10, rewardAmount: "10", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
  { id: 3, requiredReferrals: 25, rewardAmount: "25", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
  { id: 4, requiredReferrals: 50, rewardAmount: "60", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
  { id: 5, requiredReferrals: 100, rewardAmount: "150", rewardCurrency: "GO", isRepeatable: false, isActive: true, createdAt: "" },
];

export default function ReferralPage() {
  const { user, initialized, retryInit } = useUser();
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const [botUsername, setBotUsername] = useState("GRAMGO1_bot");
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [milestones, setMilestones] = useState<MilestoneItem[]>(DEFAULT_MILESTONES);

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
          padding: "calc(max(env(safe-area-inset-top, 0px), 10px) + 12px) 14px calc(86px + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >

        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 8 }}>
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
                fontSize: 24,
                fontWeight: 900,
                letterSpacing: "0.04em",
                margin: 0,
                lineHeight: 1.15,
                textShadow: "0 2px 14px rgba(0, 242, 254, 0.35)",
              }}
            >
              Friends
            </h1>
            <p
              style={{
                color: "rgba(255, 255, 255, 0.55)",
                fontSize: 12,
                fontWeight: 600,
                margin: "2px 0 0",
              }}
            >
              Invite friends and earn more GO
            </p>
          </div>
        </div>

        {/* INVITE LINK CARD */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 24,
            background: "linear-gradient(145deg, rgba(14, 20, 48, 0.88), rgba(7, 10, 26, 0.94))",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(0, 242, 254, 0.28)",
            padding: "20px",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(0, 242, 254, 0.2)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Ambient Glow */}
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
            <span style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
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
                border: copied ? "1px solid rgba(16, 185, 129, 0.5)" : "1px solid rgba(0, 242, 254, 0.35)",
                background: copied ? "rgba(16, 185, 129, 0.22)" : "linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(0, 242, 254, 0.08))",
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
              padding: "16px 20px",
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

          {/* Statistics below the link/button */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1px 1fr",
              gap: 12,
              marginTop: 4,
              paddingTop: 16,
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            {/* Invited */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
              <span style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Invited
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ color: "#ffffff", fontSize: 24, fontWeight: 900, lineHeight: 1 }}>
                  {refCount}
                </span>
                <span style={{ color: "rgba(0, 242, 254, 0.8)", fontSize: 12, fontWeight: 700 }}>
                  friends
                </span>
              </div>
            </div>

            {/* Divider */}
            <div style={{ background: "rgba(255, 255, 255, 0.08)", height: "100%", width: 1 }} />

            {/* Earned */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
              <span style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Earned
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ color: "#fbbf24", fontSize: 24, fontWeight: 900, lineHeight: 1, textShadow: "0 0 10px rgba(251, 191, 36, 0.3)" }}>
                  +{totalEarnedGO}
                </span>
                <span style={{ color: "rgba(251, 191, 36, 0.85)", fontSize: 12, fontWeight: 800 }}>
                  GO
                </span>
              </div>
            </div>
          </div>
        </div>


        {/* LEADERBOARD CARD */}
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
            padding: "20px",
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
          {/* Subtle Graphic background */}
          <div
            style={{
              position: "absolute",
              top: -20,
              right: 10,
              opacity: 0.1,
              pointerEvents: "none",
              width: 100,
              height: 100,
              backgroundImage: "url('https://vynex-coin1.vercel.app/sad-icon.png')",
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              filter: "brightness(0) invert(1)",
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 14, zIndex: 1 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: "linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.08))",
                border: "1px solid rgba(251, 191, 36, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 16px rgba(251, 191, 36, 0.25)",
              }}
            >
              <Trophy size={28} color="#fbbf24" />
            </div>
            <div>
              <h2
                style={{
                  color: "#ffffff",
                  fontSize: 18,
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
                Top referrers earn more GO
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

        {/* REFERRAL MILESTONES */}
        <div
          style={{
            borderRadius: 24,
            background: "rgba(8, 12, 30, 0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 242, 254, 0.16)",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Flame size={18} color="#00f2fe" />
            <span style={{ color: "#ffffff", fontSize: 14, fontWeight: 900, letterSpacing: "0.04em" }}>
              REFERRAL MILESTONES
            </span>
          </div>

          {/* Progress Section */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: "rgba(255, 255, 255, 0.9)", fontSize: 13, fontWeight: 800 }}>
                {nextMilestone ? `${refCount} / ${nextMilestone.requiredReferrals} Friends` : `${refCount} Friends (All Unlocked!)`}
              </span>
            </div>

            <div
              style={{
                width: "100%",
                height: 12,
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

          {/* Cards */}
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
              const isAchieved = refCount >= m.requiredReferrals;
              const isCurrent = nextMilestone?.id === m.id;

              return (
                <div
                  key={m.id}
                  style={{
                    flexShrink: 0,
                    width: 120,
                    borderRadius: 16,
                    padding: "12px",
                    background: isAchieved || isCurrent
                      ? "linear-gradient(145deg, rgba(0, 242, 254, 0.1), rgba(168, 85, 247, 0.05))"
                      : "rgba(4, 7, 20, 0.5)",
                    border: isAchieved || isCurrent
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

      </div>
    </div>
  );
}
