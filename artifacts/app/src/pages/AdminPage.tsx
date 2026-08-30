import { useState, useEffect, useCallback } from "react";
import { useUser } from "../lib/userContext";
import {
  api,
  AdminStats,
  AuditLog,
  WithdrawalItem,
  DepositItem,
  Task,
  ContestItem,
  MilestoneItem,
  AutoBannedItem,
  SecurityEventItem,
  ComboAdminStats,
  User,
  AdminUser,
  UserDetailResult,
} from "../lib/api";
import {
  Shield,
  Send,
  Power,
  RefreshCw,
  Users,
  LayoutDashboard,
  Zap,
  DollarSign,
  AlertTriangle,
  Gift,
  Plus,
  Trash2,
  Globe,
  MessageSquare,
} from "lucide-react";

type SectionTab = "general" | "mining" | "finance" | "tasks" | "users";

export default function AdminPage() {
  const { user, isAdmin } = useUser();
  const [activeSection, setActiveSection] = useState<SectionTab>("general");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);

  // Data states
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contests, setContests] = useState<ContestItem[]>([]);
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [comboStats, setComboStats] = useState<ComboAdminStats | null>(null);
  const [checkinRewards, setCheckinRewards] = useState<Record<number, number>>({});
  const [usersList, setUsersList] = useState<User[]>([]);
  const [autoBannedList, setAutoBannedList] = useState<AutoBannedItem[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEventItem[]>([]);

  // Modals & form states
  const [broadcastModal, setBroadcastModal] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastPin, setBroadcastPin] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);

  const [addAdminModal, setAddAdminModal] = useState(false);
  const [newAdminId, setNewAdminId] = useState("");
  const [newAdminUser, setNewAdminUser] = useState("");
  const [newAdminRole, setNewAdminRole] = useState("admin");
  const [newAdminPerms, setNewAdminPerms] = useState<string[]>([]);

  const [miningRateInput, setMiningRateInput] = useState("0.0300");
  const [miningRateModal, setMiningRateModal] = useState(false);

  const [resetModal, setResetModal] = useState<"GO" | "GRAM" | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState("");

  const [taskModal, setTaskModal] = useState<{ open: boolean; task?: Partial<Task> }>({ open: false });
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskUrl, setNewTaskUrl] = useState("");
  const [newTaskReward, setNewTaskReward] = useState("5");
  const [newTaskCurrency, setNewTaskCurrency] = useState("GO");

  const [contestModal, setContestModal] = useState(false);
  const [newContest, setNewContest] = useState({ title: "", description: "", rewardType: "GO", totalReward: "100", winnerCount: "3", endDate: "" });

  const [userSearch, setUserSearch] = useState("");
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserDetailResult | null>(null);
  const [balanceAdjustModal, setBalanceAdjustModal] = useState<{ open: boolean; userId?: number; userName?: string }>({ open: false });
  const [balanceAdjustForm, setBalanceAdjustForm] = useState({ type: "add" as "add" | "deduct" | "correct", currency: "GO" as "GO" | "Gram", amount: "", reason: "" });

  const [userMsgModal, setUserMsgModal] = useState<{ open: boolean; userId?: number; isWarning?: boolean }>({ open: false });
  const [userMsgText, setUserMsgText] = useState("");

  const flash = (text: string, type: "ok" | "err" = "ok") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [st, set, ad, al, wds, deps, tks, cnts, mls, cmb, chk, autoB, sec] = await Promise.all([
        api.adminGetStats().catch(() => null),
        api.adminGetSettings().catch(() => ({} as Record<string, string>)),
        api.adminGetAdmins().catch(() => []),
        api.adminGetAuditLogs().catch(() => []),
        api.adminGetWithdrawals().catch(() => []),
        api.adminGetDeposits().catch(() => []),
        api.adminGetTasks().catch(() => []),
        api.adminGetContests().catch(() => []),
        api.adminGetMilestones().catch(() => []),
        api.adminGetComboStats().catch(() => null),
        api.adminGetCheckinSettings().catch(() => ({})),
        api.adminGetAutoBanned().catch(() => []),
        api.adminGetSecurityEvents().catch(() => []),
      ]);

      if (st) setStats(st);
      if (set) {
        setSettings(set);
        if (set["global_mining_rate"]) setMiningRateInput(set["global_mining_rate"]);
      }
      setAdmins(ad);
      setAuditLogs(al);
      setWithdrawals(wds);
      setDeposits(deps);
      setTasks(tks);
      setContests(cnts);
      setMilestones(mls);
      if (cmb) setComboStats(cmb);
      setCheckinRewards(chk);
      setAutoBannedList(autoB);
      setSecurityEvents(sec);

      const users = await api.adminGetUsers().catch(() => []);
      setUsersList(users);
    } catch (e) {
      console.error(e);
      flash("Error loading admin data", "err");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleUpdateSetting = async (key: string, value: string) => {
    try {
      await api.adminUpdateSetting(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
      flash("Settings saved ✅");
    } catch {
      flash("Failed to update setting", "err");
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastText.trim()) return;
    setBroadcastSending(true);
    try {
      const res = await api.adminBroadcast({ message: broadcastText, pin: broadcastPin });
      flash(res.message);
      setBroadcastModal(false);
      setBroadcastText("");
    } catch {
      flash("Failed to send broadcast", "err");
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleAddAdmin = async () => {
    const id = parseInt(newAdminId);
    if (isNaN(id)) { flash("Invalid Telegram ID", "err"); return; }
    try {
      await api.adminAddAdmin({ id, username: newAdminUser, role: newAdminRole, permissions: newAdminPerms });
      flash("Admin added successfully ✅");
      setAddAdminModal(false);
      setNewAdminId("");
      setNewAdminUser("");
      setNewAdminPerms([]);
      loadAll();
    } catch {
      flash("Failed to add admin", "err");
    }
  };

  const handleDeleteAdmin = async (id: number) => {
    if (!confirm("Are you sure you want to remove this admin?")) return;
    try {
      await api.adminDeleteAdmin(id);
      flash("Admin removed ✅");
      loadAll();
    } catch {
      flash("Failed to remove admin", "err");
    }
  };

  const handleSaveMiningRate = async () => {
    const rate = parseFloat(miningRateInput);
    if (isNaN(rate) || rate <= 0 || rate > 1) { flash("Rate must be between 0.001 and 1.0", "err"); return; }
    try {
      const res = await api.adminUpdateMiningRate(rate);
      flash("Mining rate updated to " + res.percentage + " ✅");
      setMiningRateModal(false);
      loadAll();
    } catch {
      flash("Failed to update mining rate", "err");
    }
  };

  const handleWithdrawalAction = async (id: number, action: "approve" | "reject") => {
    const reason = action === "reject" ? prompt("Reason for rejection:") || undefined : undefined;
    try {
      await api.adminUpdateWithdrawal(id, action, reason);
      flash(action === "approve" ? "Withdrawal approved ✅" : "Withdrawal rejected & refunded ✅");
      loadAll();
    } catch {
      flash("Action failed", "err");
    }
  };

  const handleResetBalances = async (currency: "GO" | "GRAM") => {
    const required = currency === "GO" ? "CONFIRM_RESET_ALL_GO" : "CONFIRM_RESET_ALL_GRAM";
    if (resetConfirmText !== required) {
      flash("Please type exactly " + required, "err");
      return;
    }
    try {
      if (currency === "GO") {
        const res = await api.adminResetGoBalances(resetConfirmText);
        flash("Reset GO balance for " + res.affectedUsers + " users ✅");
      } else {
        const res = await api.adminResetGramBalances(resetConfirmText);
        flash("Reset GRAM balance for " + res.affectedUsers + " users ✅");
      }
      setResetModal(null);
      setResetConfirmText("");
      loadAll();
    } catch {
      flash("Reset balances failed", "err");
    }
  };

  const handleSaveTask = async () => {
    if (!newTaskTitle.trim()) { flash("Title is required", "err"); return; }
    try {
      await api.adminCreateTask({
        title: newTaskTitle,
        url: newTaskUrl || undefined,
        rewardAmount: newTaskReward,
        rewardCurrency: newTaskCurrency,
      });
      flash("Task created ✅");
      setTaskModal({ open: false });
      setNewTaskTitle("");
      setNewTaskUrl("");
      loadAll();
    } catch {
      flash("Failed to save task", "err");
    }
  };

  const handleDeleteTask = async (id: number) => {
    if (!confirm("Are you sure you want to delete this task?")) return;
    try {
      await api.adminDeleteTask(id);
      flash("Task deleted ✅");
      loadAll();
    } catch {
      flash("Failed to delete task", "err");
    }
  };

  const handleCreateContest = async () => {
    if (!newContest.title || !newContest.endDate) { flash("Title and End Date required", "err"); return; }
    try {
      await api.adminCreateContest({ ...newContest, winnerCount: parseInt(newContest.winnerCount) || 3 });
      flash("Contest created ✅");
      setContestModal(false);
      loadAll();
    } catch {
      flash("Failed to create contest", "err");
    }
  };

  const handleFinalizeContest = async (id: number) => {
    if (!confirm("Finalize contest and disburse rewards to top winners now?")) return;
    try {
      const res = await api.adminFinalizeContest(id);
      flash("Contest finalized! " + res.winners.length + " winners rewarded ✅");
      loadAll();
    } catch {
      flash("Failed to finalize contest", "err");
    }
  };

  const handleSaveCheckinDay = async (day: number, amount: number) => {
    const updated = { ...checkinRewards, [day]: amount };
    try {
      await api.adminUpdateCheckinSettings(updated);
      setCheckinRewards(updated);
      flash("Day " + day + " reward updated to " + amount + " GO ✅");
    } catch {
      flash("Failed to update check-in reward", "err");
    }
  };

  const handleSearchUsers = async (q: string) => {
    setUserSearch(q);
    try {
      const list = await api.adminGetUsers(q);
      setUsersList(list);
    } catch { /* ignore */ }
  };

  const handleOpenUserDetail = async (id: number) => {
    try {
      const res = await api.adminGetUserDetail(id);
      setSelectedUserDetail(res);
    } catch {
      flash("Failed to load user profile", "err");
    }
  };

  const handleAdjustBalance = async () => {
    if (!balanceAdjustModal.userId) return;
    const amt = parseFloat(balanceAdjustForm.amount);
    if (isNaN(amt) || amt <= 0) { flash("Enter valid positive amount", "err"); return; }
    try {
      await api.adminAdjustBalance(balanceAdjustModal.userId, {
        type: balanceAdjustForm.type,
        currency: balanceAdjustForm.currency,
        amount: amt,
        reason: balanceAdjustForm.reason || "Admin adjustment",
      });
      flash("Balance adjusted successfully ✅");
      setBalanceAdjustModal({ open: false });
      if (selectedUserDetail?.user.id === balanceAdjustModal.userId) {
        handleOpenUserDetail(balanceAdjustModal.userId);
      }
      loadAll();
    } catch {
      flash("Failed to adjust balance", "err");
    }
  };

  const handleSendMessageToUser = async () => {
    if (!userMsgModal.userId || !userMsgText.trim()) return;
    try {
      await api.adminSendMessage(userMsgModal.userId, {
        message: userMsgText,
        isWarning: userMsgModal.isWarning,
      });
      flash(userMsgModal.isWarning ? "Warning sent to user via Telegram ✅" : "Message sent via Telegram ✅");
      setUserMsgModal({ open: false });
      setUserMsgText("");
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Failed to send message", "err");
    }
  };

  const handleBanUser = async (id: number, ban: boolean) => {
    const reason = ban ? prompt("Reason for ban:") || "Admin manual ban" : undefined;
    try {
      if (ban) {
        await api.adminBanUser(id, reason);
        flash("User #" + id + " banned 🚫");
      } else {
        await api.adminUnbanUser(id);
        flash("User #" + id + " unbanned ✅");
      }
      if (selectedUserDetail?.user.id === id) {
        handleOpenUserDetail(id);
      }
      loadAll();
    } catch {
      flash("Ban/Unban action failed", "err");
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#f87171" }}>
        <h2>⛔ Unauthorized Access</h2>
        <p>You do not have administrative privileges to view this page.</p>
      </div>
    );
  }

  const isMaintenance = settings["maintenance_mode"] === "true";
  const isSecurityActive = settings["security_system_enabled"] !== "false";

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 720,
        margin: "0 auto",
        padding: "16px 14px 100px",
        minHeight: "100vh",
        background: "linear-gradient(180deg, #060a18 0%, #030610 100%)",
        color: "#ffffff",
        boxSizing: "border-box",
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          background: "rgba(10, 18, 42, 0.8)",
          border: "1px solid rgba(0, 242, 254, 0.3)",
          borderRadius: 20,
          padding: "14px 18px",
          backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Shield size={24} color="#00f2fe" />
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 0.3, color: "#fff" }}>
              GRAMGO ADMIN PANEL
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              Authenticated as {user?.firstName || "Admin"} (ID: {user?.id})
            </div>
          </div>
        </div>

        <button
          onClick={loadAll}
          style={{
            background: "rgba(0, 242, 254, 0.15)",
            border: "1px solid rgba(0, 242, 254, 0.4)",
            borderRadius: 12,
            padding: "8px 12px",
            color: "#00f2fe",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Toast Flash Message */}
      {msg && (
        <div
          style={{
            position: "fixed",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            background: msg.type === "ok" ? "rgba(34, 197, 94, 0.95)" : "rgba(239, 68, 68, 0.95)",
            color: "#fff",
            padding: "12px 24px",
            borderRadius: 14,
            fontWeight: 900,
            fontSize: 13,
            boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
          }}
        >
          {msg.text}
        </div>
      )}

      {/* 5 Main Section Navigation Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 6,
          marginBottom: 16,
          background: "rgba(8, 14, 32, 0.6)",
          padding: 6,
          borderRadius: 18,
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        {[
          { id: "general" as const, label: "1. عامة", icon: LayoutDashboard },
          { id: "mining" as const, label: "2. التعدين", icon: Zap },
          { id: "finance" as const, label: "3. المالية", icon: DollarSign },
          { id: "tasks" as const, label: "4. المكافآت", icon: Gift },
          { id: "users" as const, label: "5. الأمان", icon: Users },
        ].map((tab) => {
          const isActive = activeSection === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              style={{
                background: isActive
                  ? "linear-gradient(135deg, rgba(0, 242, 254, 0.3), rgba(124, 58, 237, 0.3))"
                  : "transparent",
                border: isActive ? "1px solid #00f2fe" : "none",
                borderRadius: 14,
                padding: "10px 4px",
                color: isActive ? "#00f2fe" : "rgba(255,255,255,0.6)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 800,
                transition: "all 0.2s ease",
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SECTION 1: General */}
      {activeSection === "general" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button
              onClick={() => setBroadcastModal(true)}
              style={{
                background: "linear-gradient(135deg, #00f2fe, #3b82f6)",
                color: "#040714",
                fontWeight: 900,
                fontSize: 13,
                padding: "12px",
                borderRadius: 16,
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 4px 18px rgba(0,242,254,0.3)",
              }}
            >
              <Send size={16} /> إرسال رسالة للجميع
            </button>

            <button
              onClick={() => handleUpdateSetting("maintenance_mode", isMaintenance ? "false" : "true")}
              style={{
                background: isMaintenance ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)",
                border: isMaintenance ? "1px solid #ef4444" : "1px solid #22c55e",
                color: isMaintenance ? "#f87171" : "#4ade80",
                fontWeight: 900,
                fontSize: 13,
                padding: "12px",
                borderRadius: 16,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Power size={16} /> وضع الصيانة: {isMaintenance ? "ON" : "OFF"}
            </button>
          </div>

          {/* Stats Grid */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", marginBottom: 12 }}>
              📊 إحصائيات البوت (Real Neon DB Data)
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>إجمالي المستخدمين</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>{stats?.totalUsers ?? 0}</div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>نشط الآن (15 د)</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#4ade80" }}>{stats?.activeNow ?? 0}</div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>نشط 24 ساعة</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#60a5fa" }}>{stats?.active24h ?? 0}</div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>المحظورين يدوياً</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#f87171" }}>{stats?.bannedAccounts ?? 0}</div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>المحظورين تلقائياً</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#fb923c" }}>{stats?.autoBannedAccounts ?? 0}</div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>سحوبات معلقة</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#fbbf24" }}>{stats?.pendingWithdrawalsCount ?? 0}</div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>إجمالي GO المتداول</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#fbbf24" }}>{stats?.totalGo ?? "0"} GO</div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>إجمالي GRAM المتداول</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#00f2fe" }}>{stats?.totalGram ?? "0"} Gram</div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>إجمالي TON المسحوب</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#a855f7" }}>{stats?.totalTonWithdrawn ?? "0"} TON</div>
              </div>
            </div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#93c5fd", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <Globe size={14} /> توزيع المستخدمين حسب المنطقة / التوقيت:
              </div>
              {stats?.countries ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {stats.countries.map((c, i) => (
                    <div key={i} style={{ background: "rgba(0, 242, 254, 0.1)", border: "1px solid rgba(0, 242, 254, 0.3)", borderRadius: 8, padding: "4px 8px", fontSize: 11 }}>
                      {c.region}: <strong>{c.count}</strong> ({c.percentage}%)
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>غير متاح (لا تتوفر بيانات جغرافية رسمية حالياً)</div>
              )}
            </div>
          </div>

          {/* Welcome Message */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <MessageSquare size={16} /> تعديل رسالة الترحيب (/start Welcome Message)
            </div>
            <textarea
              rows={4}
              value={settings["welcome_message"] || ""}
              onChange={(e) => setSettings({ ...settings, welcome_message: e.target.value })}
              placeholder="اكتب رسالة الترحيب المخصصة هنا..."
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: 10, color: "#fff", fontSize: 12, boxSizing: "border-box", marginBottom: 10 }}
            />
            <button
              onClick={() => handleUpdateSetting("welcome_message", settings["welcome_message"] || "")}
              style={{ background: "linear-gradient(135deg, #00f2fe, #7c3aed)", border: "none", borderRadius: 12, padding: "8px 16px", color: "#040714", fontWeight: 900, fontSize: 12, cursor: "pointer" }}
            >
              حفظ رسالة الترحيب
            </button>
          </div>

          {/* Admins List */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", display: "flex", alignItems: "center", gap: 6 }}>
                <Shield size={16} /> إدارة المشرفين والصلاحيات
              </div>
              <button
                onClick={() => setAddAdminModal(true)}
                style={{ background: "rgba(0, 242, 254, 0.15)", border: "1px solid rgba(0, 242, 254, 0.4)", borderRadius: 10, padding: "4px 10px", color: "#00f2fe", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <Plus size={12} /> إضافة مشرف
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {admins.map((ad) => (
                <div key={ad.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>
                      {ad.username ? "@" + ad.username : "ID: " + ad.id} ({ad.role})
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                      الصلاحيات: {ad.permissions?.length ? ad.permissions.join(", ") : "All (Full)"}
                    </div>
                  </div>
                  {ad.role !== "owner" && (
                    <button
                      onClick={() => handleDeleteAdmin(ad.id)}
                      style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: 8, padding: "6px 8px", color: "#f87171", cursor: "pointer" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: Mining */}
      {activeSection === "mining" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#00f2fe", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Zap size={18} /> إعدادات معدل التعدين اليومي (Mining Rate)
            </div>

            <div style={{ background: "rgba(0, 242, 254, 0.08)", border: "1px solid rgba(0, 242, 254, 0.3)", borderRadius: 14, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>المعدل العالمي الحالي:</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#00f2fe" }}>
                {(parseFloat(settings["global_mining_rate"] || "0.0300") * 100).toFixed(2)}% يومياً
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                يُطبّق على جميع عمليات التعدين وحسابات الأرباح اللحظية من السيرفر مباشرة.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="number"
                step="0.001"
                min="0.001"
                max="1.0"
                value={miningRateInput}
                onChange={(e) => setMiningRateInput(e.target.value)}
                style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: "10px 14px", color: "#fff", fontSize: 14, fontWeight: 800 }}
              />
              <button
                onClick={handleSaveMiningRate}
                style={{ background: "linear-gradient(135deg, #00f2fe, #7c3aed)", border: "none", borderRadius: 12, padding: "10px 20px", color: "#040714", fontWeight: 900, fontSize: 13, cursor: "pointer" }}
              >
                تغيير النسبة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: Finance */}
      {activeSection === "finance" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Danger Zone */}
          <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#f87171", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={16} /> منطقة العمليات الخطيرة (Danger Zone)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                onClick={() => setResetModal("GO")}
                style={{ background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", borderRadius: 12, padding: "10px", color: "#f87171", fontWeight: 900, fontSize: 12, cursor: "pointer" }}
              >
                ⚠️ تصفير جميع أرصدة GO
              </button>
              <button
                onClick={() => setResetModal("GRAM")}
                style={{ background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", borderRadius: 12, padding: "10px", color: "#f87171", fontWeight: 900, fontSize: 12, cursor: "pointer" }}
              >
                ⚠️ تصفير جميع أرصدة GRAM
              </button>
            </div>
          </div>

          {/* Deposit Wallet */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", marginBottom: 8 }}>
              💼 عنوان محفظة الإيداع (Deposit Wallet Address)
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={settings["deposit_wallet_address"] || ""}
                onChange={(e) => setSettings({ ...settings, deposit_wallet_address: e.target.value })}
                placeholder="UQ... أو EQ..."
                style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: "8px 12px", color: "#fff", fontSize: 12 }}
              />
              <button
                onClick={() => handleUpdateSetting("deposit_wallet_address", settings["deposit_wallet_address"] || "")}
                style={{ background: "linear-gradient(135deg, #00f2fe, #3b82f6)", border: "none", borderRadius: 12, padding: "8px 14px", color: "#040714", fontWeight: 900, fontSize: 12, cursor: "pointer" }}
              >
                حفظ
              </button>
            </div>
          </div>

          {/* Withdrawals List */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", marginBottom: 12 }}>
              💳 طلبات السحب ({withdrawals.length})
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 350, overflowY: "auto" }}>
              {withdrawals.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>لا توجد طلبات سحب حالياً</div>
              ) : (
                withdrawals.map((w) => (
                  <div key={w.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>
                        {w.firstName || w.username || ("User #" + w.userId)} • <strong>{parseFloat(w.amount).toFixed(4)} {w.currency}</strong>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 900,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: w.status === "approved" ? "rgba(34,197,94,0.2)" : w.status === "rejected" ? "rgba(239,68,68,0.2)" : "rgba(251,191,36,0.2)",
                          color: w.status === "approved" ? "#4ade80" : w.status === "rejected" ? "#f87171" : "#fbbf24",
                        }}
                      >
                        {w.status.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", wordBreak: "break-all" }}>
                      📍 {w.walletAddress}
                    </div>

                    {w.status === "pending" && (
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button
                          onClick={() => handleWithdrawalAction(w.id, "approve")}
                          style={{ flex: 1, background: "rgba(34, 197, 94, 0.2)", border: "1px solid #22c55e", borderRadius: 8, padding: 6, color: "#4ade80", fontWeight: 900, fontSize: 11, cursor: "pointer" }}
                        >
                          موافقة ✅
                        </button>
                        <button
                          onClick={() => handleWithdrawalAction(w.id, "reject")}
                          style={{ flex: 1, background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", borderRadius: 8, padding: 6, color: "#f87171", fontWeight: 900, fontSize: 11, cursor: "pointer" }}
                        >
                          رفض وإعادة الرصيد ❌
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: Tasks */}
      {activeSection === "tasks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Tasks Manager */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe" }}>
                📋 إدارة المهام ({tasks.length})
              </div>
              <button
                onClick={() => setTaskModal({ open: true })}
                style={{ background: "rgba(0, 242, 254, 0.15)", border: "1px solid rgba(0, 242, 254, 0.4)", borderRadius: 10, padding: "4px 10px", color: "#00f2fe", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <Plus size={12} /> مهمة جديدة
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tasks.map((t) => (
                <div key={t.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{t.icon} {t.title}</div>
                    <div style={{ fontSize: 11, color: "#fbbf24" }}>+{t.rewardAmount || 5} {t.rewardCurrency || "GO"}</div>
                  </div>
                  <button
                    onClick={() => handleDeleteTask(t.id)}
                    style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: 8, padding: 6, color: "#f87171", cursor: "pointer" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Combo Stats */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", marginBottom: 10 }}>
              🧩 إحصائيات Daily Combo اليوم ({comboStats?.todayDate})
            </div>
            {comboStats?.combo && (
              <div style={{ background: "rgba(0, 242, 254, 0.08)", borderRadius: 12, padding: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>العناصر الصحيحة لليوم:</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#fff" }}>
                  1. {comboStats.combo.item1.name} • 2. {comboStats.combo.item2.name} • 3. {comboStats.combo.item3.name}
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>المحاولات اليوم</div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>{comboStats?.totalAttemptsToday ?? 0}</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>الحلول الناجحة (+5 GO)</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: "#4ade80" }}>{comboStats?.successfulSolvesToday ?? 0}</div>
              </div>
            </div>
          </div>

          {/* Daily Check-in Rewards */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", marginBottom: 12 }}>
              📅 مكافآت تسجيل الدخول اليومي (Day 1 - 10 Rewards)
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((day) => (
                <div key={day} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Day {day}</div>
                  <input
                    type="number"
                    value={checkinRewards[day] ?? (day === 1 ? 2 : day === 2 ? 3 : day === 4 ? 5 : day === 5 ? 6 : day === 6 ? 8 : day === 10 ? 10 : 4)}
                    onChange={(e) => setCheckinRewards({ ...checkinRewards, [day]: parseInt(e.target.value) || 0 })}
                    onBlur={(e) => handleSaveCheckinDay(day, parseInt(e.target.value) || 0)}
                    style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#fbbf24", fontWeight: 900, fontSize: 12, textAlign: "center", marginTop: 4 }}
                  />
                  <div style={{ fontSize: 9, color: "#fbbf24", marginTop: 2 }}>GO</div>
                </div>
              ))}
            </div>
          </div>

          {/* Contests Manager */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe" }}>
                🏆 المسابقات والجوائز ({contests.length})
              </div>
              <button
                onClick={() => setContestModal(true)}
                style={{ background: "rgba(0, 242, 254, 0.15)", border: "1px solid rgba(0, 242, 254, 0.4)", borderRadius: 10, padding: "4px 10px", color: "#00f2fe", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
              >
                + مسابقة جديدة
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {contests.map((c) => (
                <div key={c.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{c.title}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      الجائزة: {c.totalReward} {c.rewardType} • {c.winnerCount} فائزين • {c.isFinished ? "منتهية" : "جارية"}
                    </div>
                  </div>
                  {!c.isFinished && (
                    <button
                      onClick={() => handleFinalizeContest(c.id)}
                      style={{ background: "rgba(34, 197, 94, 0.2)", border: "1px solid #22c55e", borderRadius: 8, padding: "6px 10px", color: "#4ade80", fontSize: 11, fontWeight: 900, cursor: "pointer" }}
                    >
                      إنهاء وتوزيع الجوائز
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: Users & Security */}
      {activeSection === "users" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Security Master Switch */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#fff" }}>
                🛡️ نظام الحماية المتقدم (Defensive Security)
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                حظر التعدد التلقائي وفحص البصمات ومراقبة الطلبات المشبوهة
              </div>
            </div>
            <button
              onClick={() => handleUpdateSetting("security_system_enabled", isSecurityActive ? "false" : "true")}
              style={{ background: isSecurityActive ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)", border: isSecurityActive ? "1px solid #22c55e" : "1px solid #ef4444", color: isSecurityActive ? "#4ade80" : "#f87171", padding: "8px 14px", borderRadius: 12, fontWeight: 900, fontSize: 12, cursor: "pointer" }}
            >
              {isSecurityActive ? "ACTIVE (مفعّل)" : "DISABLED"}
            </button>
          </div>

          {/* User Search */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", marginBottom: 10 }}>
              🔍 البحث عن مستخدم وإدارة الحسابات
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => handleSearchUsers(e.target.value)}
                placeholder="Telegram ID أو @username..."
                style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: "8px 12px", color: "#fff", fontSize: 12 }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
              {usersList.slice(0, 50).map((u) => (
                <div
                  key={u.id}
                  onClick={() => handleOpenUserDetail(u.id)}
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 10, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>
                      {u.firstName || u.username || ("ID: " + u.id)} {u.username ? "(@" + u.username + ")" : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      GO: {u.goBalance || u.balance || 0} • Gram: {u.gramBalance || 0} • Refs: {u.referralCount || 0}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#00f2fe", fontWeight: 800 }}>عرض الملف ➔</div>
                </div>
              ))}
            </div>
          </div>

          {/* Auto-Banned Accounts */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#f87171", marginBottom: 10 }}>
              🚫 الحسابات المحظورة تلقائياً ({autoBannedList.length})
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 250, overflowY: "auto" }}>
              {autoBannedList.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>لا توجد حسابات محظورة حالياً</div>
              ) : (
                autoBannedList.map((b) => (
                  <div key={b.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 12 }}>User #{b.userId} ({b.username ? "@" + b.username : "No username"})</div>
                      <div style={{ fontSize: 10, color: "#f87171" }}>السبب: {b.reason}</div>
                    </div>
                    <button
                      onClick={() => handleBanUser(b.userId, false)}
                      style={{ background: "rgba(34, 197, 94, 0.2)", border: "1px solid #22c55e", borderRadius: 8, padding: "4px 8px", color: "#4ade80", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                    >
                      فك الحظر
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* User Profile Detail Modal */}
      {selectedUserDetail && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setSelectedUserDetail(null)}
        >
          <div style={{ background: "#080e24", border: "1px solid rgba(0, 242, 254, 0.4)", borderRadius: 24, padding: 20, maxWidth: 440, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#00f2fe" }}>
                ملف المستخدم #{selectedUserDetail.user.id}
              </div>
              <button onClick={() => setSelectedUserDetail(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12, marginBottom: 16 }}>
              <div>الاسم: <strong>{selectedUserDetail.user.firstName} {selectedUserDetail.user.lastName}</strong></div>
              <div>يوزرنيم: <strong>{selectedUserDetail.user.username ? "@" + selectedUserDetail.user.username : "None"}</strong></div>
              <div>رصيد GO: <strong style={{ color: "#fbbf24" }}>{selectedUserDetail.user.goBalance || selectedUserDetail.user.balance} GO</strong></div>
              <div>رصيد GRAM: <strong style={{ color: "#00f2fe" }}>{selectedUserDetail.user.gramBalance} Gram</strong></div>
              <div>الإحالات: <strong>{selectedUserDetail.user.referralCount}</strong></div>
              <div>المحفظة: <strong>{selectedUserDetail.user.savedWalletAddress || "Not connected"}</strong></div>
              <div>حالة الحظر: <strong style={{ color: selectedUserDetail.isBanned ? "#f87171" : "#4ade80" }}>{selectedUserDetail.isBanned ? "محظور 🚫" : "نشط ✅"}</strong></div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button
                onClick={() => setBalanceAdjustModal({ open: true, userId: selectedUserDetail.user.id, userName: selectedUserDetail.user.firstName || "" })}
                style={{ background: "linear-gradient(135deg, #00f2fe, #3b82f6)", border: "none", borderRadius: 12, padding: 10, color: "#040714", fontWeight: 900, fontSize: 11, cursor: "pointer" }}
              >
                💰 تعديل الرصيد
              </button>

              <button
                onClick={() => setUserMsgModal({ open: true, userId: selectedUserDetail.user.id, isWarning: false })}
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: 10, color: "#fff", fontWeight: 900, fontSize: 11, cursor: "pointer" }}
              >
                📩 إرسال رسالة
              </button>

              <button
                onClick={() => setUserMsgModal({ open: true, userId: selectedUserDetail.user.id, isWarning: true })}
                style={{ background: "rgba(251, 191, 36, 0.15)", border: "1px solid #fbbf24", borderRadius: 12, padding: 10, color: "#fbbf24", fontWeight: 900, fontSize: 11, cursor: "pointer" }}
              >
                ⚠️ إرسال تحذير
              </button>

              <button
                onClick={() => handleBanUser(selectedUserDetail.user.id, !selectedUserDetail.isBanned)}
                style={{ background: selectedUserDetail.isBanned ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)", border: selectedUserDetail.isBanned ? "1px solid #22c55e" : "1px solid #ef4444", borderRadius: 12, padding: 10, color: selectedUserDetail.isBanned ? "#4ade80" : "#f87171", fontWeight: 900, fontSize: 11, cursor: "pointer" }}
              >
                {selectedUserDetail.isBanned ? "فك الحظر" : "حظر الحساب"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Balance Adjust Modal */}
      {balanceAdjustModal.open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#0c1432", border: "1px solid #00f2fe", borderRadius: 20, padding: 20, maxWidth: 360, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#00f2fe", marginBottom: 12 }}>
              تعديل رصيد المستخدم #{balanceAdjustModal.userId}
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {(["add", "deduct", "correct"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setBalanceAdjustForm({ ...balanceAdjustForm, type: t })}
                  style={{ flex: 1, background: balanceAdjustForm.type === t ? "#00f2fe" : "rgba(255,255,255,0.05)", color: balanceAdjustForm.type === t ? "#000" : "#fff", border: "none", borderRadius: 8, padding: "6px 0", fontSize: 11, fontWeight: 900, cursor: "pointer" }}
                >
                  {t === "add" ? "إضافة +" : t === "deduct" ? "خصم -" : "تصحيح ="}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {(["GO", "Gram"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setBalanceAdjustForm({ ...balanceAdjustForm, currency: c })}
                  style={{ flex: 1, background: balanceAdjustForm.currency === c ? "#fbbf24" : "rgba(255,255,255,0.05)", color: balanceAdjustForm.currency === c ? "#000" : "#fff", border: "none", borderRadius: 8, padding: "6px 0", fontSize: 11, fontWeight: 900, cursor: "pointer" }}
                >
                  {c}
                </button>
              ))}
            </div>

            <input
              type="number"
              step="0.01"
              placeholder="المبلغ..."
              value={balanceAdjustForm.amount}
              onChange={(e) => setBalanceAdjustForm({ ...balanceAdjustForm, amount: e.target.value })}
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: 8, color: "#fff", marginBottom: 10, boxSizing: "border-box" }}
            />

            <input
              type="text"
              placeholder="سبب التعديل..."
              value={balanceAdjustForm.reason}
              onChange={(e) => setBalanceAdjustForm({ ...balanceAdjustForm, reason: e.target.value })}
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: 8, color: "#fff", marginBottom: 14, boxSizing: "border-box" }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleAdjustBalance}
                style={{ flex: 1, background: "linear-gradient(135deg, #00f2fe, #7c3aed)", border: "none", borderRadius: 10, padding: 10, color: "#000", fontWeight: 900, cursor: "pointer" }}
              >
                تأكيد التعديل
              </button>
              <button
                onClick={() => setBalanceAdjustModal({ open: false })}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, padding: "10px 16px", color: "#fff", cursor: "pointer" }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Modal */}
      {broadcastModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#0c1432", border: "1px solid #00f2fe", borderRadius: 20, padding: 20, maxWidth: 440, width: "100%" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#00f2fe", marginBottom: 12 }}>
              📢 إرسال رسالة جماعية (Broadcast)
            </div>

            <textarea
              rows={5}
              placeholder="اكتب الرسالة هنا..."
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: 10, color: "#fff", fontSize: 13, marginBottom: 12, boxSizing: "border-box" }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleBroadcast}
                disabled={broadcastSending}
                style={{ flex: 1, background: "linear-gradient(135deg, #00f2fe, #3b82f6)", border: "none", borderRadius: 12, padding: 12, color: "#000", fontWeight: 900, cursor: "pointer" }}
              >
                {broadcastSending ? "جاري الإرسال..." : "بدء الإرسال 🚀"}
              </button>
              <button
                onClick={() => setBroadcastModal(false)}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 12, padding: "12px 18px", color: "#fff", cursor: "pointer" }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Modal */}
      {taskModal.open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#0c1432", border: "1px solid #00f2fe", borderRadius: 20, padding: 20, maxWidth: 380, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#00f2fe", marginBottom: 12 }}>
              إضافة مهمة جديدة
            </div>

            <input
              type="text"
              placeholder="عنوان المهمة..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: 8, color: "#fff", marginBottom: 10, boxSizing: "border-box" }}
            />

            <input
              type="text"
              placeholder="رابط المهمة (مثال: https://t.me/...)"
              value={newTaskUrl}
              onChange={(e) => setNewTaskUrl(e.target.value)}
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: 8, color: "#fff", marginBottom: 10, boxSizing: "border-box" }}
            />

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input
                type="number"
                placeholder="المكافأة"
                value={newTaskReward}
                onChange={(e) => setNewTaskReward(e.target.value)}
                style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: 8, color: "#fff", boxSizing: "border-box" }}
              />
              <select
                value={newTaskCurrency}
                onChange={(e) => setNewTaskCurrency(e.target.value)}
                style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: 8, color: "#fff" }}
              >
                <option value="GO">GO</option>
                <option value="Gram">Gram</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSaveTask}
                style={{ flex: 1, background: "linear-gradient(135deg, #00f2fe, #7c3aed)", border: "none", borderRadius: 10, padding: 10, color: "#000", fontWeight: 900, cursor: "pointer" }}
              >
                حفظ المهمة
              </button>
              <button
                onClick={() => setTaskModal({ open: false })}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, padding: "10px 16px", color: "#fff", cursor: "pointer" }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Balances Confirm Modal */}
      {resetModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#180608", border: "2px solid #ef4444", borderRadius: 24, padding: 24, maxWidth: 380, width: "100%", textAlign: "center" }}>
            <AlertTriangle size={36} color="#ef4444" style={{ margin: "0 auto 12px" }} />
            <div style={{ fontSize: 16, fontWeight: 900, color: "#f87171", marginBottom: 8 }}>
              تأكيد تصفير جميع أرصدة {resetModal}!
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 14 }}>
              سيتم جعل رصيد {resetModal} مساوياً لـ 0 لجميع المستخدمين. لا يمكن التراجع عن هذه الخطوة.
            </p>

            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder={"CONFIRM_RESET_ALL_" + resetModal}
              style={{ width: "100%", background: "rgba(0,0,0,0.6)", border: "1px solid #ef4444", borderRadius: 10, padding: 10, color: "#fff", textAlign: "center", marginBottom: 16, boxSizing: "border-box" }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => handleResetBalances(resetModal)}
                style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 12, padding: 12, color: "#fff", fontWeight: 900, cursor: "pointer" }}
              >
                تصفير نهائي ⚠️
              </button>
              <button
                onClick={() => setResetModal(null)}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 12, padding: "12px 18px", color: "#fff", cursor: "pointer" }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
