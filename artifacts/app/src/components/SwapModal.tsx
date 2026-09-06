import { useState, useEffect } from "react";
import { useUser } from "../lib/userContext";
import { api, swapGramToGo, swapGoToGram } from "../lib/api";
import {
  ArrowDownUp,
  X,
  Loader2,
  CheckCircle2,
  Sparkles,
  Zap,
} from "lucide-react";

interface SwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "GRAM_TO_GO" | "GO_TO_GRAM";
  onSuccess?: () => void;
}

export default function SwapModal({ isOpen, onClose, initialMode = "GRAM_TO_GO", onSuccess }: SwapModalProps) {
  const { user, refresh } = useUser();
  const [mode, setMode] = useState<"GRAM_TO_GO" | "GO_TO_GRAM">(initialMode);
  const [amount, setAmount] = useState<string>("");
  const [swapping, setSwapping] = useState<boolean>(false);
  const [rate, setRate] = useState<number>(800); // 1 GRAM = 800 GO
  const [error, setError] = useState<string>("");
  const [successResult, setSuccessResult] = useState<{
    fromAmount: string;
    toAmount: string;
    fromSymbol: string;
    toSymbol: string;
  } | null>(null);

  // Fetch dynamic rate from server config
  useEffect(() => {
    api.getConfig()
      .then((cfg) => {
        if (cfg.gramToGoRate && cfg.gramToGoRate > 0) {
          setRate(cfg.gramToGoRate);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setError("");
      setSuccessResult(null);
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const gramBalance = Math.max(0, parseFloat(user?.gramBalance || "0"));
  const goBalance = Math.max(0, parseFloat(user?.goBalance || user?.balance || "0"));

  const isGramToGo = mode === "GRAM_TO_GO";
  const sourceBalance = isGramToGo ? gramBalance : goBalance;
  const inputAmt = parseFloat(amount) || 0;

  // Output calculated using rate
  const calculatedOutput = isGramToGo
    ? (inputAmt * rate).toFixed(4)
    : (inputAmt / rate).toFixed(6);

  const toggleDirection = () => {
    setMode((prev) => (prev === "GRAM_TO_GO" ? "GO_TO_GRAM" : "GRAM_TO_GO"));
    setAmount("");
    setError("");
    setSuccessResult(null);
  };

  const handlePercentage = (pct: number) => {
    if (sourceBalance <= 0) return;
    const val = (sourceBalance * pct).toFixed(isGramToGo ? 6 : 4);
    setAmount(val);
    setError("");
  };

  const handleSwap = async () => {
    if (!user || swapping) return;
    setError("");
    setSuccessResult(null);

    if (inputAmt <= 0) {
      setError("Please enter a valid amount.");
      return;
    }

    if (inputAmt > sourceBalance) {
      setError(`Insufficient ${isGramToGo ? "Gram" : "GO"} balance.`);
      return;
    }

    setSwapping(true);
    try {
      if (isGramToGo) {
        const res = await swapGramToGo(user.id, inputAmt);
        if (res.success) {
          setSuccessResult({
            fromAmount: res.gramAmount,
            toAmount: res.goAmount,
            fromSymbol: "Gram",
            toSymbol: "GO",
          });
          setAmount("");
          await refresh();
          onSuccess?.();
        }
      } else {
        const res = await swapGoToGram(user.id, inputAmt);
        if (res.success) {
          setSuccessResult({
            fromAmount: res.goAmount,
            toAmount: res.gramAmount,
            fromSymbol: "GO",
            toSymbol: "Gram",
          });
          setAmount("");
          await refresh();
          onSuccess?.();
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Swap failed. Please try again.");
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(3, 6, 18, 0.85)",
        backdropFilter: "blur(16px)",
        padding: "16px",
      }}
    >
      <style>{`
        @keyframes popInSwap {
          0% { transform: scale(0.92); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes spinSlow {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "linear-gradient(165deg, #0d152c 0%, #060a18 100%)",
          border: "1.5px solid rgba(0, 242, 254, 0.35)",
          borderRadius: 26,
          padding: "22px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 242, 254, 0.18)",
          animation: "popInSwap 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)",
          position: "relative",
          direction: "ltr",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background: "rgba(0, 242, 254, 0.15)",
                border: "1px solid rgba(0, 242, 254, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ArrowDownUp size={18} color="#00f2fe" />
            </div>
            <div>
              <div style={{ color: "#ffffff", fontSize: 17, fontWeight: 900, letterSpacing: -0.2 }}>
                Instant Swap
              </div>
              <div style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 11, fontWeight: 700 }}>
                {isGramToGo ? "Gram → GO (Boost Power)" : "GO → Gram (Mined Asset)"}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255, 255, 255, 0.7)",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Rate Banner */}
        <div
          style={{
            background: "rgba(0, 242, 254, 0.08)",
            border: "1px solid rgba(0, 242, 254, 0.2)",
            borderRadius: 14,
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={14} color="#fbbf24" />
            <span style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: 11.5, fontWeight: 800 }}>
              Exchange Rate
            </span>
          </div>
          <span style={{ color: "#00f2fe", fontSize: 12, fontWeight: 900, fontFamily: "monospace" }}>
            1 GRAM = {rate} GO
          </span>
        </div>

        {/* 1. FROM CARD */}
        <div
          style={{
            background: "rgba(8, 14, 32, 0.8)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: 18,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: 11, fontWeight: 800 }}>
              YOU SEND
            </span>
            <span style={{ color: "#38bdf8", fontSize: 11, fontWeight: 800 }}>
              Balance: {sourceBalance.toFixed(isGramToGo ? 6 : 2)} {isGramToGo ? "Gram" : "GO"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError("");
                setSuccessResult(null);
              }}
              placeholder="0.00"
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                color: "#ffffff",
                fontSize: 24,
                fontWeight: 900,
                fontFamily: "monospace",
              }}
            />

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: isGramToGo ? "rgba(0, 242, 254, 0.12)" : "rgba(234, 179, 8, 0.12)",
                border: isGramToGo ? "1px solid rgba(0, 242, 254, 0.3)" : "1px solid rgba(234, 179, 8, 0.3)",
                borderRadius: 12,
                padding: "6px 10px",
                flexShrink: 0,
              }}
            >
              <img
                src={isGramToGo ? "/gram.png" : "/go.png"}
                alt={isGramToGo ? "Gram" : "GO"}
                style={{ width: 20, height: 20, borderRadius: "50%" }}
              />
              <span
                style={{
                  color: isGramToGo ? "#00f2fe" : "#fbbf24",
                  fontWeight: 900,
                  fontSize: 13,
                }}
              >
                {isGramToGo ? "Gram" : "GO"}
              </span>
            </div>
          </div>

          {/* Quick Presets */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 4 }}>
            {[0.25, 0.5, 0.75, 1.0].map((pct, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handlePercentage(pct)}
                style={{
                  padding: "5px 0",
                  borderRadius: 8,
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(255, 255, 255, 0.04)",
                  color: "rgba(255, 255, 255, 0.7)",
                  fontSize: 10.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {pct === 1.0 ? "MAX" : `${pct * 100}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Direction Switcher Button */}
        <div style={{ display: "flex", justifyContent: "center", margin: "-6px 0" }}>
          <button
            type="button"
            onClick={toggleDirection}
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #00f2fe 0%, #7f00ff 100%)",
              border: "3px solid #0d152c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              cursor: "pointer",
              boxShadow: "0 0 16px rgba(0, 242, 254, 0.4)",
              transition: "transform 0.2s ease",
            }}
          >
            <ArrowDownUp size={16} />
          </button>
        </div>

        {/* 2. TO CARD */}
        <div
          style={{
            background: "rgba(8, 14, 32, 0.8)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: 18,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "rgba(255, 255, 255, 0.45)", fontSize: 11, fontWeight: 800 }}>
              YOU RECEIVE (ESTIMATED)
            </span>
            <span style={{ color: "#38bdf8", fontSize: 11, fontWeight: 800 }}>
              Balance: {isGramToGo ? goBalance.toFixed(2) : gramBalance.toFixed(6)} {isGramToGo ? "GO" : "Gram"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                flex: 1,
                color: inputAmt > 0 ? "#ffffff" : "rgba(255, 255, 255, 0.3)",
                fontSize: 24,
                fontWeight: 900,
                fontFamily: "monospace",
              }}
            >
              {inputAmt > 0 ? calculatedOutput : "0.00"}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: !isGramToGo ? "rgba(0, 242, 254, 0.12)" : "rgba(234, 179, 8, 0.12)",
                border: !isGramToGo ? "1px solid rgba(0, 242, 254, 0.3)" : "1px solid rgba(234, 179, 8, 0.3)",
                borderRadius: 12,
                padding: "6px 10px",
                flexShrink: 0,
              }}
            >
              <img
                src={!isGramToGo ? "/gram.png" : "/go.png"}
                alt={!isGramToGo ? "Gram" : "GO"}
                style={{ width: 20, height: 20, borderRadius: "50%" }}
              />
              <span
                style={{
                  color: !isGramToGo ? "#00f2fe" : "#fbbf24",
                  fontWeight: 900,
                  fontSize: 13,
                }}
              >
                {!isGramToGo ? "Gram" : "GO"}
              </span>
            </div>
          </div>
        </div>

        {/* Feedback / Alerts */}
        {successResult && (
          <div
            style={{
              borderRadius: 14,
              padding: "10px 14px",
              background: "rgba(34, 197, 94, 0.15)",
              border: "1px solid rgba(34, 197, 94, 0.4)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CheckCircle2 size={16} color="#4ade80" />
            <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 800 }}>
              Swapped {successResult.fromAmount} {successResult.fromSymbol} → +{successResult.toAmount} {successResult.toSymbol} successfully!
            </span>
          </div>
        )}

        {error && (
          <div
            style={{
              borderRadius: 14,
              padding: "10px 14px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#f87171",
              fontSize: 12,
              fontWeight: 800,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleSwap}
          disabled={swapping || inputAmt <= 0}
          style={{
            width: "100%",
            padding: "15px",
            borderRadius: 16,
            border: "none",
            background:
              inputAmt > 0
                ? "linear-gradient(90deg, #00c6ff 0%, #0072ff 50%, #7f00ff 100%)"
                : "rgba(255, 255, 255, 0.08)",
            color: inputAmt > 0 ? "#ffffff" : "rgba(255, 255, 255, 0.3)",
            fontSize: 15,
            fontWeight: 900,
            cursor: inputAmt > 0 && !swapping ? "pointer" : "not-allowed",
            boxShadow: inputAmt > 0 ? "0 6px 24px rgba(0, 242, 254, 0.35)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all 0.15s ease",
          }}
        >
          {swapping ? (
            <>
              <Loader2 size={16} style={{ animation: "spinSlow 1s linear infinite" }} />
              <span>Executing Swap...</span>
            </>
          ) : (
            <>
              <Zap size={16} />
              <span>Convert {isGramToGo ? "Gram → GO" : "GO → Gram"}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
