import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { api, ComboStatus, ComboItem } from "../lib/api";
import { useUser } from "../lib/userContext";
import {
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  ShieldCheck,
} from "lucide-react";

export default function ComboPage() {
  const [, setLocation] = useLocation();
  const { user, refresh } = useUser();

  const [status, setStatus] = useState<ComboStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [resultModal, setResultModal] = useState<{
    open: boolean;
    isSuccess: boolean;
    message: string;
  } | null>(null);

  // Countdown string
  const [timeLeft, setTimeLeft] = useState<string>("00:00:00");

  const loadStatus = async () => {
    try {
      setLoading(true);
      const data = await api.getComboStatus();
      setStatus(data);
      if (data.attempted && data.selectedItems) {
        setSelectedIds(data.selectedItems);
      }
    } catch (err) {
      console.error("Failed to load combo status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // Update countdown timer
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
    if (status?.attempted) return; // Locked if already attempted

    if (selectedIds.includes(id)) {
      // Remove item
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    } else {
      // Add if < 3
      if (selectedIds.length < 3) {
        setSelectedIds((prev) => [...prev, id]);
      }
    }
  };

  const [warningMsg, setWarningMsg] = useState<string | null>(null);

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

  const renderActionButton = () => {
    if (status?.rewardClaimed) {
      return (
        <div
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: "18px",
            background: "rgba(34, 197, 94, 0.15)",
            border: "1px solid rgba(34, 197, 94, 0.4)",
            color: "#4ade80",
            fontWeight: 900,
            fontSize: "15px",
            textAlign: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <CheckCircle2 size={20} />
          <span>🎉 +5 GO CLAIMED TODAY (Next in {timeLeft})</span>
        </div>
      );
    }

    if (status?.attempted) {
      return (
        <div
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: "18px",
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            color: "#f87171",
            fontWeight: 900,
            fontSize: "15px",
            textAlign: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <XCircle size={20} />
          <span>ATTEMPT USED TODAY (Next in {timeLeft})</span>
        </div>
      );
    }

    return (
      <button
        onClick={handleCheckCombo}
        disabled={submitting}
        style={{
          width: "100%",
          padding: "16px",
          borderRadius: "18px",
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
          fontSize: "16px",
          letterSpacing: "0.5px",
          cursor: submitting ? "not-allowed" : "pointer",
          boxShadow:
            selectedIds.length === 3
              ? "0 8px 30px rgba(0, 242, 254, 0.4), 0 0 15px rgba(124, 58, 237, 0.3)"
              : "none",
          transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
        }}
      >
        {submitting ? (
          <span>Checking...</span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <Zap size={18} />
            <span>⚡ CHECK COMBO ({selectedIds.length}/3)</span>
          </span>
        )}
      </button>
    );
  };

  const renderResultModal = () => {
    if (!resultModal || !resultModal.open) return null;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
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
            borderRadius: "28px",
            padding: "32px 24px",
            maxWidth: "340px",
            width: "100%",
            textAlign: "center",
            boxShadow: resultModal.isSuccess
              ? "0 0 50px rgba(0, 242, 254, 0.4)"
              : "0 0 50px rgba(239, 68, 68, 0.4)",
            animation: "popIn 0.3s ease",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
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
              margin: "0 auto 16px",
              fontSize: "36px",
            }}
          >
            {resultModal.isSuccess ? "🎉" : "❌"}
          </div>

          <h3
            style={{
              fontSize: "20px",
              fontWeight: 900,
              color: resultModal.isSuccess ? "#00f2fe" : "#f87171",
              margin: "0 0 8px",
            }}
          >
            {resultModal.isSuccess ? "COMBO SOLVED!" : "INCORRECT COMBO"}
          </h3>

          <p
            style={{
              color: "rgba(255, 255, 255, 0.7)",
              fontSize: "14px",
              margin: "0 0 20px",
              lineHeight: 1.5,
            }}
          >
            {resultModal.message}
          </p>

          <button
            onClick={() => setResultModal(null)}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "14px",
              background: resultModal.isSuccess
                ? "linear-gradient(135deg, #00f2fe, #7c3aed)"
                : "rgba(255, 255, 255, 0.1)",
              border: "none",
              color: resultModal.isSuccess ? "#040714" : "#ffffff",
              fontWeight: 900,
              fontSize: "15px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at 50% 10%, #0d1428 0%, #040714 100%)",
        color: "#ffffff",
        paddingBottom: "110px",
        paddingTop: "16px",
        paddingLeft: "16px",
        paddingRight: "16px",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @keyframes comboGlow {
          0%,100% { box-shadow: 0 0 20px rgba(0, 242, 254, 0.3), inset 0 0 15px rgba(168, 85, 247, 0.2); }
          50%      { box-shadow: 0 0 35px rgba(0, 242, 254, 0.6), inset 0 0 25px rgba(168, 85, 247, 0.4); }
        }
        @keyframes popIn {
          0% { transform: scale(0.9); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* ── Top Header ────────────────────────────────────────────────── */}
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(0, 242, 254, 0.1)",
            border: "1px solid rgba(0, 242, 254, 0.3)",
            padding: "4px 12px",
            borderRadius: "20px",
            fontSize: "11px",
            fontWeight: 800,
            color: "#00f2fe",
            letterSpacing: "1px",
            marginBottom: "8px",
            textTransform: "uppercase",
          }}
        >
          <Sparkles size={12} />
          DAILY REWARD EVENT
        </div>

        <h1
          style={{
            fontSize: "26px",
            fontWeight: 900,
            letterSpacing: "-0.5px",
            margin: "0 0 4px",
            background: "linear-gradient(135deg, #ffffff 40%, #00f2fe 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          DAILY COMBO
        </h1>

        <p
          style={{
            color: "rgba(255, 255, 255, 0.6)",
            fontSize: "13px",
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          Select the 3 correct catalysts to win <strong style={{ color: "#fbbf24" }}>+5 GO</strong>
        </p>

        {/* ── Status Bar: Countdown & Attempt ───────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            marginTop: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(8, 14, 32, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "12px",
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: 700,
              color: "#93c5fd",
            }}
          >
            <Clock size={14} className="text-cyan-400" />
            <span>{timeLeft}</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: status?.attempted ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
              border: status?.attempted ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid rgba(34, 197, 94, 0.4)",
              borderRadius: "12px",
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: 700,
              color: status?.attempted ? "#f87171" : "#4ade80",
            }}
          >
            <ShieldCheck size={14} />
            <span>{status?.attempted ? "0 / 1 Attempts Left" : "1 / 1 Attempts Left"}</span>
          </div>
        </div>
      </div>

      {/* ── 3 Selected Slots (Top Cards) ──────────────────────────────── */}
      <div
        style={{
          background: "rgba(10, 16, 36, 0.6)",
          border: "1px solid rgba(0, 242, 254, 0.2)",
          borderRadius: "24px",
          padding: "16px 12px",
          marginBottom: "24px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "10px",
          }}
        >
          {[0, 1, 2].map((slotIndex) => {
            const itemId = selectedIds[slotIndex];
            const item = itemsList.find((i) => i.id === itemId);

            return (
              <div
                key={slotIndex}
                onClick={() => itemId && handleSelectItem(itemId)}
                style={{
                  height: "115px",
                  borderRadius: "18px",
                  background: item
                    ? "linear-gradient(145deg, rgba(168, 85, 247, 0.25), rgba(0, 242, 254, 0.15))"
                    : "rgba(6, 10, 24, 0.7)",
                  border: item
                    ? "1.5px solid rgba(0, 242, 254, 0.6)"
                    : "1.5px dashed rgba(255, 255, 255, 0.15)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  cursor: item && !status?.attempted ? "pointer" : "default",
                  transition: "all 0.25s ease",
                  boxShadow: item ? "0 4px 20px rgba(0, 242, 254, 0.25)" : "none",
                  animation: item ? "popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
                }}
              >
                {item ? (
                  <>
                    <img
                      src={item.image}
                      alt={item.name}
                      style={{
                        width: "60px",
                        height: "60px",
                        objectFit: "contain",
                        filter: "drop-shadow(0 0 10px rgba(0, 242, 254, 0.5))",
                        marginBottom: "4px",
                      }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 800,
                        color: "#e2e8f0",
                        textAlign: "center",
                        maxWidth: "90%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.name}
                    </span>
                    {!status?.attempted && (
                      <div
                        style={{
                          position: "absolute",
                          top: "4px",
                          right: "4px",
                          width: "18px",
                          height: "18px",
                          borderRadius: "50%",
                          background: "rgba(239, 68, 68, 0.8)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "10px",
                          color: "#fff",
                          fontWeight: 900,
                        }}
                      >
                        ✕
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                      color: "rgba(255, 255, 255, 0.25)",
                    }}
                  >
                    <span style={{ fontSize: "28px", fontWeight: 900, fontFamily: "monospace" }}>
                      {slotIndex + 1}
                    </span>
                    <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.5px" }}>
                      EMPTY
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 5 Selectable Items Grid ───────────────────────────────────── */}
      <div style={{ marginBottom: "24px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
            paddingLeft: "4px",
          }}
        >
          <span
            style={{
              color: "rgba(255, 255, 255, 0.75)",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
            }}
          >
            Available Catalysts ({selectedIds.length}/3)
          </span>
          <span style={{ color: "#00f2fe", fontSize: "11px", fontWeight: 700 }}>
            Tap to select / unselect
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "12px",
          }}
        >
          {itemsList.map((item, idx) => {
            const isSelected = selectedIds.includes(item.id);
            const selectIndex = selectedIds.indexOf(item.id) + 1;
            const isFull = selectedIds.length >= 3 && !isSelected;

            return (
              <div
                key={item.id}
                onClick={() => handleSelectItem(item.id)}
                style={{
                  background: isSelected
                    ? "linear-gradient(145deg, rgba(8, 18, 48, 0.95), rgba(168, 85, 247, 0.3))"
                    : "rgba(8, 14, 32, 0.72)",
                  border: isSelected
                    ? "2px solid #00f2fe"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "20px",
                  padding: "14px 10px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  position: "relative",
                  cursor: status?.attempted ? "default" : isFull ? "not-allowed" : "pointer",
                  opacity: isFull ? 0.5 : 1,
                  transition: "all 0.25s ease",
                  boxShadow: isSelected
                    ? "0 0 24px rgba(0, 242, 254, 0.35), inset 0 0 16px rgba(0, 242, 254, 0.15)"
                    : "0 6px 20px rgba(0, 0, 0, 0.3)",
                  gridColumn: idx === 4 ? "span 2" : "span 1",
                  maxWidth: idx === 4 ? "50%" : "100%",
                  margin: idx === 4 ? "0 auto" : "0",
                  width: idx === 4 ? "100%" : "auto",
                  boxSizing: "border-box",
                }}
              >
                {/* Selected Badge */}
                {isSelected && (
                  <div
                    style={{
                      position: "absolute",
                      top: "8px",
                      left: "8px",
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #00f2fe, #a855f7)",
                      color: "#000",
                      fontWeight: 900,
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 0 10px rgba(0, 242, 254, 0.8)",
                    }}
                  >
                    {selectIndex}
                  </div>
                )}

                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "8px",
                  }}
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      filter: isSelected
                        ? "drop-shadow(0 0 14px rgba(0, 242, 254, 0.8))"
                        : "drop-shadow(0 4px 10px rgba(0, 0, 0, 0.5))",
                      transition: "all 0.3s ease",
                    }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>

                <span
                  style={{
                    color: isSelected ? "#00f2fe" : "#ffffff",
                    fontSize: "13px",
                    fontWeight: 800,
                    marginBottom: "2px",
                    textAlign: "center",
                  }}
                >
                  {item.name}
                </span>

                <span
                  style={{
                    color: "rgba(255, 255, 255, 0.45)",
                    fontSize: "10px",
                    textAlign: "center",
                    lineHeight: 1.2,
                  }}
                >
                  {item.description}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Check Button ──────────────────────────────────────────────── */}
      <div style={{ marginTop: "16px" }}>
        {warningMsg && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "12px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#f87171",
              fontSize: "12px",
              fontWeight: 800,
              textAlign: "center",
              marginBottom: "10px",
              animation: "popIn 0.2s ease",
            }}
          >
            ⚠️ {warningMsg}
          </div>
        )}

        {renderActionButton()}
      </div>

      {/* ── Result Modal ──────────────────────────────────────────────── */}
      {renderResultModal()}
    </div>
  );
}
