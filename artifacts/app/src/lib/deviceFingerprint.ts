// ── SHA-256 Digest Helper ──────────────────────────────────────────
async function digest(str: string): Promise<string> {
  try {
    const buf = new TextEncoder().encode(str);
    const h = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(h))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  } catch {
    // Fallback simple hash if subtle crypto is unavailable
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, "0");
  }
}

// ── Local Persistent ID ─────────────────────────────────────────────
function getLocalId(): string {
  try {
    const k = "__fp_local_id";
    let id = localStorage.getItem(k);
    if (!id) {
      id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(k, id);
    }
    return id;
  } catch {
    return "NA";
  }
}

// ── Canvas Fingerprint ──────────────────────────────────────────────
async function getCanvasFP(): Promise<string> {
  try {
    const c = document.createElement("canvas");
    c.width = 220;
    c.height = 40;
    const ctx = c.getContext("2d");
    if (!ctx) return "NA";
    ctx.textBaseline = "top";
    ctx.font = "16px Arial";
    ctx.fillStyle = "#5b8bff";
    ctx.fillRect(0, 0, 30, 20);
    ctx.fillStyle = "#ff7ac6";
    ctx.fillText("GramGo-Security-Check-2026", 4, 4);
    const data = c.toDataURL();
    return await digest(data);
  } catch {
    return "NA";
  }
}

// ── Audio Fingerprint ───────────────────────────────────────────────
async function getAudioFP(): Promise<string> {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return "NA";
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const analyser = ctx.createAnalyser();
    osc.type = "triangle";
    osc.frequency.value = 111;
    osc.connect(analyser);
    osc.start();
    const arr = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(arr);
    osc.stop();
    ctx.close();
    return await digest(arr.join(","));
  } catch {
    return "NA";
  }
}

export interface DeviceFingerprintPayload {
  fingerprint: string;
  meta: {
    ua: string;
    rez: string;
    tz: string;
    lid: string;
    cfp: string;
    afp: string;
    hw?: number;
    mem?: number;
    touch?: number;
    lang?: string;
  };
}

export async function collectFullDevicePayload(): Promise<DeviceFingerprintPayload> {
  const ua = navigator.userAgent || "NA";
  const rez = `${screen.width}x${screen.height}`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "NA";
  const lid = getLocalId();
  const cfp = await getCanvasFP();
  const afp = await getAudioFP();
  const hw = navigator.hardwareConcurrency || 0;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 0;
  const touch = navigator.maxTouchPoints || 0;
  const lang = navigator.language || "en";

  const raw = `${ua}|${rez}|${tz}|${lid}|${cfp}|${afp}|${hw}|${mem}|${touch}|${lang}`;
  const fingerprint = await digest(raw);

  return {
    fingerprint,
    meta: {
      ua,
      rez,
      tz,
      lid,
      cfp,
      afp,
      hw,
      mem,
      touch,
      lang,
    },
  };
}

export async function collectDeviceFingerprint(): Promise<string> {
  const payload = await collectFullDevicePayload();
  return payload.fingerprint;
}
