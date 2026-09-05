import { useState, useEffect } from "react";
import { api, ComboStatus, ComboItem } from "../lib/api";
import { useUser } from "../lib/userContext";
import { useLanguage } from "../lib/i18nContext";
import SwordAdventureGame from "../components/games/SwordAdventureGame";
import {
  Gamepad2,
  Sparkles,
  Clock,
  Calendar,
  Swords,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Zap,
  ShieldCheck,
  Flame,
  X,
} from "lucide-react";

export default function GamesPage() {
  const { user, refresh } = useUser();
  const { isRtl } = useLanguage();

  // Combo states
  const [status, setStatus] = useState<ComboStatus | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [isComboModalOpen, setIsComboModalOpen] = useState(false);
  const [resultModal, setResultModal] = useState<{
    open: boolean;
    isSuccess: boolean;
    message: string;
  } | null>(null);

  // Sword Adventure full-screen state
  const [isSwordGameOpen, setIsSwordGameOpen] = useState(false);

  // Countdown timer string
  const [timeLeft, setTimeLeft] = useState<string>("00:00:00");

  const loadComboStatus = async () => {
    try {
      const data = await api.getComboStatus();
      setStatus(data);
      if (data.attempted && data.selectedItems) {
        setSelectedIds(data.selectedItems);
      }
    } catch (err) {
      console.error("Failed to load combo status:", err);
    }
  };

  useEffect(() => {
    loadComboStatus();
  }, []);

  // Update countdown
  useEffect(() => {
    if (!status?.nextComboAt) return;
    const target = new Date(status.nextComboAt).getTime();

    const updateTimer = () => {
      const diff = Math.max(0, target - Date.now());
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [status?.nextComboAt]);

  const handleSelectItem = (id: number) => {
    if (status?.attempted) return;

    if (selectedIds.includes(id)) {
      setSelectedIds((prev) => prev.filter((i) => i !== id));
      setWarningMsg(null);
    } else {
      if (selectedIds.length < 3) {
        setSelectedIds((prev) => [...prev, id]);
        setWarningMsg(null);
      } else {
        setWarningMsg("You can only choose 3 items.");
        setTimeout(() => setWarningMsg(null), 2500);
      }
    }
  };

  const handleCheckCombo = async () => {
    if (status?.attempted || submitting) return;

    if (selectedIds.length !== 3) {
      setWarningMsg("Please select 3 items first.");
      setTimeout(() => setWarningMsg(null), 3000);
      return;
    }

    setSubmitting(true);
    setWarningMsg(null);
    try {
      const res = await api.checkCombo(selectedIds);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              attempted: true,
              isSuccess: res.isSuccess,
              rewardClaimed: res.isSuccess,
              selectedItems: selectedIds,
            }
          : null
      );

      setResultModal({
        open: true,
        isSuccess: res.isSuccess,
        message: res.message,
      });

      if (res.isSuccess) {
        await refresh();
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "body" in err
          ? (err as { body?: { error?: string } }).body?.error
          : "Failed to check combo";
      setResultModal({
        open: true,
        isSuccess: false,
        message: msg || "Failed to submit combo attempt",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const itemsList: ComboItem[] = status?.items || [
    { id: 1, name: "Crystal Shard", image: "/combo/combo_1.png", description: "High-resonance energy crystal" },
    { id: 2, name: "GRAM Box", image: "/combo/combo_2.png", description: "Quantum storage cube" },
    { id: 3, name: "GRAM Coins", image: "/combo/combo_3.png", description: "Pure catalytic gold coins" },
    { id: 4, name: "GRAM Flag", image: "/combo/combo_4.png", description: "Guild banner of victory" },
    { id: 5, name: "GRAM Pickaxe", image: "/combo/combo_5.png", description: "Ultra-dense mining implement" },
  ];

  return (
    <div
      style={{
        flex: 1,
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        color: "#ffffff",
        paddingTop: "calc(max(env(safe-area-inset-top, 0px), 12px) + 54px)",
        paddingBottom: "95px",
        paddingLeft: "14px",
        paddingRight: "14px",
        boxSizing: "border-box",
        overflowY: "auto",
        direction: "ltr",
      }}
    >
      <style>{`
        @keyframes popIn {
          0% { transform: scale(0.92); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pulseGlow {
          0%, 100% { filter: drop-shadow(0 0 12px rgba(0, 242, 254, 0.6)); }
          50% { filter: drop-shadow(0 0 20px rgba(168, 85, 247, 0.8)); }
        }
        @keyframes floatAnim {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
      `}</style>

      {/* ── 1. Top Header Banner (GAMES) ────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          marginBottom: "16px",
          position: "relative",
        }}
      >
        {/* Gamepad Icon Badge */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 18,
            background: "linear-gradient(135deg, rgba(8, 20, 50, 0.9), rgba(20, 10, 42, 0.9))",
            border: "1.5px solid rgba(0, 242, 254, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 24px rgba(0, 242, 254, 0.4), inset 0 0 12px rgba(0, 242, 254, 0.2)",
            marginBottom: "8px",
            animation: "pulseGlow 3s infinite ease-in-out",
          }}
        >
          <Gamepad2 size={28} color="#00f2fe" />
        </div>

        {/* Large Glowing Title: GAMES */}
        <h1
          style={{
            fontFamily: "'Cairo', 'Tajawal', sans-serif",
            fontSize: "30px",
            fontWeight: 900,
            letterSpacing: "2px",
            margin: "0 0 2px",
            background: "linear-gradient(135deg, #ffffff 0%, #00f2fe 50%, #c084fc 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 16px rgba(0, 242, 254, 0.5))",
          }}
        >
          GAMES
        </h1>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "11px",
            fontWeight: 900,
            letterSpacing: "1.5px",
            color: "rgba(0, 242, 254, 0.85)",
            textTransform: "uppercase",
            marginBottom: "8px",
          }}
        >
          PLAY • EARN GO • HAVE FUN
        </div>

        {/* Subpill Banner */}
        <div
          style={{
            background: "rgba(8, 14, 32, 0.85)",
            border: "1px solid rgba(0, 242, 254, 0.25)",
            borderRadius: "20px",
            padding: "4px 14px",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
          }}
        >
          <Sparkles size={12} color="#00f2fe" />
          <span style={{ fontSize: "11.5px", fontWeight: 700, color: "rgba(255, 255, 255, 0.85)" }}>
            Play games, complete challenges and earn GO!
          </span>
          <Sparkles size={12} color="#c084fc" />
        </div>
      </div>

      {/* ── 2. Games List (Vertical Stack) ─────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

        {/* ══════════════════════════════════════════════════════════════════
            GAME 1: DAILY COMBO
        ══════════════════════════════════════════════════════════════════ */}
        <div
          style={{
            background: "linear-gradient(145deg, rgba(8, 16, 42, 0.88), rgba(4, 8, 24, 0.95))",
            border: "1.5px solid rgba(0, 242, 254, 0.35)",
            borderRadius: "22px",
            padding: "16px 14px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 242, 254, 0.15)",
            backdropFilter: "blur(16px)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Subtle Ambient Glow inside Card */}
          <div
            style={{
              position: "absolute",
              top: -30,
              right: -30,
              width: 140,
              height: 140,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(0, 242, 254, 0.25) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          {/* Top Row: Badge & Countdown */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "10px",
            }}
          >
            {/* DAILY Badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "linear-gradient(135deg, rgba(251, 191, 36, 0.25), rgba(245, 158, 11, 0.15))",
                border: "1px solid rgba(251, 191, 36, 0.5)",
                borderRadius: "12px",
                padding: "3px 10px",
                color: "#fbbf24",
                fontSize: "11px",
                fontWeight: 900,
                letterSpacing: "0.5px",
              }}
            >
              <Calendar size={13} />
              <span>DAILY</span>
            </div>

            {/* Countdown Badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "rgba(0, 242, 254, 0.12)",
                border: "1px solid rgba(0, 242, 254, 0.3)",
                borderRadius: "12px",
                padding: "3px 10px",
                color: "#00f2fe",
                fontSize: "11px",
                fontWeight: 800,
              }}
            >
              <Clock size={13} />
              <span>Resets in {timeLeft}</span>
            </div>
          </div>

          {/* Card Content Row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            {/* Left Column: Title, Description, and 3 Slots */}
            <div style={{ flex: 1 }}>
              <h2
                style={{
                  fontSize: "20px",
                  fontWeight: 900,
                  fontStyle: "italic",
                  margin: "0 0 4px",
                  letterSpacing: "0.5px",
                  background: "linear-gradient(135deg, #ffffff 40%, #00f2fe 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                DAILY COMBO
              </h2>

              <p
                style={{
                  color: "rgba(255, 255, 255, 0.7)",
                  fontSize: "11.5px",
                  lineHeight: "1.4",
                  margin: "0 0 10px",
                }}
              >
                Find the correct combination of <strong>3 cards</strong> and win GO coins every day!
              </p>

              {/* 3 Close-together Slots */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {[0, 1, 2].map((slotIdx) => {
                  const itemId = selectedIds[slotIdx];
                  const item = itemsList.find((i) => i.id === itemId);

                  return (
                    <div
                      key={slotIdx}
                      onClick={() => setIsComboModalOpen(true)}
                      style={{
                        width: "56px",
                        height: "64px",
                        borderRadius: "12px",
                        background: item
                          ? "linear-gradient(145deg, rgba(168, 85, 247, 0.3), rgba(0, 242, 254, 0.25))"
                          : "rgba(4, 7, 18, 0.85)",
                        border: item
                          ? "1.5px solid #00f2fe"
                          : "1.5px dashed rgba(0, 242, 254, 0.4)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: item ? "0 0 12px rgba(0, 242, 254, 0.4)" : "none",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {item ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          style={{
                            width: "36px",
                            height: "36px",
                            objectFit: "contain",
                            filter: "drop-shadow(0 0 6px rgba(0, 242, 254, 0.6))",
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            fontSize: "20px",
                            fontWeight: 900,
                            color: "#00f2fe",
                            filter: "drop-shadow(0 0 6px rgba(0, 242, 254, 0.6))",
                          }}
                        >
                          ?
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: High-Res Treasure Chest Asset */}
            <div
              style={{
                width: "90px",
                height: "90px",
                flexShrink: 0,
                borderRadius: "16px",
                overflow: "hidden",
                border: "1.5px solid rgba(0, 242, 254, 0.3)",
                boxShadow: "0 0 20px rgba(0, 242, 254, 0.35)",
                position: "relative",
                background: "rgba(5, 8, 22, 0.9)",
              }}
            >
              <img
                src="/games/combo_chest.jpg"
                alt="Treasure Chest"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  animation: "floatAnim 4s ease-in-out infinite",
                }}
              />
            </div>
          </div>

          {/* Bottom Row: Possible Rewards & Action Button */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              paddingTop: "10px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            {/* Possible Rewards */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: "11px", fontWeight: 700 }}>
                Possible Rewards:
              </span>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: "rgba(251, 191, 36, 0.15)",
                  border: "1px solid rgba(251, 191, 36, 0.35)",
                  borderRadius: "8px",
                  padding: "2px 6px",
                }}
              >
                <img src="/go.png" alt="GO" style={{ width: 14, height: 14, borderRadius: "50%" }} />
                <span style={{ color: "#fbbf24", fontWeight: 900, fontSize: "12px" }}>
                  1 - 6 GO
                </span>
              </div>
            </div>

            {/* Play Button */}
            <button
              onClick={() => setIsComboModalOpen(true)}
              style={{
                background: status?.rewardClaimed
                  ? "rgba(34, 197, 94, 0.2)"
                  : status?.attempted
                  ? "rgba(239, 68, 68, 0.2)"
                  : "linear-gradient(135deg, #00f2fe 0%, #0284c7 100%)",
                border: status?.rewardClaimed
                  ? "1px solid rgba(34, 197, 94, 0.5)"
                  : status?.attempted
                  ? "1px solid rgba(239, 68, 68, 0.5)"
                  : "1px solid rgba(0, 242, 254, 0.6)",
                color: status?.rewardClaimed
                  ? "#4ade80"
                  : status?.attempted
                  ? "#f87171"
                  : "#040714",
                fontWeight: 900,
                fontSize: "12.5px",
                letterSpacing: "0.5px",
                padding: "8px 16px",
                borderRadius: "12px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                boxShadow: !status?.attempted ? "0 0 16px rgba(0, 242, 254, 0.4)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              {status?.rewardClaimed ? (
                <>
                  <CheckCircle2 size={14} />
                  <span>CLAIMED</span>
                </>
              ) : status?.attempted ? (
                <>
                  <XCircle size={14} />
                  <span>ATTEMPTED</span>
                </>
              ) : (
                <>
                  <span>PLAY COMBO</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            GAME 2: SWORD ADVENTURE
        ══════════════════════════════════════════════════════════════════ */}
        <div
          style={{
            background: "linear-gradient(145deg, rgba(14, 10, 36, 0.9), rgba(5, 7, 22, 0.96))",
            border: "1.5px solid rgba(168, 85, 247, 0.4)",
            borderRadius: "22px",
            padding: "16px 14px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 24px rgba(168, 85, 247, 0.18)",
            backdropFilter: "blur(16px)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Subtle Ambient Glow */}
          <div
            style={{
              position: "absolute",
              top: -30,
              left: -30,
              width: 140,
              height: 140,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(168, 85, 247, 0.25) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          {/* Top Row: ACTION Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(236, 72, 153, 0.2))",
                border: "1px solid rgba(168, 85, 247, 0.5)",
                borderRadius: "12px",
                padding: "3px 10px",
                color: "#c084fc",
                fontSize: "11px",
                fontWeight: 900,
                letterSpacing: "0.5px",
              }}
            >
              <Swords size={13} />
              <span>ACTION</span>
            </div>

            {/* Live Indicator */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "rgba(34, 197, 94, 0.12)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "12px",
                padding: "3px 8px",
                color: "#4ade80",
                fontSize: "10.5px",
                fontWeight: 800,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#4ade80",
                  boxShadow: "0 0 6px #4ade80",
                }}
              />
              <span>PLAYABLE NOW</span>
            </div>
          </div>

          {/* Banner Artwork Preview */}
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "120px",
              borderRadius: "14px",
              overflow: "hidden",
              marginBottom: "10px",
              border: "1px solid rgba(0, 242, 254, 0.25)",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
            }}
          >
            <img
              src="/games/sword_adventure_banner.jpg"
              alt="Sword Adventure Banner"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            {/* Gradient Overlay */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to top, rgba(4, 7, 20, 0.85) 0%, rgba(4, 7, 20, 0.1) 60%, transparent 100%)",
              }}
            />
          </div>

          {/* Title & Description */}
          <h2
            style={{
              fontSize: "20px",
              fontWeight: 900,
              fontStyle: "italic",
              margin: "0 0 4px",
              letterSpacing: "0.5px",
              background: "linear-gradient(135deg, #ffffff 40%, #c084fc 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            SWORD ADVENTURE
          </h2>

          <p
            style={{
              color: "rgba(255, 255, 255, 0.7)",
              fontSize: "11.5px",
              lineHeight: "1.4",
              margin: "0 0 10px",
            }}
          >
            Control the hero, defeat enemies, avoid obstacles and collect GO coins on the way! You will earn <strong>0.05 GO</strong> for each enemy you defeat.
          </p>

          {/* Feature Pills */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexWrap: "wrap",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                background: "rgba(0, 242, 254, 0.08)",
                border: "1px solid rgba(0, 242, 254, 0.25)",
                borderRadius: "8px",
                padding: "3px 8px",
                fontSize: "10.5px",
                fontWeight: 700,
                color: "#00f2fe",
              }}
            >
              ⚔️ Fight Enemies
            </div>
            <div
              style={{
                background: "rgba(168, 85, 247, 0.08)",
                border: "1px solid rgba(168, 85, 247, 0.25)",
                borderRadius: "8px",
                padding: "3px 8px",
                fontSize: "10.5px",
                fontWeight: 700,
                color: "#c084fc",
              }}
            >
              ⚡ Avoid Obstacles
            </div>
            <div
              style={{
                background: "rgba(251, 191, 36, 0.08)",
                border: "1px solid rgba(251, 191, 36, 0.25)",
                borderRadius: "8px",
                padding: "3px 8px",
                fontSize: "10.5px",
                fontWeight: 700,
                color: "#fbbf24",
              }}
            >
              🪙 Earn GO
            </div>
          </div>

          {/* Bottom Row: Reward Rate & Play Now Button */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              paddingTop: "10px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            {/* Reward per enemy */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: "11px", fontWeight: 700 }}>
                Reward per enemy:
              </span>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: "rgba(251, 191, 36, 0.15)",
                  border: "1px solid rgba(251, 191, 36, 0.35)",
                  borderRadius: "8px",
                  padding: "2px 6px",
                }}
              >
                <img src="/go.png" alt="GO" style={{ width: 14, height: 14, borderRadius: "50%" }} />
                <span style={{ color: "#fbbf24", fontWeight: 900, fontSize: "12px" }}>
                  0.05 GO
                </span>
              </div>
            </div>

            {/* PLAY NOW Button */}
            <button
              onClick={() => setIsSwordGameOpen(true)}
              style={{
                background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 50%, #00f2fe 100%)",
                border: "1px solid rgba(168, 85, 247, 0.6)",
                color: "#ffffff",
                fontWeight: 900,
                fontSize: "12.5px",
                letterSpacing: "0.5px",
                padding: "8px 18px",
                borderRadius: "12px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                boxShadow: "0 0 20px rgba(168, 85, 247, 0.5)",
                transition: "all 0.2s ease",
              }}
            >
              <span>PLAY NOW</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 3. Interactive Daily Combo Selection Modal ──────────────────── */}
      {isComboModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(14px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setIsComboModalOpen(false)}
        >
          <div
            style={{
              background: "linear-gradient(145deg, rgba(8, 16, 40, 0.98), rgba(4, 7, 20, 0.99))",
              border: "1.5px solid rgba(0, 242, 254, 0.4)",
              borderRadius: "24px",
              padding: "20px 16px",
              maxWidth: "360px",
              width: "100%",
              boxShadow: "0 0 40px rgba(0, 242, 254, 0.35)",
              animation: "popIn 0.25s ease",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Sparkles size={16} color="#00f2fe" />
                <h3 style={{ fontSize: "16px", fontWeight: 900, margin: 0, color: "#ffffff" }}>
                  DAILY COMBO
                </h3>
              </div>

              <button
                onClick={() => setIsComboModalOpen(false)}
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  border: "none",
                  borderRadius: "50%",
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  cursor: "pointer",
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Status & Attempt Info */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
                fontSize: "11px",
                fontWeight: 800,
              }}
            >
              <div style={{ color: "#93c5fd", display: "flex", alignItems: "center", gap: 4 }}>
                <Clock size={12} color="#00f2fe" />
                <span>Next in {timeLeft}</span>
              </div>
              <div
                style={{
                  color: status?.attempted ? "#f87171" : "#4ade80",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <ShieldCheck size={12} />
                <span>{status?.attempted ? "0 / 1 Attempts Left" : "1 / 1 Attempts Left"}</span>
              </div>
            </div>

            {/* 3 Chosen Slots */}
            <div
              style={{
                background: "rgba(4, 7, 18, 0.8)",
                border: "1px solid rgba(0, 242, 254, 0.25)",
                borderRadius: "16px",
                padding: "10px 8px",
                marginBottom: "14px",
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "8px",
              }}
            >
              {[0, 1, 2].map((slotIdx) => {
                const itemId = selectedIds[slotIdx];
                const item = itemsList.find((i) => i.id === itemId);

                return (
                  <div
                    key={slotIdx}
                    onClick={() => itemId && handleSelectItem(itemId)}
                    style={{
                      height: "76px",
                      borderRadius: "12px",
                      background: item
                        ? "linear-gradient(145deg, rgba(168, 85, 247, 0.25), rgba(0, 242, 254, 0.2))"
                        : "rgba(2, 4, 12, 0.8)",
                      border: item
                        ? "1.5px solid #00f2fe"
                        : "1.5px dashed rgba(0, 242, 254, 0.3)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: item && !status?.attempted ? "pointer" : "default",
                      boxShadow: item ? "0 0 12px rgba(0, 242, 254, 0.3)" : "none",
                    }}
                  >
                    {item ? (
                      <>
                        <img
                          src={item.image}
                          alt={item.name}
                          style={{ width: "36px", height: "36px", objectFit: "contain", marginBottom: "2px" }}
                        />
                        <span
                          style={{
                            fontSize: "9.5px",
                            fontWeight: 800,
                            color: "#e2e8f0",
                            maxWidth: "90%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.name}
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: "18px", fontWeight: 900, color: "rgba(0, 242, 254, 0.4)" }}>
                        {slotIdx + 1}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Selectable Items Grid (5 Items) */}
            <div style={{ marginBottom: "14px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "rgba(255, 255, 255, 0.7)",
                  marginBottom: "8px",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Select 3 Cards ({selectedIds.length}/3)</span>
                <span style={{ color: "#00f2fe" }}>Tap to select</span>
              </div>

              {/* 5 Items: Top row has 3 items, bottom row has 2 centered */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(6, 1fr)",
                  gap: "6px",
                }}
              >
                {/* Top Row: 3 items */}
                {itemsList.slice(0, 3).map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  const isFull = selectedIds.length >= 3 && !isSelected;

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectItem(item.id)}
                      style={{
                        gridColumn: "span 2",
                        background: isSelected
                          ? "linear-gradient(145deg, rgba(8, 20, 50, 0.95), rgba(168, 85, 247, 0.35))"
                          : "rgba(8, 14, 32, 0.85)",
                        border: isSelected
                          ? "2px solid #00f2fe"
                          : "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "14px",
                        padding: "8px 4px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: status?.attempted ? "default" : isFull ? "not-allowed" : "pointer",
                        opacity: isFull ? 0.45 : 1,
                        boxShadow: isSelected ? "0 0 14px rgba(0, 242, 254, 0.4)" : "none",
                      }}
                    >
                      <img
                        src={item.image}
                        alt={item.name}
                        style={{ width: "40px", height: "40px", objectFit: "contain", marginBottom: "3px" }}
                      />
                      <span
                        style={{
                          color: isSelected ? "#00f2fe" : "#ffffff",
                          fontSize: "10px",
                          fontWeight: 800,
                          maxWidth: "94%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.name}
                      </span>
                    </div>
                  );
                })}

                {/* Bottom Row: Spacer + 2 items + Spacer */}
                <div style={{ gridColumn: "span 1" }} />
                {itemsList.slice(3, 5).map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  const isFull = selectedIds.length >= 3 && !isSelected;

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectItem(item.id)}
                      style={{
                        gridColumn: "span 2",
                        background: isSelected
                          ? "linear-gradient(145deg, rgba(8, 20, 50, 0.95), rgba(168, 85, 247, 0.35))"
                          : "rgba(8, 14, 32, 0.85)",
                        border: isSelected
                          ? "2px solid #00f2fe"
                          : "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "14px",
                        padding: "8px 4px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: status?.attempted ? "default" : isFull ? "not-allowed" : "pointer",
                        opacity: isFull ? 0.45 : 1,
                        boxShadow: isSelected ? "0 0 14px rgba(0, 242, 254, 0.4)" : "none",
                      }}
                    >
                      <img
                        src={item.image}
                        alt={item.name}
                        style={{ width: "40px", height: "40px", objectFit: "contain", marginBottom: "3px" }}
                      />
                      <span
                        style={{
                          color: isSelected ? "#00f2fe" : "#ffffff",
                          fontSize: "10px",
                          fontWeight: 800,
                          maxWidth: "94%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.name}
                      </span>
                    </div>
                  );
                })}
                <div style={{ gridColumn: "span 1" }} />
              </div>
            </div>

            {/* Warning / Error Message */}
            {warningMsg && (
              <div
                style={{
                  padding: "8px",
                  borderRadius: "10px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#f87171",
                  fontSize: "11px",
                  fontWeight: 800,
                  textAlign: "center",
                  marginBottom: "10px",
                }}
              >
                ⚠️ {warningMsg}
              </div>
            )}

            {/* Action Check Button */}
            {status?.rewardClaimed ? (
              <div
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "14px",
                  background: "rgba(34, 197, 94, 0.15)",
                  border: "1px solid rgba(34, 197, 94, 0.4)",
                  color: "#4ade80",
                  fontWeight: 900,
                  fontSize: "13px",
                  textAlign: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <CheckCircle2 size={16} />
                <span>🎉 +5 GO CLAIMED TODAY</span>
              </div>
            ) : status?.attempted ? (
              <div
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "14px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#f87171",
                  fontWeight: 900,
                  fontSize: "13px",
                  textAlign: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <XCircle size={16} />
                <span>ATTEMPT USED TODAY (Next in {timeLeft})</span>
              </div>
            ) : (
              <button
                onClick={handleCheckCombo}
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "14px",
                  background:
                    selectedIds.length === 3
                      ? "linear-gradient(135deg, #00f2fe 0%, #4facfe 50%, #7c3aed 100%)"
                      : "rgba(255, 255, 255, 0.08)",
                  border:
                    selectedIds.length === 3
                      ? "1px solid rgba(0, 242, 254, 0.6)"
                      : "1px solid rgba(255, 255, 255, 0.05)",
                  color: selectedIds.length === 3 ? "#040714" : "rgba(255, 255, 255, 0.4)",
                  fontWeight: 900,
                  fontSize: "14px",
                  letterSpacing: "0.5px",
                  cursor: submitting ? "not-allowed" : "pointer",
                  boxShadow:
                    selectedIds.length === 3
                      ? "0 4px 20px rgba(0, 242, 254, 0.4)"
                      : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                {submitting ? (
                  <span>Checking...</span>
                ) : (
                  <>
                    <Zap size={16} />
                    <span>CHECK COMBO ({selectedIds.length}/3)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 4. Combo Result Alert Modal ─────────────────────────────────── */}
      {resultModal && resultModal.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 150,
            background: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setResultModal(null)}
        >
          <div
            style={{
              background: "rgba(10, 16, 36, 0.95)",
              border: resultModal.isSuccess
                ? "2px solid #00f2fe"
                : "2px solid #ef4444",
              borderRadius: "24px",
              padding: "28px 20px",
              maxWidth: "320px",
              width: "100%",
              textAlign: "center",
              boxShadow: resultModal.isSuccess
                ? "0 0 40px rgba(0, 242, 254, 0.4)"
                : "0 0 40px rgba(239, 68, 68, 0.4)",
              animation: "popIn 0.3s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: resultModal.isSuccess
                  ? "rgba(0, 242, 254, 0.15)"
                  : "rgba(239, 68, 68, 0.15)",
                border: resultModal.isSuccess
                  ? "2px solid #00f2fe"
                  : "2px solid #ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 14px",
                fontSize: "32px",
              }}
            >
              {resultModal.isSuccess ? "🎉" : "❌"}
            </div>

            <h3
              style={{
                fontSize: "18px",
                fontWeight: 900,
                color: resultModal.isSuccess ? "#00f2fe" : "#f87171",
                margin: "0 0 6px",
              }}
            >
              {resultModal.isSuccess ? "COMBO SOLVED!" : "INCORRECT COMBO"}
            </h3>

            <p
              style={{
                color: "rgba(255, 255, 255, 0.7)",
                fontSize: "13px",
                margin: "0 0 18px",
                lineHeight: 1.4,
              }}
            >
              {resultModal.message}
            </p>

            <button
              onClick={() => setResultModal(null)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "12px",
                background: resultModal.isSuccess
                  ? "linear-gradient(135deg, #00f2fe, #7c3aed)"
                  : "rgba(255, 255, 255, 0.1)",
                border: "none",
                color: resultModal.isSuccess ? "#040714" : "#ffffff",
                fontWeight: 900,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── 5. Full-Screen Interactive Sword Adventure Game ────────────── */}
      {isSwordGameOpen && (
        <SwordAdventureGame onClose={() => setIsSwordGameOpen(false)} />
      )}
    </div>
  );
}
