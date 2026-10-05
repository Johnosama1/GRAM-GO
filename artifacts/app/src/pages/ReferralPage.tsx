import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import leaderboardVideo from "../assets/stickers/leaderboard_video.webm";
import { useUser } from "../lib/userContext";
import {
  api,
  ReferralEntry,
  ReferralCommissionRate,
  ReferralCommissionHistoryItem,
} from "../lib/api";
import {
  Users,
  Share2,
  Copy,
  CheckCheck,
  Link2,
  ChevronRight,
  BookOpen,
  Gift,
  Coins,
  X,
  Layers,
  Trophy,
  Star,
  User,
  CheckCircle2,
} from "lucide-react";

const DEFAULT_LEVELS: ReferralCommissionRate[] = [
  { level: 1, percent: 10 },
  { level: 2, percent: 5 },
  { level: 3, percent: 2 },
  { level: 4, percent: 1 },
  { level: 5, percent: 1 },
];

const MILESTONES_CONFIG = [
  { id: 1, requiredReferrals: 1, rewardAmount: "1", rewardCurrency: "GO", icon: User },
  { id: 2, requiredReferrals: 5, rewardAmount: "3", rewardCurrency: "GO", icon: Users },
  { id: 3, requiredReferrals: 10, rewardAmount: "10", rewardCurrency: "GO", icon: Users },
  { id: 4, requiredReferrals: 25, rewardAmount: "25", rewardCurrency: "GO", icon: Star },
  { id: 5, requiredReferrals: 50, rewardAmount: "50", rewardCurrency: "GO", icon: Trophy },
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

  // Modal states
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

  // Level counts for filter buttons
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
        return { bg: "rgba(0, 229, 255, 0.15)", border: "rgba(0, 229, 255, 0.4)", text: "#00E5FF" };
      case 2:
        return { bg: "rgba(139, 61, 255, 0.15)", border: "rgba(193, 60, 255, 0.4)", text: "#C13CFF" };
      case 3:
        return { bg: "rgba(0, 157, 255, 0.15)", border: "rgba(0, 157, 255, 0.4)", text: "#009DFF" };
      case 4:
        return { bg: "rgba(236, 72, 153, 0.15)", border: "rgba(236, 72, 153, 0.4)", text: "#F472B6" };
      default:
        return { bg: "rgba(0, 230, 118, 0.15)", border: "rgba(0, 230, 118, 0.4)", text: "#00E676" };
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
            "calc(max(env(safe-area-inset-top, 0px), 10px) + 12px) 16px calc(86px + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          maxWidth: "430px",
          width: "100%",
          margin: "0 auto",
        }}
      >
        {/* ========================================================
            1. HEADER (ICON CONTAINER + TITLE + 🎁 & 📖 BUTTONS)
            ======================================================== */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: "80px",
            padding: "4px 0",
          }}
        >
          {/* Left: 64x64 Icon + Titles */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 18,
                background: "linear-gradient(135deg, rgba(0, 229, 255, 0.2), rgba(139, 61, 255, 0.15))",
                border: "1px solid #00E5FF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 18px rgba(0, 229, 255, 0.35)",
                flexShrink: 0,
              }}
            >
              <Users size={30} color="#00E5FF" strokeWidth={2.4} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <h1
                style={{
                  color: "#FFFFFF",
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: "0.02em",
                  margin: 0,
                  lineHeight: 1.15,
                  textShadow: "0 2px 14px rgba(0, 229, 255, 0.35)",
                }}
              >
                Referral <span style={{ color: "#00E5FF" }}>Program</span>
              </h1>
              <p
                style={{
                  color: "#8B96A8",
                  fontSize: 13,
                  fontWeight: 600,
                  margin: "2px 0 0",
                  lineHeight: 1.25,
                }}
              >
                5-Level Network &amp; Instant GO Commissions
              </p>
            </div>
          </div>

          {/* Right: 🎁 Tasks & 📖 Rules Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* 🎁 Referral Tasks Button */}
            <button
              onClick={() => setShowTasksModal(true)}
              aria-label="Referral Tasks"
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: "linear-gradient(135deg, rgba(139, 61, 255, 0.25), rgba(193, 60, 255, 0.18))",
                border: "1px solid #C13CFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 0 14px rgba(193, 60, 255, 0.35)",
                transition: "transform 0.15s ease",
              }}
              onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
              onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <Gift size={22} color="#C13CFF" strokeWidth={2.4} />
            </button>

            {/* 📖 Referral Rules Button */}
            <button
              onClick={() => setShowRulesModal(true)}
              aria-label="Referral Rules"
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: "linear-gradient(135deg, rgba(0, 229, 255, 0.22), rgba(0, 157, 255, 0.15))",
                border: "1px solid #00E5FF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 0 14px rgba(0, 229, 255, 0.35)",
                transition: "transform 0.15s ease",
              }}
              onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
              onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <BookOpen size={22} color="#00E5FF" strokeWidth={2.4} />
            </button>
          </div>
        </div>

        {/* ========================================================
            2. INVITE LINK CARD
            ======================================================== */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 22,
            background: "rgba(5, 15, 32, 0.90)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid #00D9FF",
            padding: "16px",
            boxShadow: "0 0 14px rgba(0, 229, 255, 0.15), 0 12px 36px rgba(0, 0, 0, 0.6)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link2 size={18} color="#00E5FF" strokeWidth={2.4} />
            <span
              style={{
                color: "#FFFFFF",
                fontSize: 16,
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              YOUR INVITE LINK
            </span>
          </div>

          {/* Referral URL Input Box */}
          <div
            onClick={handleCopy}
            style={{
              height: 46,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              background: "#050B18",
              border: "1px solid rgba(0, 229, 255, 0.35)",
              borderRadius: 12,
              padding: "0 12px",
              cursor: "pointer",
            }}
          >
            <span
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
            </span>
            <div style={{ color: copied ? "#00E676" : "rgba(255, 255, 255, 0.6)", flexShrink: 0 }}>
              {copied ? <CheckCheck size={18} strokeWidth={2.4} /> : <Copy size={18} strokeWidth={2.2} />}
            </div>
          </div>

          {/* Action Buttons: Copy Link & Share */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {/* Copy Button */}
            <button
              onClick={handleCopy}
              disabled={!refLink}
              style={{
                height: 44,
                borderRadius: 12,
                border: "none",
                cursor: refLink ? "pointer" : "not-allowed",
                fontWeight: 800,
                fontSize: 14,
                fontFamily: "inherit",
                background: "linear-gradient(135deg, #00E5FF 0%, #009DFF 100%)",
                color: "#050A1A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 4px 18px rgba(0, 229, 255, 0.35)",
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
                height: 44,
                borderRadius: 12,
                border: "none",
                cursor: refLink ? "pointer" : "not-allowed",
                fontWeight: 800,
                fontSize: 14,
                fontFamily: "inherit",
                background: "linear-gradient(135deg, #8B3DFF 0%, #C13CFF 100%)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 4px 18px rgba(139, 61, 255, 0.35)",
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
            3. LEADERBOARD CARD
            ======================================================== */}
        <div
          onClick={() => setLocation("/leaderboard")}
          style={{
            height: 70,
            borderRadius: 22,
            background: "rgba(45, 32, 0, 0.35)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid #D6A928",
            padding: "0 16px",
            boxShadow: "0 0 16px rgba(255, 210, 31, 0.15), 0 10px 30px rgba(0, 0, 0, 0.5)",
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                background: "rgba(255, 210, 31, 0.15)",
                border: "1px solid #FFD21F",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 12px rgba(255, 210, 31, 0.25)",
              }}
            >
              <video src={leaderboardVideo} autoPlay loop muted playsInline style={{ width: 26, height: 26 }} />
            </div>
            <div>
              <h2
                style={{
                  color: "#FFFFFF",
                  fontSize: 18,
                  fontWeight: 900,
                  letterSpacing: "0.03em",
                  margin: 0,
                  textShadow: "0 2px 14px rgba(255, 210, 31, 0.35)",
                }}
              >
                LEADERBOARD
              </h2>
              <p
                style={{
                  color: "#8B96A8",
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
              background: "rgba(255, 210, 31, 0.15)",
              border: "1px solid rgba(255, 210, 31, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronRight size={18} color="#FFD21F" />
          </div>
        </div>

        {/* ========================================================
            4. 5-LEVEL COMMISSIONS
            ======================================================== */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 22,
            background: "rgba(5, 12, 30, 0.88)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 229, 255, 0.45)",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Layers size={18} color="#00E5FF" />
              <span
                style={{
                  color: "#FFFFFF",
                  fontSize: 15,
                  fontWeight: 900,
                  letterSpacing: "0.04em",
                }}
              >
                5-LEVEL COMMISSIONS
              </span>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#C13CFF",
                background: "linear-gradient(135deg, rgba(139, 61, 255, 0.25), rgba(193, 60, 255, 0.15))",
                padding: "4px 10px",
                borderRadius: 10,
                border: "1px solid rgba(193, 60, 255, 0.45)",
              }}
            >
              1 Gram = 1,000 GO
            </span>
          </div>

          {/* 5 Equal Compact Boxes (L1 to L5) */}
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
                  height: 76,
                  background: "rgba(4, 18, 35, 0.95)",
                  border: "1px solid rgba(0, 229, 255, 0.40)",
                  borderRadius: 12,
                  padding: "10px 2px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    color: "#B9C4D5",
                    fontSize: 13,
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  L{lvl.level}
                </span>
                <span
                  style={{
                    color: "#00E5FF",
                    fontSize: 21,
                    fontWeight: 900,
                    lineHeight: 1.1,
                    textShadow: "0 0 10px rgba(0, 229, 255, 0.5)",
                  }}
                >
                  {lvl.percent}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ========================================================
            5. YOUR REFERRALS
            ======================================================== */}
        <div
          style={{
            borderRadius: 22,
            background: "rgba(3, 9, 25, 0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 229, 255, 0.35)",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={18} color="#00E5FF" />
            <h2 style={{ color: "#FFFFFF", fontSize: 18, fontWeight: 900, letterSpacing: "0.03em", margin: 0 }}>
              YOUR REFERRALS ({totalInvited})
            </h2>
          </div>

          {/* Level Filters (All, L1, L2, L3, L4, L5) */}
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
                height: 38,
                borderRadius: 10,
                border: selectedLevelFilter === "all" ? "none" : "1px solid rgba(255, 255, 255, 0.08)",
                background: selectedLevelFilter === "all" ? "#00CFE8" : "rgba(4, 7, 20, 0.6)",
                color: selectedLevelFilter === "all" ? "#050A1A" : "#8B96A8",
                fontSize: 11,
                fontWeight: 900,
                cursor: "pointer",
                textAlign: "center",
                whiteSpace: "nowrap",
                fontFamily: "inherit",
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
                    height: 38,
                    borderRadius: 10,
                    border: isSelected ? "none" : "1px solid rgba(255, 255, 255, 0.08)",
                    background: isSelected ? "#00CFE8" : "rgba(4, 7, 20, 0.6)",
                    color: isSelected ? "#050A1A" : "#8B96A8",
                    fontSize: 11,
                    fontWeight: 900,
                    cursor: "pointer",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    fontFamily: "inherit",
                  }}
                >
                  L{lvl} ({count})
                </button>
              );
            })}
          </div>

          {/* Referral Cards */}
          {loadingReferrals ? (
            <div style={{ textAlign: "center", padding: "20px", color: "#8B96A8", fontSize: 13 }}>
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
              <p style={{ color: "#8B96A8", fontSize: 13, margin: 0, fontWeight: 600 }}>
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

                return (
                  <div
                    key={ref.id}
                    style={{
                      height: 76,
                      background: "rgba(8, 15, 32, 0.85)",
                      border: "1px solid rgba(90, 110, 150, 0.20)",
                      borderRadius: 18,
                      padding: "0 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    {/* Left: Avatar + Names */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                      {ref.photoUrl ? (
                        <img
                          src={ref.photoUrl}
                          alt=""
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: "50%",
                            border: "1px solid rgba(255, 255, 255, 0.25)",
                            objectFit: "cover",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: "50%",
                            background: isSuccessful
                              ? "linear-gradient(135deg, #00E676, #009DFF)"
                              : "linear-gradient(135deg, #8B3DFF, #C13CFF)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#FFFFFF",
                            fontWeight: 900,
                            fontSize: 16,
                            flexShrink: 0,
                          }}
                        >
                          {(ref.name || "U")[0].toUpperCase()}
                        </div>
                      )}

                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span
                          style={{
                            color: "#FFFFFF",
                            fontSize: 16,
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
                              color: "#8B96A8",
                              fontSize: 13,
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

                      {/* Level Pill */}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#C13CFF",
                          background: "rgba(139, 61, 255, 0.15)",
                          border: "1px solid rgba(139, 61, 255, 0.45)",
                          padding: "3px 8px",
                          borderRadius: 10,
                          flexShrink: 0,
                          marginLeft: 4,
                        }}
                      >
                        Level {lvl}
                      </span>
                    </div>

                    {/* Right: Status Pill & Arrow */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 900,
                            background: isSuccessful ? "rgba(0, 230, 118, 0.15)" : "rgba(255, 193, 7, 0.15)",
                            color: isSuccessful ? "#00E676" : "#FFC107",
                            border: isSuccessful
                              ? "1px solid rgba(0, 230, 118, 0.4)"
                              : "1px solid rgba(255, 193, 7, 0.4)",
                          }}
                        >
                          {isSuccessful ? "🟢 Successful" : "🟡 Pending"}
                        </span>
                        {isSuccessful && (
                          <span style={{ color: "#00E676", fontSize: 11, fontWeight: 900 }}>
                            +1 GO
                          </span>
                        )}
                      </div>

                      <ChevronRight size={18} color="#8B96A8" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ========================================================
            6. COMMISSION HISTORY
            ======================================================== */}
        <div
          style={{
            borderRadius: 22,
            background: "rgba(3, 9, 25, 0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 229, 255, 0.35)",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Coins size={18} color="#00E5FF" />
            <h2 style={{ color: "#FFFFFF", fontSize: 17, fontWeight: 900, letterSpacing: "0.03em", margin: 0 }}>
              COMMISSION HISTORY
            </h2>
          </div>

          {/* Table Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 0.7fr 0.8fr 1fr 1fr",
              padding: "6px 8px",
              fontSize: 11,
              fontWeight: 800,
              color: "#8B96A8",
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

          {commissions.length === 0 ? (
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
              <p style={{ color: "#8B96A8", fontSize: 12, margin: 0 }}>
                No commission records yet.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {commissions.map((c) => {
                const dateObj = new Date(c.createdAt);
                const year = dateObj.getFullYear();
                const month = String(dateObj.getMonth() + 1).padStart(2, "0");
                const day = String(dateObj.getDate()).padStart(2, "0");
                const hours = String(dateObj.getHours()).padStart(2, "0");
                const mins = String(dateObj.getMinutes()).padStart(2, "0");
                const dateStr = `${year}-${month}-${day}`;
                const timeStr = `${hours}:${mins}`;

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
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            objectFit: "cover",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #8B3DFF, #C13CFF)",
                            color: "#FFFFFF",
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
                        <span style={{ color: "#FFFFFF", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>
                          {c.depositingUserName}
                        </span>
                        {c.depositingUserUsername && (
                          <span style={{ color: "#8B96A8", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                          background: "rgba(139, 61, 255, 0.15)",
                          color: "#C13CFF",
                          border: "1px solid rgba(139, 61, 255, 0.45)",
                        }}
                      >
                        L{c.level}
                      </span>
                    </div>

                    {/* Percent */}
                    <div style={{ color: "#FFFFFF", fontWeight: 800 }}>
                      {c.percentage}%
                    </div>

                    {/* GO Amount */}
                    <div style={{ color: "#00E676", fontWeight: 900, fontSize: 12 }}>
                      +{c.commissionAmountGo.toFixed(0)} GO
                    </div>

                    {/* Date */}
                    <div style={{ textAlign: "right", color: "#8B96A8", fontSize: 9, fontWeight: 600, display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.25 }}>
                      <span>{dateStr}</span>
                      <span>{timeStr}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          MODAL: REFERRAL TASKS (🎁 BUTTON)
          ======================================================== */}
      {showTasksModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setShowTasksModal(false)}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 360,
              borderRadius: 22,
              background: "linear-gradient(145deg, rgba(14, 20, 48, 0.98), rgba(7, 10, 26, 0.98))",
              border: "1px solid rgba(193, 60, 255, 0.45)",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.85), 0 0 30px rgba(193, 60, 255, 0.25)",
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
                    background: "rgba(193, 60, 255, 0.2)",
                    border: "1px solid rgba(193, 60, 255, 0.45)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Gift size={18} color="#C13CFF" />
                </div>
                <div>
                  <h3 style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 900, margin: 0 }}>
                    Referral Tasks
                  </h3>
                  <p style={{ color: "#8B96A8", fontSize: 11, fontWeight: 600, margin: 0 }}>
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
                  color: "#8B96A8",
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Milestones List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {MILESTONES_CONFIG.map((m) => {
                const IconComponent = m.icon;
                const isAchieved = successfulCount >= m.requiredReferrals;

                return (
                  <div
                    key={m.id}
                    style={{
                      height: 56,
                      background: isAchieved
                        ? "linear-gradient(135deg, rgba(0, 230, 118, 0.12), rgba(4, 7, 20, 0.7))"
                        : "rgba(4, 7, 20, 0.7)",
                      border: isAchieved
                        ? "1px solid rgba(0, 230, 118, 0.4)"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: 14,
                      padding: "0 14px",
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
                          background: isAchieved ? "rgba(0, 230, 118, 0.2)" : "rgba(139, 61, 255, 0.15)",
                          border: isAchieved ? "1px solid rgba(0, 230, 118, 0.4)" : "1px solid rgba(139, 61, 255, 0.3)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <IconComponent size={16} color={isAchieved ? "#00E676" : "#C13CFF"} />
                      </div>
                      <span style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 800 }}>
                        {m.requiredReferrals} {m.requiredReferrals === 1 ? "Successful Friend" : "Successful Friends"}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#00E676", fontSize: 14, fontWeight: 900 }}>
                        +{m.rewardAmount} {m.rewardCurrency}
                      </span>
                      {isAchieved && <CheckCircle2 size={16} color="#00E676" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: REFERRAL RULES (📖 BUTTON)
          ======================================================== */}
      {showRulesModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setShowRulesModal(false)}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 360,
              borderRadius: 22,
              background: "linear-gradient(145deg, rgba(5, 15, 32, 0.98), rgba(2, 8, 23, 0.98))",
              border: "1px solid rgba(0, 229, 255, 0.45)",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.85), 0 0 30px rgba(0, 229, 255, 0.25)",
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
                    background: "rgba(0, 229, 255, 0.15)",
                    border: "1px solid rgba(0, 229, 255, 0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <BookOpen size={18} color="#00E5FF" />
                </div>
                <h3 style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 900, margin: 0 }}>
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
                  color: "#8B96A8",
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Intro */}
            <p style={{ color: "rgba(255, 255, 255, 0.85)", fontSize: 12, margin: 0, lineHeight: 1.4 }}>
              A referred user becomes Successful after completing all of the following:
            </p>

            {/* 3 Step Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* 1. Daily Check-in */}
              <div
                style={{
                  background: "rgba(4, 7, 20, 0.7)",
                  border: "1px solid rgba(0, 229, 255, 0.2)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "rgba(0, 229, 255, 0.2)",
                    color: "#00E5FF",
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
                  <span style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 800 }}>
                    Daily Check-in
                  </span>
                </div>
              </div>

              {/* 2. Daily Combo */}
              <div
                style={{
                  background: "rgba(4, 7, 20, 0.7)",
                  border: "1px solid rgba(0, 229, 255, 0.2)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "rgba(0, 229, 255, 0.2)",
                    color: "#00E5FF",
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
                  <span style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 800 }}>
                    Daily Combo
                  </span>
                </div>
              </div>

              {/* 3. Complete 3 Tasks */}
              <div
                style={{
                  background: "rgba(4, 7, 20, 0.7)",
                  border: "1px solid rgba(0, 229, 255, 0.2)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "rgba(0, 229, 255, 0.2)",
                    color: "#00E5FF",
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
                  <span style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 800 }}>
                    Complete 3 Tasks
                  </span>
                </div>
              </div>
            </div>

            {/* Status Breakdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              {/* Pending */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ color: "#FFC107", fontSize: 13, fontWeight: 900 }}>
                  🟡 Pending
                </span>
                <span style={{ color: "#8B96A8", fontSize: 11, lineHeight: 1.3 }}>
                  Until all requirements are completed.
                </span>
              </div>

              {/* Successful */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ color: "#00E676", fontSize: 13, fontWeight: 900 }}>
                  🟢 Successful
                </span>
                <span style={{ color: "#8B96A8", fontSize: 11, lineHeight: 1.3 }}>
                  After completing all requirements, you will receive <b style={{ color: "#00E676" }}>+1 GO</b>.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
