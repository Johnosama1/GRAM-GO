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
  AdminPermission,
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
  Search,
  CheckCircle,
  XCircle,
  Key,
  Lock,
  Unlock,
  Radio,
  Sliders,
  Award,
} from "lucide-react";

type SectionTab = "general" | "mining" | "finance" | "tasks" | "users";

const ALL_PERMISSIONS: { key: AdminPermission; label: string }[] = [
  { key: "canViewStats", label: "عرض الإحصائيات (Stats)" },
  { key: "canBroadcast", label: "إرسال رسائل جماعية (Broadcast)" },
  { key: "canManageUsers", label: "إدارة المستخدمين والأرصدة (Users)" },
  { key: "canManageWithdrawals", label: "إدارة السحوبات (Withdrawals)" },
  { key: "canManageDeposits", label: "إدارة الإيداعات (Deposits)" },
  { key: "canManageTasks", label: "إدارة المهام والمسابقات (Tasks)" },
  { key: "canManageChannels", label: "إدارة القنوات الإجبارية (Channels)" },
  { key: "canManageCombo", label: "إدارة Daily Combo" },
  { key: "canManageCheckin", label: "إدارة تسجيل الدخول اليومي" },
  { key: "canManageSettings", label: "إدارة الإعدادات العامة (Settings)" },
  { key: "canManageWallet", label: "إدارة محفظة الإيداع (Wallet)" },
  { key: "canManageApiSettings", label: "إدارة إعدادات API" },
  { key: "canBanUsers", label: "حظر المستخدمين (Ban)" },
  { key: "canManageAdmins", label: "إدارة المشرفين (Admins)" },
  { key: "canUnban", label: "فك الحظر (Unban)" },
  { key: "canWarn", label: "إرسال تحذيرات (Warn)" },
];

export default function AdminPage() {
  const { user, isAdmin } = useUser();
  const [activeSection, setActiveSection] = useState<SectionTab>("general");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);

  // Section 1: General
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [channels, setChannels] = useState<Array<{ username: string; title: string; inviteLink: string; mandatory?: boolean }>>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Section 2: Mining
  const [miningRateInput, setMiningRateInput] = useState("0.0200");

  // Section 3: Finance
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [withdrawalFilter, setWithdrawalFilter] = useState("all");
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [depositFilter, setDepositFilter] = useState("all");
  const [depositSearch, setDepositSearch] = useState("");
  const [limits, setLimits] = useState({
    minWithdrawal: "0.1",
    maxWithdrawal: "10000",
    dailyWithdrawalLimit: "1000",
    minDeposit: "0.1",
    maxDeposit: "50000",
    dailyDepositLimit: "10000",
  });

  // Section 4: Tasks & Rewards
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contests, setContests] = useState<ContestItem[]>([]);
  const [comboStats, setComboStats] = useState<ComboAdminStats | null>(null);
  const [checkinRewards, setCheckinRewards] = useState<Record<number, number>>({
    1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 8, 7: 8, 8: 9, 9: 9, 10: 10,
  });

  // Section 5: Users & Security
  const [usersList, setUsersList] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [autoBannedList, setAutoBannedList] = useState<AutoBannedItem[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEventItem[]>([]);
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [referralSettings, setReferralSettings] = useState({
    referralRewardAmount: "3",
    referralDepositPercent: "10",
    referralThreshold: "5",
  });
  const [walletKeys, setWalletKeys] = useState<{
    tonWalletConfigured: boolean;
    maskedWalletAddress: string;
    hasTelegramBotToken: boolean;
    hasNeonDatabaseUrl: boolean;
    securityStatus: string;
  } | null>(null);

  // Modals & UI States
  const [broadcastModal, setBroadcastModal] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastPin, setBroadcastPin] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);

  const [addAdminModal, setAddAdminModal] = useState(false);
  const [newAdminId, setNewAdminId] = useState("");
  const [newAdminUser, setNewAdminUser] = useState("");
  const [newAdminRole, setNewAdminRole] = useState("admin");
  const [newAdminPerms, setNewAdminPerms] = useState<AdminPermission[]>([]);

  const [channelModal, setChannelModal] = useState(false);
  const [newChannelUser, setNewChannelUser] = useState("");
  const [newChannelTitle, setNewChannelTitle] = useState("");
  const [newChannelLink, setNewChannelLink] = useState("");
  const [newChannelMandatory, setNewChannelMandatory] = useState(true);

  const [resetModal, setResetModal] = useState<"GO" | "GRAM" | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState("");

  const [taskModal, setTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskUrl, setNewTaskUrl] = useState("");
  const [newTaskIcon, setNewTaskIcon] = useState("⭐");
  const [newTaskReward, setNewTaskReward] = useState("5");
  const [newTaskCurrency, setNewTaskCurrency] = useState("GO");
  const [newTaskMaxClaims, setNewTaskMaxClaims] = useState("");

  const [contestModal, setContestModal] = useState(false);
  const [newContest, setNewContest] = useState({
    title: "",
    description: "",
    rewardType: "GO",
    totalReward: "100",
    winnerCount: "3",
    endDate: "",
  });

  const [selectedUserDetail, setSelectedUserDetail] = useState<UserDetailResult | null>(null);
  const [balanceAdjustModal, setBalanceAdjustModal] = useState<{ open: boolean; userId?: number; userName?: string }>({ open: false });
  const [balanceAdjustForm, setBalanceAdjustForm] = useState({
    type: "add" as "add" | "deduct" | "correct",
    currency: "GO" as "GO" | "Gram",
    amount: "",
    reason: "",
  });

  const [userMsgModal, setUserMsgModal] = useState<{ open: boolean; userId?: number; isWarning?: boolean }>({ open: false });
  const [userMsgText, setUserMsgText] = useState("");

  const [deleteUserModal, setDeleteUserModal] = useState<{ open: boolean; userId?: number }>({ open: false });

  const flash = (text: string, type: "ok" | "err" = "ok") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [
        st, set, ad, chn, al, wds, deps, lim, tks, cnts, cmb, chk, ulist, autoB, sec, mls, refs, keys
      ] = await Promise.all([
        api.adminGetStats().catch(() => null),
        api.adminGetSettings().catch(() => ({} as Record<string, string>)),
        api.adminGetAdmins().catch(() => []),
        api.adminGetChannels().catch(() => []),
        api.adminGetAuditLogs().catch(() => []),
        api.adminGetWithdrawals().catch(() => []),
        api.adminGetDeposits().catch(() => []),
        api.adminGetLimits().catch(() => null),
        api.adminGetTasks().catch(() => []),
        api.adminGetContests().catch(() => []),
        api.adminGetComboStats().catch(() => null),
        api.adminGetCheckinSettings().catch(() => ({})),
        api.adminGetUsers().catch(() => []),
        api.adminGetAutoBanned().catch(() => []),
        api.adminGetSecurityEvents().catch(() => []),
        api.adminGetMilestones().catch(() => []),
        api.adminGetReferralSettings().catch(() => null),
        api.adminGetWalletKeys().catch(() => null),
      ]);

      if (st) setStats(st);
      if (set) {
        setSettings(set);
        if (set["global_mining_rate"]) setMiningRateInput(set["global_mining_rate"]);
      }
      setAdmins(ad);
      setChannels(chn);
      setAuditLogs(al);
      setWithdrawals(wds);
      setDeposits(deps);
      if (lim) setLimits(lim);
      setTasks(tks);
      setContests(cnts);
      if (cmb) setComboStats(cmb);
      if (chk && Object.keys(chk).length > 0) setCheckinRewards(chk);
      setUsersList(ulist);
      setAutoBannedList(autoB);
      setSecurityEvents(sec);
      setMilestones(mls);
      if (refs) setReferralSettings(refs);
      if (keys) setWalletKeys(keys);
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

  // Section 1 Handlers
  const handleUpdateSetting = async (key: string, value: string) => {
    try {
      await api.adminUpdateSetting(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
      flash("تم حفظ الإعداد بنجاح ✅");
    } catch {
      flash("فشل حفظ الإعداد", "err");
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
      flash("فشل إرسال الرسالة الجماعية", "err");
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleAddAdmin = async () => {
    const id = parseInt(newAdminId);
    if (isNaN(id)) { flash("Telegram ID غير صحيح", "err"); return; }
    try {
      await api.adminAddAdmin({ id, username: newAdminUser, role: newAdminRole, permissions: newAdminPerms });
      flash("تمت إضافة المشرف بنجاح ✅");
      setAddAdminModal(false);
      setNewAdminId("");
      setNewAdminUser("");
      setNewAdminPerms([]);
      loadAll();
    } catch {
      flash("فشل إضافة المشرف", "err");
    }
  };

  const handleDeleteAdmin = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا المشرف؟")) return;
    try {
      await api.adminDeleteAdmin(id);
      flash("تم حذف المشرف ✅");
      loadAll();
    } catch {
      flash("فشل حذف المشرف", "err");
    }
  };

  const handleAddChannel = async () => {
    if (!newChannelUser.trim()) { flash("يوزر القناة مطلوب", "err"); return; }
    try {
      await api.adminAddChannel({
        username: newChannelUser,
        title: newChannelTitle || newChannelUser,
        inviteLink: newChannelLink || undefined,
        mandatory: newChannelMandatory,
      });
      flash("تم حفظ القناة المطلوبة ✅");
      setChannelModal(false);
      setNewChannelUser("");
      setNewChannelTitle("");
      setNewChannelLink("");
      loadAll();
    } catch {
      flash("فشل حفظ القناة", "err");
    }
  };

  const handleDeleteChannel = async (username: string) => {
    if (!confirm("هل أنت متأكد من إزالة القناة @" + username + "؟")) return;
    try {
      await api.adminDeleteChannel(username);
      flash("تمت إزالة القناة ✅");
      loadAll();
    } catch {
      flash("فشل إزالة القناة", "err");
    }
  };

  // Section 2 Handlers
  const handleSaveMiningRate = async () => {
    const rate = parseFloat(miningRateInput);
    if (isNaN(rate) || rate <= 0 || rate > 1) { flash("النسبة يجب أن تكون بين 0.001 (0.1%) و 1.0 (100%)", "err"); return; }
    try {
      const res = await api.adminUpdateMiningRate(rate);
      flash("تم تحديث معدل التعدين إلى " + res.percentage + " ✅");
      loadAll();
    } catch {
      flash("فشل تحديث معدل التعدين", "err");
    }
  };

  // Section 3 Handlers
  const handleWithdrawalAction = async (id: number, action: "approve" | "reject") => {
    const reason = action === "reject" ? prompt("سبب الرفض (سيتم إرساله للمستخدم وإعادة الرصيد):") || undefined : undefined;
    try {
      await api.adminUpdateWithdrawal(id, action, reason);
      flash(action === "approve" ? "تمت الموافقة على السحب ✅" : "تم رفض السحب وإعادة الرصيد ✅");
      loadAll();
    } catch {
      flash("فشل تنفيذ الإجراء", "err");
    }
  };

  const handleSaveLimits = async () => {
    try {
      await api.adminUpdateLimits(limits);
      flash("تم حفظ الحدود المالية بنجاح ✅");
    } catch {
      flash("فشل حفظ الحدود المالية", "err");
    }
  };

  const handleResetBalances = async (currency: "GO" | "GRAM") => {
    const required = currency === "GO" ? "CONFIRM_RESET_ALL_GO" : "CONFIRM_RESET_ALL_GRAM";
    if (resetConfirmText !== required) {
      flash("يجب كتابة العبارة التالية بدقة: " + required, "err");
      return;
    }
    try {
      if (currency === "GO") {
        const res = await api.adminResetGoBalances(resetConfirmText);
        flash("تم تصفير رصيد GO لـ " + res.affectedUsers + " مستخدم بنجاح ✅");
      } else {
        const res = await api.adminResetGramBalances(resetConfirmText);
        flash("تم تصفير رصيد GRAM لـ " + res.affectedUsers + " مستخدم بنجاح ✅");
      }
      setResetModal(null);
      setResetConfirmText("");
      loadAll();
    } catch {
      flash("فشل تصفير الأرصدة", "err");
    }
  };

  // Section 4 Handlers
  const handleSaveTask = async () => {
    if (!newTaskTitle.trim()) { flash("عنوان المهمة مطلوب", "err"); return; }
    try {
      await api.adminCreateTask({
        title: newTaskTitle,
        description: newTaskDesc || undefined,
        url: newTaskUrl || undefined,
        icon: newTaskIcon || "⭐",
        rewardAmount: newTaskReward,
        rewardCurrency: newTaskCurrency,
        maxClaims: newTaskMaxClaims ? parseInt(newTaskMaxClaims) : null,
      });
      flash("تم إنشاء المهمة بنجاح ✅");
      setTaskModal(false);
      setNewTaskTitle("");
      setNewTaskDesc("");
      setNewTaskUrl("");
      setNewTaskMaxClaims("");
      loadAll();
    } catch {
      flash("فشل إنشاء المهمة", "err");
    }
  };

  const handleDeleteTask = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذه المهمة؟")) return;
    try {
      await api.adminDeleteTask(id);
      flash("تم حذف المهمة ✅");
      loadAll();
    } catch {
      flash("فشل حذف المهمة", "err");
    }
  };

  const handleCreateContest = async () => {
    if (!newContest.title || !newContest.endDate) { flash("العنوان وتاريخ الانتهاء مطلوبان", "err"); return; }
    try {
      await api.adminCreateContest({ ...newContest, winnerCount: parseInt(newContest.winnerCount) || 3 });
      flash("تم إنشاء المسابقة بنجاح ✅");
      setContestModal(false);
      loadAll();
    } catch {
      flash("فشل إنشاء المسابقة", "err");
    }
  };

  const handleFinalizeContest = async (id: number) => {
    if (!confirm("إنهاء المسابقة وتوزيع الجوائز على الفائزين الآن؟")) return;
    try {
      const res = await api.adminFinalizeContest(id);
      flash("تم إنهاء المسابقة وتوزيع الجوائز على " + res.winners.length + " فائز بنجاح! 🏆");
      loadAll();
    } catch {
      flash("فشل إنهاء المسابقة", "err");
    }
  };

  const handleSaveCheckinDay = async (day: number, amount: number) => {
    const updated = { ...checkinRewards, [day]: amount };
    try {
      await api.adminUpdateCheckinSettings(updated);
      setCheckinRewards(updated);
      flash("تم تحديث مكافأة اليوم " + day + " إلى " + amount + " GO ✅");
    } catch {
      flash("فشل تحديث مكافأة اليوم", "err");
    }
  };

  // Section 5 Handlers
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
      flash("فشل جلب ملف المستخدم", "err");
    }
  };

  const handleAdjustBalance = async () => {
    if (!balanceAdjustModal.userId) return;
    const amt = parseFloat(balanceAdjustForm.amount);
    if (isNaN(amt) || amt <= 0) { flash("يرجى إدخال مبلغ صحيح وموجب", "err"); return; }
    try {
      await api.adminAdjustBalance(balanceAdjustModal.userId, {
        type: balanceAdjustForm.type,
        currency: balanceAdjustForm.currency,
        amount: amt,
        reason: balanceAdjustForm.reason || "Admin adjustment",
      });
      flash("تم تعديل الرصيد بنجاح ✅");
      setBalanceAdjustModal({ open: false });
      if (selectedUserDetail?.user.id === balanceAdjustModal.userId) {
        handleOpenUserDetail(balanceAdjustModal.userId);
      }
      loadAll();
    } catch {
      flash("فشل تعديل الرصيد", "err");
    }
  };

  const handleSendMessageToUser = async () => {
    if (!userMsgModal.userId || !userMsgText.trim()) return;
    try {
      await api.adminSendMessage(userMsgModal.userId, {
        message: userMsgText,
        isWarning: userMsgModal.isWarning,
      });
      flash(userMsgModal.isWarning ? "تم إرسال التحذير بنجاح عبر تليجرام ⚠️" : "تم إرسال الرسالة بنجاح عبر تليجرام 📩");
      setUserMsgModal({ open: false });
      setUserMsgText("");
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "فشل إرسال الرسالة", "err");
    }
  };

  const handleBanUser = async (id: number, ban: boolean) => {
    const reason = ban ? prompt("سبب الحظر:") || "Admin manual ban" : undefined;
    try {
      if (ban) {
        await api.adminBanUser(id, reason);
        flash("تم حظر المستخدم #" + id + " 🚫");
      } else {
        await api.adminUnbanUser(id);
        flash("تم فك حظر المستخدم #" + id + " ✅");
      }
      if (selectedUserDetail?.user.id === id) {
        handleOpenUserDetail(id);
      }
      loadAll();
    } catch {
      flash("فشل إجراء الحظر/فك الحظر", "err");
    }
  };

  const handleToggleWithdrawalBan = async (id: number, currentBanned: boolean) => {
    try {
      if (currentBanned) {
        await api.adminUnbanWithdrawals(id);
        flash("تم السماح بالسحب للمستخدم #" + id + " ✅");
      } else {
        await api.adminBanWithdrawals(id);
        flash("تم حظر السحب للمستخدم #" + id + " 🔒");
      }
      if (selectedUserDetail?.user.id === id) {
        handleOpenUserDetail(id);
      }
      loadAll();
    } catch {
      flash("فشل تعديل حظر السحب", "err");
    }
  };

  const handleDeleteUserAccount = async () => {
    if (!deleteUserModal.userId) return;
    try {
      await api.adminDeleteUser(deleteUserModal.userId);
      flash("تم حذف الحساب بنجاح 🗑️");
      setDeleteUserModal({ open: false });
      setSelectedUserDetail(null);
      loadAll();
    } catch {
      flash("فشل حذف الحساب", "err");
    }
  };

  const handleSaveReferralSettings = async () => {
    try {
      await api.adminUpdateReferralSettings(referralSettings);
      flash("تم حفظ إعدادات الإحالات بنجاح ✅");
    } catch {
      flash("فشل حفظ إعدادات الإحالات", "err");
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#f87171" }}>
        <h2>⛔ غير مصرح بالوصول (Unauthorized Access)</h2>
        <p>لا تملك صلاحيات إدارية لفتح لوحة التحكم.</p>
      </div>
    );
  }

  const isMaintenance = settings["maintenance_mode"] === "true";
  const isSecurityActive = settings["security_system_enabled"] !== "false";

  // Filtered withdrawals & deposits
  const filteredWithdrawals = withdrawals.filter((w) => {
    if (withdrawalFilter !== "all" && w.status !== withdrawalFilter) return false;
    if (withdrawalSearch) {
      const q = withdrawalSearch.toLowerCase();
      const matchId = String(w.userId).includes(q) || String(w.id).includes(q);
      const matchUser = w.username?.toLowerCase().includes(q) || w.firstName?.toLowerCase().includes(q);
      const matchAddr = w.walletAddress.toLowerCase().includes(q);
      return matchId || matchUser || matchAddr;
    }
    return true;
  });

  const filteredDeposits = deposits.filter((d) => {
    if (depositFilter !== "all" && d.status !== depositFilter) return false;
    if (depositSearch) {
      const q = depositSearch.toLowerCase();
      const matchId = String(d.userId).includes(q);
      const matchUser = d.username?.toLowerCase().includes(q) || d.firstName?.toLowerCase().includes(q);
      const matchHash = d.txHash?.toLowerCase().includes(q);
      return matchId || matchUser || matchHash;
    }
    return true;
  });

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 760,
        margin: "0 auto",
        padding: "16px 14px 110px",
        minHeight: "100vh",
        background: "linear-gradient(180deg, #060a18 0%, #030610 100%)",
        color: "#ffffff",
        boxSizing: "border-box",
        direction: "rtl",
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
              لوحة تحكم GRAMGO
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              مرحباً {user?.firstName || "Admin"} (ID: {user?.id})
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
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> تحديث
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

      {/* ==================================================================== */}
      {/* SECTION 1: General Administration */}
      {/* ==================================================================== */}
      {activeSection === "general" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Quick Actions */}
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
              <Power size={16} /> وضع الصيانة: {isMaintenance ? "ON (مفعّل)" : "OFF (معطّل)"}
            </button>
          </div>

          {/* Real Database Statistics Grid */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", marginBottom: 12 }}>
              📊 إحصائيات البوت الحقيقية (Neon PostgreSQL Live Data)
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>إجمالي المستخدمين</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>{stats?.totalUsers ?? 0}</div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>نشط الآن (15 دقيقة)</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#4ade80" }}>{stats?.activeNow ?? 0}</div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>نشط آخر 24 ساعة</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#60a5fa" }}>{stats?.active24h ?? 0}</div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>المحظورين يدوياً</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#f87171" }}>{stats?.bannedAccounts ?? 0}</div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>المحظورين تلقائياً (Anti-Cheat)</div>
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
                <Globe size={14} /> توزيع المستخدمين حسب الدولة / المنطقة الزمنية:
              </div>
              {stats?.countries && stats.countries.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {stats.countries.map((c, i) => (
                    <div key={i} style={{ background: "rgba(0, 242, 254, 0.1)", border: "1px solid rgba(0, 242, 254, 0.3)", borderRadius: 8, padding: "4px 8px", fontSize: 11 }}>
                      {c.region}: <strong>{c.count}</strong> ({c.percentage}%)
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>غير متاح (Not Available — لا تتوفر بيانات جغرافية رسمية حالياً)</div>
              )}
            </div>
          </div>

          {/* Welcome Message Editor & Preview */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <MessageSquare size={16} /> تعديل رسالة الترحيب لأمر /start في تليجرام
            </div>
            <textarea
              rows={4}
              value={settings["welcome_message"] || ""}
              onChange={(e) => setSettings({ ...settings, welcome_message: e.target.value })}
              placeholder="اكتب رسالة الترحيب هنا (يدعم HTML tags مثل <b> و <i> و <code>)..."
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: 10, color: "#fff", fontSize: 12, boxSizing: "border-box", marginBottom: 10 }}
            />
            <button
              onClick={() => handleUpdateSetting("welcome_message", settings["welcome_message"] || "")}
              style={{ background: "linear-gradient(135deg, #00f2fe, #7c3aed)", border: "none", borderRadius: 12, padding: "8px 16px", color: "#040714", fontWeight: 900, fontSize: 12, cursor: "pointer" }}
            >
              حفظ رسالة الترحيب
            </button>
          </div>

          {/* Required Channels Management */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", display: "flex", alignItems: "center", gap: 6 }}>
                <Radio size={16} /> قنوات الاشتراك الإجباري ({channels.length})
              </div>
              <button
                onClick={() => setChannelModal(true)}
                style={{ background: "rgba(0, 242, 254, 0.15)", border: "1px solid rgba(0, 242, 254, 0.4)", borderRadius: 10, padding: "4px 10px", color: "#00f2fe", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <Plus size={12} /> إضافة قناة
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {channels.length === 0 ? (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>لا توجد قنوات إجبارية مضافة حالياً.</div>
              ) : (
                channels.map((c) => (
                  <div key={c.username} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 12, color: "#fff" }}>
                        {c.title} (@{c.username})
                      </div>
                      <div style={{ fontSize: 10, color: "#38bdf8" }}>
                        {c.inviteLink} • {c.mandatory !== false ? "إجباري للدخول والسحب" : "اختياري"}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteChannel(c.username)}
                      style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: 8, padding: 6, color: "#f87171", cursor: "pointer" }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Admins & Moderators Manager */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", display: "flex", alignItems: "center", gap: 6 }}>
                <Shield size={16} /> إدارة المشرفين والصلاحيات الدقيقة ({admins.length})
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
                      {ad.username ? "@" + ad.username : "ID: " + ad.id} ({ad.role === "owner" ? "👑 المالك" : "مشرف"})
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                      الصلاحيات: {ad.permissions?.length ? ad.permissions.join(", ") : "جميع الصلاحيات (Full Permissions)"}
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

          {/* Audit Logs */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", marginBottom: 10 }}>
              📜 سجل العمليات الإدارية (Audit Logs)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
              {auditLogs.slice(0, 30).map((log) => (
                <div key={log.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: 8, fontSize: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#38bdf8" }}>
                    <strong>{log.action}</strong>
                    <span>Admin #{log.adminId}</span>
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, marginTop: 2 }}>
                    {log.details ? JSON.stringify(log.details) : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 2: Mining Configuration */}
      {/* ==================================================================== */}
      {activeSection === "mining" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#00f2fe", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Zap size={18} /> إعدادات معدل التعدين اليومي (Global Mining Rate)
            </div>

            <div style={{ background: "rgba(0, 242, 254, 0.08)", border: "1px solid rgba(0, 242, 254, 0.3)", borderRadius: 14, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>المعدل العالمي الحالي:</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#00f2fe" }}>
                {(parseFloat(settings["global_mining_rate"] || "0.0200") * 100).toFixed(2)}% يومياً
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                يتم حساب أرباح GRAM لحظياً لكل مستخدم وفق هذه النسبة بناءً على رصيد عملات GO الخاصة به.
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#fbbf24", marginBottom: 6 }}>
                💡 محاكاة الإنتاج عند النسبة المحددة:
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                حساب يمتلك 100 GO سينتج: <strong>+{(100 * (parseFloat(miningRateInput) || 0.02)).toFixed(4)} GRAM / يوم</strong>
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
                placeholder="مثال: 0.0200"
                style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: "10px 14px", color: "#fff", fontSize: 14, fontWeight: 800 }}
              />
              <button
                onClick={handleSaveMiningRate}
                style={{ background: "linear-gradient(135deg, #00f2fe, #7c3aed)", border: "none", borderRadius: 12, padding: "10px 20px", color: "#040714", fontWeight: 900, fontSize: 13, cursor: "pointer" }}
              >
                حفظ وتطبيق النسبة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 3: Finance & Wallet */}
      {/* ==================================================================== */}
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

          {/* Deposit Wallet Address */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", marginBottom: 8 }}>
              💼 عنوان محفظة الإيداع الرسمية (Deposit Wallet Address)
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={settings["deposit_wallet_address"] || ""}
                onChange={(e) => setSettings({ ...settings, deposit_wallet_address: e.target.value })}
                placeholder="عنوان TON يبدأ بـ EQ أو UQ..."
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

          {/* Financial Limits */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", display: "flex", alignItems: "center", gap: 6 }}>
                <Sliders size={16} /> حدود السحب والإيداع (Limits)
              </div>
              <button
                onClick={handleSaveLimits}
                style={{ background: "linear-gradient(135deg, #00f2fe, #7c3aed)", border: "none", borderRadius: 10, padding: "6px 12px", color: "#040714", fontWeight: 900, fontSize: 11, cursor: "pointer" }}
              >
                حفظ الحدود
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>أدنى حد للسحب (TON):</label>
                <input
                  type="number"
                  step="0.01"
                  value={limits.minWithdrawal}
                  onChange={(e) => setLimits({ ...limits, minWithdrawal: e.target.value })}
                  style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: 8, color: "#fff", fontSize: 12, boxSizing: "border-box", marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>أقصى حد للسحب (TON):</label>
                <input
                  type="number"
                  step="1"
                  value={limits.maxWithdrawal}
                  onChange={(e) => setLimits({ ...limits, maxWithdrawal: e.target.value })}
                  style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: 8, color: "#fff", fontSize: 12, boxSizing: "border-box", marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>الحد اليومي للسحب (TON):</label>
                <input
                  type="number"
                  step="1"
                  value={limits.dailyWithdrawalLimit}
                  onChange={(e) => setLimits({ ...limits, dailyWithdrawalLimit: e.target.value })}
                  style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: 8, color: "#fff", fontSize: 12, boxSizing: "border-box", marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>أدنى حد للإيداع (TON):</label>
                <input
                  type="number"
                  step="0.01"
                  value={limits.minDeposit}
                  onChange={(e) => setLimits({ ...limits, minDeposit: e.target.value })}
                  style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: 8, color: "#fff", fontSize: 12, boxSizing: "border-box", marginTop: 4 }}
                />
              </div>
            </div>
          </div>

          {/* Withdrawals List with Search and Status Filter */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe" }}>
                💳 طلبات السحب ({filteredWithdrawals.length})
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                type="text"
                value={withdrawalSearch}
                onChange={(e) => setWithdrawalSearch(e.target.value)}
                placeholder="بحث بالـ ID أو اليوزر أو المحفظة..."
                style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "6px 10px", color: "#fff", fontSize: 11 }}
              />
              <select
                value={withdrawalFilter}
                onChange={(e) => setWithdrawalFilter(e.target.value)}
                style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "6px 8px", color: "#fff", fontSize: 11 }}
              >
                <option value="all">جميع الحالات</option>
                <option value="pending">معلق (Pending)</option>
                <option value="approved">موافق عليه (Approved)</option>
                <option value="rejected">مرفوض (Rejected)</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 350, overflowY: "auto" }}>
              {filteredWithdrawals.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>لا توجد طلبات سحب مطابقة.</div>
              ) : (
                filteredWithdrawals.map((w) => (
                  <div key={w.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>
                        {w.firstName || w.username || ("مستخدم #" + w.userId)} • <strong>{parseFloat(w.amount).toFixed(4)} {w.currency}</strong>
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

          {/* Deposits List */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe" }}>
                📥 الإيداعات ({filteredDeposits.length})
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                type="text"
                value={depositSearch}
                onChange={(e) => setDepositSearch(e.target.value)}
                placeholder="بحث بالـ ID أو الهاش..."
                style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "6px 10px", color: "#fff", fontSize: 11 }}
              />
              <select
                value={depositFilter}
                onChange={(e) => setDepositFilter(e.target.value)}
                style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "6px 8px", color: "#fff", fontSize: 11 }}
              >
                <option value="all">جميع الحالات</option>
                <option value="confirmed">مؤكد (Confirmed)</option>
                <option value="pending">معلق (Pending)</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 250, overflowY: "auto" }}>
              {filteredDeposits.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>لا توجد إيداعات مسجلة.</div>
              ) : (
                filteredDeposits.map((d) => (
                  <div key={d.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 10, fontSize: 11 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
                      <span>User #{d.userId} ({d.firstName || d.username || "None"})</span>
                      <span style={{ color: "#4ade80" }}>+{parseFloat(d.amount).toFixed(4)} {d.currency}</span>
                    </div>
                    {d.txHash && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2, wordBreak: "break-all" }}>Hash: {d.txHash}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 4: Tasks & Rewards */}
      {/* ==================================================================== */}
      {activeSection === "tasks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Tasks Manager */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe" }}>
                📋 إدارة المهام ({tasks.length})
              </div>
              <button
                onClick={() => setTaskModal(true)}
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
                    <div style={{ fontSize: 11, color: "#fbbf24" }}>+{t.rewardAmount || 5} {t.rewardCurrency || "GO"} • {t.url || "No link"}</div>
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

          {/* Daily Combo Stats & Items Pool */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe" }}>
                🧩 نظام Daily Combo اليوم ({comboStats?.todayDate})
              </div>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 6 }}>
                ينتهي عند 23:59:59 UTC
              </span>
            </div>

            {/* 3 Correct Item Cards */}
            {comboStats?.combo && (
              <div style={{ background: "rgba(0, 242, 254, 0.05)", border: "1px solid rgba(0, 242, 254, 0.15)", borderRadius: 16, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#93c5fd", marginBottom: 8 }}>العناصر الصحيحة لليوم (3 Slots):</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {[comboStats.combo.item1, comboStats.combo.item2, comboStats.combo.item3].map((it, idx) => (
                    <div key={idx} style={{ background: "rgba(6, 10, 24, 0.8)", border: "1px solid rgba(0, 242, 254, 0.4)", borderRadius: 12, padding: 8, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                      <img
                        src={it.image || `/combo/combo_${it.id}.png`}
                        alt={it.name}
                        style={{ width: 44, height: 44, objectFit: "contain", marginBottom: 4, filter: "drop-shadow(0 0 6px rgba(0, 242, 254, 0.4))" }}
                      />
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>{it.name}</span>
                      <span style={{ fontSize: 9, color: "#38bdf8", marginTop: 1 }}>Slot {idx + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3 Metric Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>المحاولات اليوم</div>
                <div style={{ fontSize: 16, fontWeight: 900, marginTop: 2 }}>{comboStats?.totalAttemptsToday ?? 0}</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>الحلول الناجحة</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: "#4ade80", marginTop: 2 }}>{comboStats?.successfulSolvesToday ?? 0}</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 12, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>GO الموزعة</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: "#fbbf24", marginTop: 2 }}>{comboStats?.totalRewardsDistributed ?? "0 GO"}</div>
              </div>
            </div>

            {/* Recent Attempts List */}
            {comboStats?.recentAttempts && comboStats.recentAttempts.length > 0 && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>
                  📋 آخر محاولات اليوم ({comboStats.recentAttempts.length}):
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                  {comboStats.recentAttempts.map((att) => (
                    <div
                      key={att.id}
                      style={{
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        borderRadius: 8,
                        padding: "6px 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: 11,
                      }}
                    >
                      <div>
                        <span style={{ color: "#fff", fontWeight: 700 }}>
                          {att.firstName || att.username || `User ${att.userId}`}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>ID: {att.userId}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>
                          [{att.selectedItems.join(", ")}]
                        </span>
                        {att.isSuccess ? (
                          <span style={{ color: "#4ade80", fontWeight: 900, background: "rgba(74, 222, 128, 0.15)", padding: "1px 6px", borderRadius: 4 }}>
                            +5 GO
                          </span>
                        ) : (
                          <span style={{ color: "#f87171", fontWeight: 700, background: "rgba(239, 68, 68, 0.15)", padding: "1px 6px", borderRadius: 4 }}>
                            Failed
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                    value={checkinRewards[day] ?? (day === 1 ? 2 : day === 2 ? 3 : day === 3 ? 4 : day === 4 ? 5 : day === 5 ? 6 : day === 6 ? 8 : day === 7 ? 8 : day === 8 ? 9 : day === 9 ? 9 : 10)}
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
                      إنهاء وتوزيع الجوائز 🏆
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 5: Users & Security */}
      {/* ==================================================================== */}
      {activeSection === "users" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Security Master Switch */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#fff" }}>
                🛡️ نظام الحماية التلقائي (Defensive Security & Anti-Cheat)
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                فحص البصمات، منع الحسابات المتعددة، حظر التحايل التلقائي
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
                      فك الحظر ✅
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Referral & Milestone Settings */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe" }}>
                👥 إعدادات الإحالات والمكافآت
              </div>
              <button
                onClick={handleSaveReferralSettings}
                style={{ background: "linear-gradient(135deg, #00f2fe, #7c3aed)", border: "none", borderRadius: 10, padding: "6px 12px", color: "#040714", fontWeight: 900, fontSize: 11, cursor: "pointer" }}
              >
                حفظ الإعدادات
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>مكافأة الإحالة الأساسية (GO):</label>
                <input
                  type="number"
                  value={referralSettings.referralRewardAmount}
                  onChange={(e) => setReferralSettings({ ...referralSettings, referralRewardAmount: e.target.value })}
                  style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: 8, color: "#fff", fontSize: 12, boxSizing: "border-box", marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>نسبة عمولة الإيداع (%):</label>
                <input
                  type="number"
                  value={referralSettings.referralDepositPercent}
                  onChange={(e) => setReferralSettings({ ...referralSettings, referralDepositPercent: e.target.value })}
                  style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: 8, color: "#fff", fontSize: 12, boxSizing: "border-box", marginTop: 4 }}
                />
              </div>
            </div>
          </div>

          {/* Masked Wallet & API Keys Card */}
          <div style={{ background: "rgba(10, 18, 42, 0.8)", border: "1px solid rgba(0, 242, 254, 0.2)", borderRadius: 20, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#00f2fe", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <Key size={16} /> حالة مفاتيح الدفع والربط المشفرة (Masked Security Keys)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", background: "rgba(255,255,255,0.02)", padding: 8, borderRadius: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>محفظة البوت الإدارية (TON Wallet):</span>
                <strong style={{ color: walletKeys?.tonWalletConfigured ? "#4ade80" : "#f87171" }}>
                  {walletKeys?.maskedWalletAddress || "Not Configured"}
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", background: "rgba(255,255,255,0.02)", padding: 8, borderRadius: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>مفتاح بوت تليجرام (BOT_TOKEN):</span>
                <strong style={{ color: walletKeys?.hasTelegramBotToken ? "#4ade80" : "#f87171" }}>
                  {walletKeys?.hasTelegramBotToken ? "•••••••••• (مربوط ومحمي)" : "مفقود"}
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", background: "rgba(255,255,255,0.02)", padding: 8, borderRadius: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>قاعدة بيانات Neon PostgreSQL:</span>
                <strong style={{ color: walletKeys?.hasNeonDatabaseUrl ? "#4ade80" : "#f87171" }}>
                  {walletKeys?.hasNeonDatabaseUrl ? "•••••••••• (متصلة ومحمية)" : "مفقودة"}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODALS & DRAWERS */}
      {/* ==================================================================== */}

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
              <div>رصيد TON: <strong style={{ color: "#a855f7" }}>{selectedUserDetail.user.tonBalance} TON</strong></div>
              <div>الإحالات: <strong>{selectedUserDetail.user.referralCount}</strong></div>
              <div>المحفظة المحفوظة: <strong>{selectedUserDetail.user.savedWalletAddress || "Not connected"}</strong></div>
              <div>حالة الحظر: <strong style={{ color: selectedUserDetail.isBanned ? "#f87171" : "#4ade80" }}>{selectedUserDetail.isBanned ? "محظور 🚫" : "نشط ✅"}</strong></div>
              <div>حظر السحب: <strong style={{ color: selectedUserDetail.isWithdrawalBanned ? "#f87171" : "#4ade80" }}>{selectedUserDetail.isWithdrawalBanned ? "محظور من السحب 🔒" : "مسموح بالسحب 🔓"}</strong></div>
            </div>

            {/* Quick Management Buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
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
                {selectedUserDetail.isBanned ? "فك حظر الحساب" : "حظر الحساب"}
              </button>

              <button
                onClick={() => handleToggleWithdrawalBan(selectedUserDetail.user.id, selectedUserDetail.isWithdrawalBanned || false)}
                style={{ background: selectedUserDetail.isWithdrawalBanned ? "rgba(34, 197, 94, 0.2)" : "rgba(251, 191, 36, 0.2)", border: selectedUserDetail.isWithdrawalBanned ? "1px solid #22c55e" : "1px solid #fbbf24", borderRadius: 12, padding: 10, color: selectedUserDetail.isWithdrawalBanned ? "#4ade80" : "#fbbf24", fontWeight: 900, fontSize: 11, cursor: "pointer" }}
              >
                {selectedUserDetail.isWithdrawalBanned ? "السماح بالسحب 🔓" : "حظر السحب 🔒"}
              </button>

              <button
                onClick={() => setDeleteUserModal({ open: true, userId: selectedUserDetail.user.id })}
                style={{ background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", borderRadius: 12, padding: 10, color: "#f87171", fontWeight: 900, fontSize: 11, cursor: "pointer" }}
              >
                🗑️ حذف الحساب
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

      {/* User Message / Warning Modal */}
      {userMsgModal.open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#0c1432", border: "1px solid #00f2fe", borderRadius: 20, padding: 20, maxWidth: 400, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: userMsgModal.isWarning ? "#fbbf24" : "#00f2fe", marginBottom: 12 }}>
              {userMsgModal.isWarning ? "⚠️ إرسال تحذير للمستخدم" : "📩 إرسال رسالة للمستخدم"} #{userMsgModal.userId}
            </div>

            <textarea
              rows={4}
              placeholder="اكتب الرسالة..."
              value={userMsgText}
              onChange={(e) => setUserMsgText(e.target.value)}
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 12, marginBottom: 12, boxSizing: "border-box" }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSendMessageToUser}
                style={{ flex: 1, background: userMsgModal.isWarning ? "#fbbf24" : "linear-gradient(135deg, #00f2fe, #3b82f6)", border: "none", borderRadius: 10, padding: 10, color: "#000", fontWeight: 900, cursor: "pointer" }}
              >
                إرسال الآن 🚀
              </button>
              <button
                onClick={() => setUserMsgModal({ open: false })}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, padding: "10px 16px", color: "#fff", cursor: "pointer" }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {deleteUserModal.open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#180608", border: "2px solid #ef4444", borderRadius: 24, padding: 24, maxWidth: 380, width: "100%", textAlign: "center" }}>
            <AlertTriangle size={36} color="#ef4444" style={{ margin: "0 auto 12px" }} />
            <div style={{ fontSize: 16, fontWeight: 900, color: "#f87171", marginBottom: 8 }}>
              تأكيد حذف حساب المستخدم #{deleteUserModal.userId}
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 14 }}>
              سيتم حظر الحساب وتصفير أرصدته مع الحفاظ على السجلات المالية في قاعدة البيانات لضمان دقة التقارير.
            </p>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleDeleteUserAccount}
                style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 12, padding: 12, color: "#fff", fontWeight: 900, cursor: "pointer" }}
              >
                تأكيد الحذف 🗑️
              </button>
              <button
                onClick={() => setDeleteUserModal({ open: false })}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 12, padding: "12px 18px", color: "#fff", cursor: "pointer" }}
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
              placeholder="اكتب الرسالة هنا (يدعم HTML و Telegram Custom Emojis)..."
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: 10, color: "#fff", fontSize: 13, marginBottom: 12, boxSizing: "border-box" }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <input
                type="checkbox"
                id="pinMsg"
                checked={broadcastPin}
                onChange={(e) => setBroadcastPin(e.target.checked)}
              />
              <label htmlFor="pinMsg" style={{ fontSize: 12, color: "#fff", cursor: "pointer" }}>
                تثبيت الرسالة في شات المستخدم (Pin Message)
              </label>
            </div>

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

      {/* Add Admin Modal */}
      {addAdminModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#0c1432", border: "1px solid #00f2fe", borderRadius: 20, padding: 20, maxWidth: 420, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#00f2fe", marginBottom: 12 }}>
              إضافة مشرف جديد وتحديد الصلاحيات
            </div>

            <input
              type="number"
              placeholder="Telegram ID للمشرف..."
              value={newAdminId}
              onChange={(e) => setNewAdminId(e.target.value)}
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: 8, color: "#fff", marginBottom: 10, boxSizing: "border-box" }}
            />

            <input
              type="text"
              placeholder="يوزر المشرف (اختياري)..."
              value={newAdminUser}
              onChange={(e) => setNewAdminUser(e.target.value)}
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: 8, color: "#fff", marginBottom: 10, boxSizing: "border-box" }}
            />

            <div style={{ fontSize: 12, fontWeight: 800, color: "#38bdf8", marginBottom: 6 }}>
              تحديد الصلاحيات الممنوحة:
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {ALL_PERMISSIONS.map((p) => {
                const checked = newAdminPerms.includes(p.key);
                return (
                  <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (checked) {
                          setNewAdminPerms(newAdminPerms.filter((x) => x !== p.key));
                        } else {
                          setNewAdminPerms([...newAdminPerms, p.key]);
                        }
                      }}
                    />
                    <span>{p.label}</span>
                  </label>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleAddAdmin}
                style={{ flex: 1, background: "linear-gradient(135deg, #00f2fe, #7c3aed)", border: "none", borderRadius: 10, padding: 10, color: "#000", fontWeight: 900, cursor: "pointer" }}
              >
                إضافة المشرف
              </button>
              <button
                onClick={() => setAddAdminModal(false)}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, padding: "10px 16px", color: "#fff", cursor: "pointer" }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Channel Modal */}
      {channelModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#0c1432", border: "1px solid #00f2fe", borderRadius: 20, padding: 20, maxWidth: 380, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#00f2fe", marginBottom: 12 }}>
              إضافة قناة اشتراك إجباري
            </div>

            <input
              type="text"
              placeholder="يوزر القناة بدون @ (مثال: my_channel)..."
              value={newChannelUser}
              onChange={(e) => setNewChannelUser(e.target.value)}
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: 8, color: "#fff", marginBottom: 10, boxSizing: "border-box" }}
            />

            <input
              type="text"
              placeholder="اسم القناة الظاهر..."
              value={newChannelTitle}
              onChange={(e) => setNewChannelTitle(e.target.value)}
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: 8, color: "#fff", marginBottom: 10, boxSizing: "border-box" }}
            />

            <input
              type="text"
              placeholder="رابط الدعوة (https://t.me/...)"
              value={newChannelLink}
              onChange={(e) => setNewChannelLink(e.target.value)}
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: 8, color: "#fff", marginBottom: 12, boxSizing: "border-box" }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <input
                type="checkbox"
                id="mandChn"
                checked={newChannelMandatory}
                onChange={(e) => setNewChannelMandatory(e.target.checked)}
              />
              <label htmlFor="mandChn" style={{ fontSize: 11, color: "#fff", cursor: "pointer" }}>
                اشتراك إجباري للدخول والسحب
              </label>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleAddChannel}
                style={{ flex: 1, background: "linear-gradient(135deg, #00f2fe, #7c3aed)", border: "none", borderRadius: 10, padding: 10, color: "#000", fontWeight: 900, cursor: "pointer" }}
              >
                حفظ القناة
              </button>
              <button
                onClick={() => setChannelModal(false)}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, padding: "10px 16px", color: "#fff", cursor: "pointer" }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Modal */}
      {taskModal && (
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
                onClick={() => setTaskModal(false)}
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
              سيتم جعل رصيد {resetModal} مساوياً لـ 0 لجميع المستخدمين في قاعدة البيانات.
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

