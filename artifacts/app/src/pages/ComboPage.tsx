import { useState, useEffect } from "react";
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
  const { refresh } = useUser();

  const [status, setStatus] = useState<ComboStatus | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [resultModal, setResultModal] = useState<{
    open: boolean;
    isSuccess: boolean;
    message: string;
  } | null>(null);

  // Countdown string
  const [timeLeft, setTimeLeft] = useState<string>("00:00:00");

  const loadStatus = async () => {
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

  const renderActionButton = () => {
    if (status?.rewardClaimed) {
      return (
        <div
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "16px",
            background: "rgba(34, 197, 94, 0.15)",
            border: "1px solid rgba(34, 197, 94, 0.4)",
            color: "#4ade80",
            fontWeight: 900,
            fontSize: "14px",
            textAlign: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <CheckCircle2 size={18} />
          <span>🎉 +5 GO CLAIMED TODAY (Next in {timeLeft})</span>
        </div>
      );
    }

    if (status?.attempted) {
      return (
        <div
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "16px",
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            color: "#f87171",
            fontWeight: 900,
            fontSize: "14px",
            textAlign: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <XCircle size={18} />
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
          padding: "14px",
          borderRadius: "16px",
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
          fontSize: "15px",
          letterSpacing: "0.5px",
          cursor: submitting ? "not-allowed" : "pointer",
          boxShadow:
            selectedIds.length === 3
              ? "0 6px 25px rgba(0, 242, 254, 0.4), 0 0 12px rgba(124, 58, 237, 0.3)"
              : "none",
          transition: "all 0.25s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
        }}
      >
        {submitting ? (
          <span>Checking...</span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Zap size={16} />
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
    );
  };

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        color: "#ffffff",
        paddingTop: "6px",
        paddingBottom: "85px",
        paddingLeft: "14px",
        paddingRight: "14px",
        boxSizing: "border-box",
        overflowY: "auto",
      }}
    >
      <style>{`
        @keyframes popIn {
          0% { transform: scale(0.92); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* ── Compact Header (Pushed to Top) ────────────────────────────── */}
      <div style={{ textAlign: "center", marginBottom: "10px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            background: "rgba(0, 242, 254, 0.1)",
            border: "1px solid rgba(0, 242, 254, 0.25)",
            padding: "2px 10px",
            borderRadius: "16px",
            fontSize: "10px",
            fontWeight: 800,
            color: "#00f2fe",
            letterSpacing: "0.8px",
            marginBottom: "4px",
            textTransform: "uppercase",
          }}
        >
          <Sparkles size={11} />
          DAILY REWARD EVENT
        </div>

        <h1
          style={{
            fontSize: "22px",
            fontWeight: 900,
            letterSpacing: "-0.5px",
            margin: "0 0 2px",
            background: "linear-gradient(135deg, #ffffff 40%, #00f2fe 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          ✨ DAILY COMBO
        </h1>

        <p
          style={{
            color: "rgba(255, 255, 255, 0.65)",
            fontSize: "12px",
            margin: "0 0 8px",
          }}
        >
          Pick 3 correct items to win <strong style={{ color: "#fbbf24", fontWeight: 900 }}>+5 GO</strong>
        </p>

        {/* ── Status Bar: Countdown & Attempt ───────────────────────────── */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              background: "rgba(8, 14, 32, 0.85)",
              border: "1px solid rgba(0, 242, 254, 0.25)",
              borderRadius: "10px",
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: 800,
              color: "#93c5fd",
            }}
          >
            <Clock size={12} className="text-cyan-400" />
            <span>Next in {timeLeft}</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              background: status?.attempted ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
              border: status?.attempted ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid rgba(34, 197, 94, 0.4)",
              borderRadius: "10px",
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: 800,
              color: status?.attempted ? "#f87171" : "#4ade80",
            }}
          >
            <ShieldCheck size={12} />
            <span>{status?.attempted ? "0 / 1 Attempts Left" : "1 / 1 Attempts Left"}</span>
          </div>
        </div>
      </div>

      {/* ── 3 Selected Slots (Elevated Top Box) ───────────────────────── */}
      <div
        style={{
          background: "rgba(8, 14, 32, 0.75)",
          border: "1px solid rgba(0, 242, 254, 0.25)",
          borderRadius: "18px",
          padding: "10px 8px",
          marginBottom: "12px",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "8px",
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
                  height: "86px",
                  borderRadius: "14px",
                  background: item
                    ? "linear-gradient(145deg, rgba(168, 85, 247, 0.22), rgba(0, 242, 254, 0.18))"
                    : "rgba(4, 7, 18, 0.8)",
                  border: item
                    ? "1.5px solid #00f2fe"
                    : "1.5px dashed rgba(0, 242, 254, 0.35)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  cursor: item && !status?.attempted ? "pointer" : "default",
                  transition: "all 0.2s ease",
                  boxShadow: item ? "0 0 16px rgba(0, 242, 254, 0.3)" : "none",
                  animation: item ? "popIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
                }}
              >
                {item ? (
                  <>
                    <img
                      src={item.image}
                      alt={item.name}
                      style={{
                        width: "44px",
                        height: "44px",
                        objectFit: "contain",
                        filter: "drop-shadow(0 0 8px rgba(0, 242, 254, 0.6))",
                        marginBottom: "2px",
                      }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 800,
                        color: "#e2e8f0",
                        textAlign: "center",
                        maxWidth: "92%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.name}
                    </span>
                  </>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "2px",
                      color: "rgba(0, 242, 254, 0.4)",
                    }}
                  >
                    <span style={{ fontSize: "22px", fontWeight: 900, fontFamily: "monospace" }}>
                      {slotIndex + 1}
                    </span>
                    <span style={{ fontSize: "8px", fontWeight: 800, letterSpacing: "0.5px" }}>
                      EMPTY
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 5 Selectable Items Grid (3 Top + 2 Centered Bottom) ──────── */}
      <div style={{ marginBottom: "14px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "8px",
            paddingLeft: "2px",
            paddingRight: "2px",
          }}
        >
          <span
            style={{
              color: "rgba(255, 255, 255, 0.8)",
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}
          >
            اختر 3 عناصر ({selectedIds.length}/3)
          </span>
          <span style={{ color: "#00f2fe", fontSize: "10px", fontWeight: 700 }}>
            اضغط للاختيار
          </span>
        </div>

        {/* 6-column grid: Row 1 has 3 items (span 2 each), Row 2 has 2 items centered (span 2 each, flanked by 1 col space) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: "8px",
          }}
        >
          {/* Top Row: Item 1, 2, 3 */}
          {itemsList.slice(0, 3).map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const selectIndex = selectedIds.indexOf(item.id) + 1;
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
                  borderRadius: "16px",
                  padding: "10px 4px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  cursor: status?.attempted ? "default" : isFull ? "not-allowed" : "pointer",
                  opacity: isFull ? 0.45 : 1,
                  transition: "all 0.2s ease",
                  boxShadow: isSelected
                    ? "0 0 18px rgba(0, 242, 254, 0.4), inset 0 0 10px rgba(0, 242, 254, 0.2)"
                    : "0 4px 12px rgba(0, 0, 0, 0.3)",
                  boxSizing: "border-box",
                }}
              >
                {isSelected && (
                  <div
                    style={{
                      position: "absolute",
                      top: "5px",
                      left: "5px",
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #00f2fe, #a855f7)",
                      color: "#000",
                      fontWeight: 900,
                      fontSize: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 0 8px rgba(0, 242, 254, 0.8)",
                    }}
                  >
                    {selectIndex}
                  </div>
                )}

                <div
                  style={{
                    width: "52px",
                    height: "52px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "4px",
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
                        ? "drop-shadow(0 0 10px rgba(0, 242, 254, 0.8))"
                        : "drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6))",
                    }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>

                <span
                  style={{
                    color: isSelected ? "#00f2fe" : "#ffffff",
                    fontSize: "10.5px",
                    fontWeight: 800,
                    textAlign: "center",
                    maxWidth: "96%",
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

          {/* Bottom Row: Spacer + Item 4 + Item 5 + Spacer */}
          <div style={{ gridColumn: "span 1" }} />
          {itemsList.slice(3, 5).map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const selectIndex = selectedIds.indexOf(item.id) + 1;
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
                  borderRadius: "16px",
                  padding: "10px 4px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  cursor: status?.attempted ? "default" : isFull ? "not-allowed" : "pointer",
                  opacity: isFull ? 0.45 : 1,
                  transition: "all 0.2s ease",
                  boxShadow: isSelected
                    ? "0 0 18px rgba(0, 242, 254, 0.4), inset 0 0 10px rgba(0, 242, 254, 0.2)"
                    : "0 4px 12px rgba(0, 0, 0, 0.3)",
                  boxSizing: "border-box",
                }}
              >
                {isSelected && (
                  <div
                    style={{
                      position: "absolute",
                      top: "5px",
                      left: "5px",
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #00f2fe, #a855f7)",
                      color: "#000",
                      fontWeight: 900,
                      fontSize: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 0 8px rgba(0, 242, 254, 0.8)",
                    }}
                  >
                    {selectIndex}
                  </div>
                )}

                <div
                  style={{
                    width: "52px",
                    height: "52px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "4px",
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
                        ? "drop-shadow(0 0 10px rgba(0, 242, 254, 0.8))"
                        : "drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6))",
                    }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>

                <span
                  style={{
                    color: isSelected ? "#00f2fe" : "#ffffff",
                    fontSize: "10.5px",
                    fontWeight: 800,
                    textAlign: "center",
                    maxWidth: "96%",
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

      {/* ── Check Button Section ──────────────────────────────────────── */}
      <div style={{ marginTop: "4px", marginBottom: "16px" }}>
        {warningMsg && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: "10px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#f87171",
              fontSize: "11px",
              fontWeight: 800,
              textAlign: "center",
              marginBottom: "8px",
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
