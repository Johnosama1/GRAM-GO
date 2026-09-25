import React, { useState } from "react";
import { useAdsgram } from "@adsgram/react";
import { api } from "../../lib/api";

type AdsStatus = {
  watchedToday: number;
  dailyLimit: number;
  rewardAmount: number;
  nextResetTime?: string;
};

type TimeLeft = { h: number; m: number; s: number } | null;

interface ActiveAdsTaskCardProps {
  adsStatus: AdsStatus;
  refresh: () => Promise<void>;
  setMessage: (msg: { taskId: number | string; text: string; type: "success" | "error" } | null) => void;
  setAdsStatus: React.Dispatch<React.SetStateAction<AdsStatus | null>>;
  adsTimeLeft: TimeLeft;
  blockId: string;
}

export function ActiveAdsTaskCard({
  adsStatus,
  refresh,
  setMessage,
  setAdsStatus,
  adsTimeLeft,
  blockId,
}: ActiveAdsTaskCardProps) {
  const [watchingAd, setWatchingAd] = useState(false);

  const { show: showAd } = useAdsgram({
    blockId: blockId as `${number}`,
    onReward: () => {
      api.watchAd().then(res => {
        if (res.success) {
          setAdsStatus({
            watchedToday: res.watchedToday,
            dailyLimit: res.dailyLimit,
            rewardAmount: res.rewardAmount,
            nextResetTime: res.nextResetTime,
          });
          setMessage({
            taskId: "ad",
            text: `✅ إعلان مكتمل! حصلت على +${res.rewardAmount} GO`,
            type: "success",
          });
          refresh();
        }
      }).catch(err => {
        setMessage({
          taskId: "ad",
          text: err.message || "حدث خطأ.",
          type: "error",
        });
      }).finally(() => {
        setWatchingAd(false);
      });
    },
    onError: () => {
      setMessage({
        taskId: "ad",
        text: "Ad was not completed or unavailable.",
        type: "error",
      });
      setWatchingAd(false);
    }
  });

  const handleWatchAd = async () => {
    if (watchingAd || !adsStatus) return;
    if (adsStatus.watchedToday >= adsStatus.dailyLimit) return;

    setWatchingAd(true);
    try {
      await showAd();
    } catch (e) {
      setMessage({
        taskId: "ad",
        text: "Ad was not completed. No reward was added.",
        type: "error",
      });
      setWatchingAd(false);
    }
  };

  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)",
        border: "1px solid rgba(139, 92, 246, 0.25)",
        borderRadius: 22,
        padding: "16px 14px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        marginBottom: 12,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(56,189,248,0.2))",
              border: "1px solid rgba(139,92,246,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
            }}
          >
            📺
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>
              Watch Advertisement
            </span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 500 }}>
              Reward: +{adsStatus.rewardAmount} GO
            </span>
            <span style={{ color: "#a855f7", fontSize: 11, fontWeight: 700, marginTop: 2 }}>
              Progress: {adsStatus.watchedToday === adsStatus.dailyLimit
                ? `All ${adsStatus.dailyLimit} ads completed today`
                : `${adsStatus.dailyLimit - adsStatus.watchedToday} ad${(adsStatus.dailyLimit - adsStatus.watchedToday) === 1 ? '' : 's'} remaining`}
            </span>
          </div>
        </div>
        <button
          onClick={handleWatchAd}
          disabled={watchingAd || adsStatus.watchedToday >= adsStatus.dailyLimit}
          style={{
            padding: "8px 16px",
            borderRadius: 12,
            fontWeight: 800,
            fontSize: 12,
            border: "none",
            cursor: watchingAd || adsStatus.watchedToday >= adsStatus.dailyLimit ? "not-allowed" : "pointer",
            background: adsStatus.watchedToday >= adsStatus.dailyLimit
              ? "rgba(255,255,255,0.1)"
              : "linear-gradient(135deg, #a855f7, #7e22ce)",
            color: adsStatus.watchedToday >= adsStatus.dailyLimit ? "rgba(255,255,255,0.4)" : "#fff",
            opacity: watchingAd ? 0.6 : 1,
          }}
        >
          {watchingAd
            ? "..."
            : adsStatus.watchedToday >= adsStatus.dailyLimit
              ? "Done"
              : "Watch Ad"}
        </button>
      </div>

      {adsStatus.watchedToday >= adsStatus.dailyLimit && adsTimeLeft && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>✅</span>
            <span style={{ color: "#22c55e", fontSize: 13, fontWeight: 600 }}>
              You have watched all {adsStatus.dailyLimit} ads for today.
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>⏳</span>
            <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 500 }}>
              Next {adsStatus.dailyLimit} ads available in:
              <strong style={{ color: "#fff", marginLeft: 4 }}>
                {adsTimeLeft.h}h {adsTimeLeft.m}m
              </strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function DisabledAdsTaskCard({ adsStatus }: { adsStatus: AdsStatus }) {
  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.5) 100%)",
        border: "1px dashed rgba(255, 255, 255, 0.15)",
        borderRadius: 22,
        padding: "16px 14px",
        marginBottom: 12,
        display: "flex",
        flexDirection: "column",
        opacity: 0.7,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              filter: "grayscale(100%)",
            }}
          >
            📺
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 800, fontSize: 14 }}>
              Watch Advertisement
            </span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 500 }}>
              Reward: +{adsStatus.rewardAmount} GO
            </span>
            <span style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700, marginTop: 2 }}>
              Ads will be available soon.
            </span>
          </div>
        </div>
        <button
          disabled={true}
          style={{
            padding: "8px 16px",
            borderRadius: 12,
            fontWeight: 800,
            fontSize: 12,
            border: "none",
            cursor: "not-allowed",
            background: "rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          Unavailable
        </button>
      </div>
    </div>
  );
}
