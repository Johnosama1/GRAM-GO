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
  ChevronRight,
  BookOpen,
  Gift,
  Coins,
  X,
  Layers,
  Trophy,
  Star,
  User,
  Check,
  Calendar,
  Puzzle,
  Sparkles,
} from "lucide-react";

const DEFAULT_LEVELS: ReferralCommissionRate[] = [
  { level: 1, percent: 10 },
  { level: 2, percent: 5 },
  { level: 3, percent: 2 },
  { level: 4, percent: 1 },
  { level: 5, percent: 1 },
];

const DEFAULT_MILESTONES = [
  { id: 1, requiredReferrals: 1, rewardAmount: "1", rewardCurrency: "GO", icon: User },
  { id: 2, requiredReferrals: 5, rewardAmount: "3", rewardCurrency: "GO", icon: Users },
  { id: 3, requiredReferrals: 10, rewardAmount: "10", rewardCurrency: "GO", icon: Users },
  { id: 4, requiredReferrals: 25, rewardAmount: "30", rewardCurrency: "GO", icon: Star },
  { id: 5, requiredReferrals: 50, rewardAmount: "100", rewardCurrency: "GO", icon: Trophy },
];

export default function ReferralPage() {
  const { user, initialized } = useUser();
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const [botUsername, setBotUsername] = useState("GRAMGO1_bot");
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [levels, setLevels] = useState<ReferralCommissionRate[]>(DEFAULT_LEVELS);
  const [commissions, setCommissions] = useState<ReferralCommissionHistoryItem[]>([]);
  const [selectedLevelFilter, setSelectedLevelFilter] = useState<number | "all">("all");
  const [selectedCommissionLevel, setSelectedCommissionLevel] = useState<number | "all">("all");
  const [totalEarnedCommissionGo, setTotalEarnedCommissionGo] = useState(0);

  // Modals state
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showTasksModal, setShowTasksModal] = useState(false);

  // Fetch Referral Summary & Dynamic Levels from DB
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
  }, [user?.id]);

  const totalInvited = referrals.length;
  const successfulCount = useMemo(
    () => referrals.filter((r) => r.status === "successful" || r.status === "approved").length,
    [referrals],
  );

  // Level counts for filter pills: L1, L2, L3, L4, L5
  const levelCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of referrals) {
      const lvl = r.level || 1;
      if (counts[lvl] !== undefined) {
        counts[lvl]++;
      }
    }
    return counts;
  }, [referrals]);

  // Filtered referrals list based on selected filter
  const filteredReferrals = useMemo(() => {
    if (selectedLevelFilter === "all") return referrals;
    return referrals.filter((r) => (r.level || 1) === selectedLevelFilter);
  }, [referrals, selectedLevelFilter]);

  // Filtered commission history list based on dropdown
  const filteredCommissions = useMemo(() => {
    if (selectedCommissionLevel === "all") return commissions;
    return commissions.filter((c) => c.level === selectedCommissionLevel);
  }, [commissions, selectedCommissionLevel]);

  const refLink = user ? `https://t.me/${botUsername}?start=ref_${user.id}` : "";
  const loadFailed = initialized && !user;

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

  const getLevelBadgeStyle = (level: number) => {
    switch (level) {
      case 1:
        return { bg: "rgba(0, 242, 254, 0.15)", border: "rgba(0, 242, 254, 0.35)", text: "#00f2fe" };
      case 2:
        return { bg: "rgba(168, 85, 247, 0.15)", border: "rgba(168, 85, 247, 0.35)", text: "#c084fc" };
      case 3:
        return { bg: "rgba(59, 130, 246, 0.15)", border: "rgba(59, 130, 246, 0.35)", text: "#60a5fa" };
      case 4:
        return { bg: "rgba(236, 72, 153, 0.15)", border: "rgba(236, 72, 153, 0.35)", text: "#f472b6" };
      default:
        return { bg: "rgba(20, 184, 166, 0.15)", border: "rgba(20, 184, 166, 0.35)", text: "#2dd4bf" };
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
        {/* ========================================================
            1. HEADER: TITLE ON LEFT, 🎁 TASKS & 📖 RULES BUTTONS ON RIGHT
            ======================================================== */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 2 }}>
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
                  fontSize: 21,
                  fontWeight: 900,
                  letterSpacing: "0.03em",
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

          {/* TWO SQUARE ACTION BUTTONS: 🎁 REFERRAL TASKS & 📖 RULES */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* 🎁 Referral Tasks Button */}
            <button
              onClick={() => setShowTasksModal(true)}
              aria-label="Referral Tasks"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(236, 72, 153, 0.15))",
                border: "1px solid rgba(168, 85, 247, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 0 16px rgba(168, 85, 247, 0.3)",
                transition: "transform 0.15s ease",
              }}
              onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
              onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <Gift size={20} color="#c084fc" strokeWidth={2.4} />
            </button>

            {/* 📖 Referral Rules Button */}
            <button
              onClick={() => setShowRulesModal(true)}
              aria-label="Referral Rules"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(6, 182, 212, 0.15))",
                border: "1px solid rgba(0, 242, 254, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 0 16px rgba(0, 242, 254, 0.3)",
                transition: "transform 0.15s ease",
              }}
              onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
              onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <BookOpen size={20} color="#00f2fe" strokeWidth={2.4} />
            </button>
          </div>
        </div>

        {/* ========================================================
            2. YOUR INVITE LINK SECTION (MATCHING REFERENCE IMAGE)
            ======================================================== */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 22,
            background: "linear-gradient(145deg, rgba(14, 20, 48, 0.92), rgba(7, 10, 26, 0.96))",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(0, 242, 254, 0.28)",
            padding: "16px",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(0, 242, 254, 0.2)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Section Title */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link2 size={16} color="#00f2fe" strokeWidth={2.4} />
            <span
              style={{
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              YOUR INVITE LINK
            </span>
          </div>

          {/* Link Box with integrated Copy Icon */}
          <div
            onClick={handleCopy}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              background: "rgba(4, 7, 20, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 14,
              padding: "10px 12px",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                color: "rgba(255, 255, 255, 0.85)",
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
            </span>
            <div style={{ color: copied ? "#34d399" : "rgba(255, 255, 255, 0.6)", flexShrink: 0 }}>
              {copied ? <CheckCheck size={16} strokeWidth={2.4} /> : <Copy size={16} strokeWidth={2.2} />}
            </div>
          </div>

          {/* Action Buttons: [ 📋 Copy Link ] & [ 🔗 Share ] */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {/* Copy Button */}
            <button
              onClick={handleCopy}
              disabled={!refLink}
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                border: "none",
                cursor: refLink ? "pointer" : "not-allowed",
                fontWeight: 900,
                fontSize: 14,
                fontFamily: "inherit",
                background: "linear-gradient(135deg, #00f2fe 0%, #0284c7 100%)",
                color: "#040b18",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 4px 18px rgba(0, 242, 254, 0.35)",
                transition: "transform 0.15s ease",
              }}
              onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <Copy size={16} strokeWidth={2.4} />
              {copied ? "Copied!" : "Copy Link"}
            </button>

            {/* Share Button */}
            <button
              onClick={shareLink}
              disabled={!refLink}
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                border: "none",
                cursor: refLink ? "pointer" : "not-allowed",
                fontWeight: 900,
                fontSize: 14,
                fontFamily: "inherit",
                background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 4px 18px rgba(168, 85, 247, 0.35)",
                transition: "transform 0.15s ease",
              }}
              onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <Share2 size={16} strokeWidth={2.4} />
              Share
            </button>
          </div>
        </div>

        {/* ========================================================
            3. LEADERBOARD CARD (DIRECTLY BELOW INVITE LINK)
            ======================================================== */}
        <div
          onClick={() => setLocation("/leaderboard")}
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 22,
            background: "linear-gradient(145deg, rgba(30, 24, 8, 0.88), rgba(20, 15, 4, 0.94))",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(251, 191, 36, 0.32)",
            padding: "16px 18px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(251, 191, 36, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            transition: "transform 0.15s ease",
          }}
          onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, zIndex: 1 }}>
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
                boxShadow: "0 0 16px rgba(251, 191, 36, 0.25)",
              }}
            >
              <video src={leaderboardVideo} autoPlay loop muted playsInline style={{ width: 28, height: 28 }} />
            </div>
            <div>
              <h2
                style={{
                  color: "#ffffff",
                  fontSize: 15,
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
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(251, 191, 36, 0.12)",
              border: "1px solid rgba(251, 191, 36, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1,
            }}
          >
            <ChevronRight size={18} color="#fbbf24" />
          </div>
        </div>

        {/* ========================================================
            4. 5-LEVEL COMMISSIONS (COMPACT 5 EQUAL BOXES ROW)
            ======================================================== */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 22,
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
                color: "#c084fc",
                background: "rgba(168, 85, 247, 0.14)",
                padding: "2px 8px",
                borderRadius: 8,
                border: "1px solid rgba(168, 85, 247, 0.3)",
              }}
            >
              1 Gram = 1,000 GO
            </span>
          </div>

          {/* 5 Equal Compact Boxes */}
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

        {/* ========================================================
            5. YOUR REFERRALS SECTION (WITH L1-L5 FILTERS & STATUS CHIPS)
            ======================================================== */}
        <div
          style={{
            borderRadius: 22,
            background: "rgba(8, 12, 30, 0.75)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 242, 254, 0.18)",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={17} color="#00f2fe" />
            <h2 style={{ color: "#ffffff", fontSize: 14, fontWeight: 900, letterSpacing: "0.03em", margin: 0 }}>
              YOUR REFERRALS ({totalInvited})
            </h2>
          </div>

          {/* Level Filter Pills: All, L1, L2, L3, L4, L5 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: 4,
            }}
          >
            {/* All */}
            <button
              onClick={() => setSelectedLevelFilter("all")}
              style={{
                padding: "6px 2px",
                borderRadius: 10,
                border: selectedLevelFilter === "all" ? "1px solid #00f2fe" : "1px solid rgba(255, 255, 255, 0.08)",
                background: selectedLevelFilter === "all" ? "rgba(0, 242, 254, 0.22)" : "rgba(4, 7, 20, 0.6)",
                color: selectedLevelFilter === "all" ? "#00f2fe" : "rgba(255, 255, 255, 0.6)",
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                textAlign: "center",
                whiteSpace: "nowrap",
              }}
            >
              All ({totalInvited})
            </button>

            {/* L1..L5 */}
            {[1, 2, 3, 4, 5].map((lvl) => {
              const isSelected = selectedLevelFilter === lvl;
              const count = levelCounts[lvl] || 0;

              return (
                <button
                  key={lvl}
                  onClick={() => setSelectedLevelFilter(lvl)}
                  style={{
                    padding: "6px 2px",
                    borderRadius: 10,
                    border: isSelected ? "1px solid #00f2fe" : "1px solid rgba(255, 255, 255, 0.08)",
                    background: isSelected ? "rgba(0, 242, 254, 0.22)" : "rgba(4, 7, 20, 0.6)",
                    color: isSelected ? "#00f2fe" : "rgba(255, 255, 255, 0.6)",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  L{lvl} ({count})
                </button>
              );
            })}
          </div>

          {/* Referral Cards List */}
          {loadingReferrals ? (
            <div style={{ textAlign: "center", padding: "20px", color: "rgba(255, 255, 255, 0.5)", fontSize: 13 }}>
              Loading referrals…
            </div>
          ) : filteredReferrals.length === 0 ? (
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
              <Users size={28} color="rgba(255, 255, 255, 0.2)" />
              <p style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: 12, margin: 0, fontWeight: 600 }}>
                {selectedLevelFilter === "all"
                  ? "No referrals yet. Share your invite link to build your 5-level network!"
                  : `No referrals found in Level ${selectedLevelFilter}.`}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredReferrals.map((ref) => {
                const isSuccessful = ref.status === "successful" || ref.status === "approved";
                const lvl = ref.level || 1;
                const badgeStyle = getLevelBadgeStyle(lvl);

                return (
                  <div
                    key={ref.id}
                    style={{
                      background: "rgba(11, 16, 38, 0.75)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: 16,
                      padding: "10px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    {/* Left: Avatar + Name + @username + Level Badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                      {ref.photoUrl ? (
                        <img
                          src={ref.photoUrl}
                          alt=""
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            border: "1px solid rgba(255, 255, 255, 0.2)",
                            objectFit: "cover",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            background: isSuccessful
                              ? "linear-gradient(135deg, #10b981, #059669)"
                              : "linear-gradient(135deg, #6366f1, #3b82f6)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#ffffff",
                            fontWeight: 900,
                            fontSize: 14,
                            flexShrink: 0,
                          }}
                        >
                          {(ref.name || "U")[0].toUpperCase()}
                        </div>
                      )}

                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span
                          style={{
                            color: "#ffffff",
                            fontSize: 13,
                            fontWeight: 800,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {ref.name}
                        </span>
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

                      {/* Level Pill Badge */}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: badgeStyle.text,
                          background: badgeStyle.bg,
                          border: `1px solid ${badgeStyle.border}`,
                          padding: "2px 7px",
                          borderRadius: 8,
                          flexShrink: 0,
                          marginLeft: 4,
                        }}
                      >
                        Level {lvl}
                      </span>
                    </div>

                    {/* Right: Status Pill + +1 GO label + Chevron */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 8,
                            fontSize: 10,
                            fontWeight: 900,
                            background: isSuccessful ? "rgba(16, 185, 129, 0.16)" : "rgba(251, 191, 36, 0.16)",
                            color: isSuccessful ? "#34d399" : "#fbbf24",
                            border: isSuccessful
                              ? "1px solid rgba(16, 185, 129, 0.35)"
                              : "1px solid rgba(251, 191, 36, 0.35)",
                          }}
                        >
                          {isSuccessful ? "🟢 Successful" : "🟡 Pending"}
                        </span>
                        {isSuccessful && (
                          <span style={{ color: "#34d399", fontSize: 10, fontWeight: 900 }}>
                            +1 GO
                          </span>
                        )}
                      </div>

                      <ChevronRight size={16} color="rgba(255, 255, 255, 0.4)" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ========================================================
            6. COMMISSION HISTORY TABLE (MATCHING REFERENCE IMAGE)
            ======================================================== */}
        <div
          style={{
            borderRadius: 22,
            background: "rgba(8, 12, 30, 0.75)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 242, 254, 0.18)",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Header with Level Dropdown */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Coins size={17} color="#00f2fe" />
              <h2 style={{ color: "#ffffff", fontSize: 14, fontWeight: 900, letterSpacing: "0.03em", margin: 0 }}>
                COMMISSION HISTORY
              </h2>
            </div>

            {/* Level Selector Dropdown */}
            <select
              value={selectedCommissionLevel}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCommissionLevel(val === "all" ? "all" : parseInt(val));
              }}
              style={{
                background: "rgba(4, 7, 20, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#ffffff",
                padding: "4px 8px",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                outline: "none",
                fontFamily: "inherit",
              }}
            >
              <option value="all" style={{ background: "#0c1024", color: "#fff" }}>All Levels</option>
              <option value="1" style={{ background: "#0c1024", color: "#fff" }}>Level 1</option>
              <option value="2" style={{ background: "#0c1024", color: "#fff" }}>Level 2</option>
              <option value="3" style={{ background: "#0c1024", color: "#fff" }}>Level 3</option>
              <option value="4" style={{ background: "#0c1024", color: "#fff" }}>Level 4</option>
              <option value="5" style={{ background: "#0c1024", color: "#fff" }}>Level 5</option>
            </select>
          </div>

          {/* Commission Table Columns Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 0.7fr 0.8fr 1fr 1fr",
              padding: "4px 8px",
              fontSize: 10,
              fontWeight: 800,
              color: "rgba(255, 255, 255, 0.45)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <span>USER</span>
            <span>LEVEL</span>
            <span>PERCENT</span>
            <span>GO AMOUNT</span>
            <span style={{ textAlign: "right" }}>DATE</span>
          </div>

          {filteredCommissions.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "20px 16px",
                background: "rgba(4, 7, 20, 0.4)",
                borderRadius: 14,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Coins size={24} color="rgba(255, 255, 255, 0.2)" />
              <p style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 12, margin: 0 }}>
                No commission records yet.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredCommissions.map((c) => {
                const dateObj = new Date(c.createdAt);
                const year = dateObj.getFullYear();
                const month = String(dateObj.getMonth() + 1).padStart(2, "0");
                const day = String(dateObj.getDate()).padStart(2, "0");
                const hours = String(dateObj.getHours()).padStart(2, "0");
                const mins = String(dateObj.getMinutes()).padStart(2, "0");
                const dateFormatted = `${year}-${month}-${day} ${hours}:${mins}`;
                const badgeStyle = getLevelBadgeStyle(c.level);

                return (
                  <div
                    key={c.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.6fr 0.7fr 0.8fr 1fr 1fr",
                      alignItems: "center",
                      padding: "8px 8px",
                      background: "rgba(11, 16, 38, 0.5)",
                      borderRadius: 12,
                      border: "1px solid rgba(255, 255, 255, 0.04)",
                      fontSize: 11,
                    }}
                  >
                    {/* User Avatar + Name */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      {c.depositingUserPhotoUrl ? (
                        <img
                          src={c.depositingUserPhotoUrl}
                          alt=""
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 8,
                            objectFit: "cover",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 8,
                            background: badgeStyle.bg,
                            border: `1px solid ${badgeStyle.border}`,
                            color: badgeStyle.text,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 900,
                            flexShrink: 0,
                          }}
                        >
                          {(c.depositingUserName || "U")[0].toUpperCase()}
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span style={{ color: "#ffffff", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>
                          {c.depositingUserName}
                        </span>
                        {c.depositingUserUsername && (
                          <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            @{c.depositingUserUsername}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Level Badge (L1, L2, etc.) */}
                    <div>
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 900,
                          background: badgeStyle.bg,
                          color: badgeStyle.text,
                          border: `1px solid ${badgeStyle.border}`,
                        }}
                      >
                        L{c.level}
                      </span>
                    </div>

                    {/* Percent */}
                    <div style={{ color: "#ffffff", fontWeight: 800 }}>
                      {c.percentage}%
                    </div>

                    {/* GO Amount */}
                    <div style={{ color: "#34d399", fontWeight: 900, fontSize: 12 }}>
                      +{c.commissionAmountGo.toFixed(0)} GO
                    </div>

                    {/* Date */}
                    <div style={{ textAlign: "right", color: "rgba(255, 255, 255, 0.45)", fontSize: 9, fontWeight: 600 }}>
                      {dateFormatted}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          MODAL 1: REFERRAL TASKS (🎁 BUTTON MODAL)
          ======================================================== */}
      {showTasksModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.78)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setShowTasksModal(false)}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 380,
              borderRadius: 24,
              background: "linear-gradient(145deg, rgba(14, 20, 48, 0.98), rgba(7, 10, 26, 0.98))",
              border: "1px solid rgba(168, 85, 247, 0.4)",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(168, 85, 247, 0.25)",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              maxHeight: "85vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: "rgba(168, 85, 247, 0.2)",
                    border: "1px solid rgba(168, 85, 247, 0.45)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Gift size={18} color="#c084fc" />
                </div>
                <div>
                  <h3 style={{ color: "#ffffff", fontSize: 16, fontWeight: 900, margin: 0 }}>
                    Referral Tasks
                  </h3>
                  <p style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 11, fontWeight: 600, margin: 0 }}>
                    Complete referral milestones to earn extra GO rewards!
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowTasksModal(false)}
                style={{
                  width: 30,
                  height: 30,
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
                <X size={15} />
              </button>
            </div>

            {/* Milestones List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {DEFAULT_MILESTONES.map((m) => {
                const IconComponent = m.icon;
                const isAchieved = successfulCount >= m.requiredReferrals;

                return (
                  <div
                    key={m.id}
                    style={{
                      background: isAchieved
                        ? "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(4, 7, 20, 0.7))"
                        : "rgba(4, 7, 20, 0.7)",
                      border: isAchieved
                        ? "1px solid rgba(16, 185, 129, 0.4)"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: 14,
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 10,
                          background: isAchieved ? "rgba(16, 185, 129, 0.2)" : "rgba(168, 85, 247, 0.15)",
                          border: isAchieved ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(168, 85, 247, 0.3)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <IconComponent size={16} color={isAchieved ? "#34d399" : "#c084fc"} />
                      </div>
                      <span style={{ color: "#ffffff", fontSize: 13, fontWeight: 800 }}>
                        {m.requiredReferrals} {m.requiredReferrals === 1 ? "Successful Friend" : "Successful Friends"}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#34d399", fontSize: 14, fontWeight: 900 }}>
                        +{m.rewardAmount} {m.rewardCurrency}
                      </span>
                      {isAchieved && <CheckCircle2 size={16} color="#34d399" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 2: REFERRAL RULES (📖 BUTTON MODAL)
          ======================================================== */}
      {showRulesModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.78)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setShowRulesModal(false)}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 380,
              borderRadius: 24,
              background: "linear-gradient(145deg, rgba(14, 20, 48, 0.98), rgba(7, 10, 26, 0.98))",
              border: "1px solid rgba(0, 242, 254, 0.4)",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 242, 254, 0.25)",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              maxHeight: "85vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: "rgba(0, 242, 254, 0.15)",
                    border: "1px solid rgba(0, 242, 254, 0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <BookOpen size={18} color="#00f2fe" />
                </div>
                <h3 style={{ color: "#ffffff", fontSize: 16, fontWeight: 900, margin: 0 }}>
                  Referral Rules
                </h3>
              </div>

              <button
                onClick={() => setShowRulesModal(false)}
                style={{
                  width: 30,
                  height: 30,
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
                <X size={15} />
              </button>
            </div>

            {/* Intro text */}
            <p style={{ color: "rgba(255, 255, 255, 0.75)", fontSize: 12, margin: 0, lineHeight: 1.4 }}>
              A referred user becomes Successful after completing all of the following:
            </p>

            {/* 3 Numbered Condition Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* 1. Daily Check-in */}
              <div
                style={{
                  background: "rgba(4, 7, 20, 0.7)",
                  border: "1px solid rgba(0, 242, 254, 0.2)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "rgba(0, 242, 254, 0.2)",
                    color: "#00f2fe",
                    fontWeight: 900,
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  1
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>📅</span>
                  <span style={{ color: "#ffffff", fontSize: 13, fontWeight: 800 }}>
                    Daily Check-in
                  </span>
                </div>
              </div>

              {/* 2. Daily Combo */}
              <div
                style={{
                  background: "rgba(4, 7, 20, 0.7)",
                  border: "1px solid rgba(0, 242, 254, 0.2)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "rgba(0, 242, 254, 0.2)",
                    color: "#00f2fe",
                    fontWeight: 900,
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  2
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🧩</span>
                  <span style={{ color: "#ffffff", fontSize: 13, fontWeight: 800 }}>
                    Daily Combo
                  </span>
                </div>
              </div>

              {/* 3. Complete 3 Tasks */}
              <div
                style={{
                  background: "rgba(4, 7, 20, 0.7)",
                  border: "1px solid rgba(0, 242, 254, 0.2)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "rgba(0, 242, 254, 0.2)",
                    color: "#00f2fe",
                    fontWeight: 900,
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  3
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>⭐</span>
                  <span style={{ color: "#ffffff", fontSize: 13, fontWeight: 800 }}>
                    Complete 3 Tasks
                  </span>
                </div>
              </div>
            </div>

            {/* Status Breakdown Section */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              {/* Pending */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ color: "#fbbf24", fontSize: 13, fontWeight: 900 }}>
                  🟡 Pending
                </span>
                <span style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: 11, lineHeight: 1.3 }}>
                  Until all requirements are completed.
                </span>
              </div>

              {/* Successful */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ color: "#34d399", fontSize: 13, fontWeight: 900 }}>
                  🟢 Successful
                </span>
                <span style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: 11, lineHeight: 1.3 }}>
                  After completing all requirements, you will receive <b style={{ color: "#34d399" }}>+1 GO</b>.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
