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
  Radio,
  Sliders,
  Award,
  ChevronDown,
  ChevronUp,
  PlayCircle,
  Eye,
  EyeOff,
  Edit2,
  Copy,
  ExternalLink,
  Lock,
  Unlock,
  BarChart2,
  Check,
  CheckSquare,
  Square,
  FileText,
  Settings,
  Link,
  Ticket,
  Flame,
} from "lucide-react";

type SectionTab = "general" | "mining" | "finance" | "tasks" | "ads" | "users";

const ALL_PERMISSIONS: { key: AdminPermission; label: string }[] = [
  { key: "canViewStats", label: "عرض الإحصائيات (Stats)" },
  { key: "canBroadcast", label: "إرسال للجميع (Broadcast)" },
  { key: "canManageSettings", label: "رسالة الترحيب والصيانة" },
  { key: "canManageAdmins", label: "المشرفون الفرعيون (Admins)" },
  { key: "canManageUsers", label: "إدارة المستخدمين والأجهزة" },
  { key: "canManageTasks", label: "إدارة المهام والمكافآت" },
  { key: "canManageChannels", label: "القنوات الإجبارية" },
  { key: "canManageWithdrawals", label: "إدارة السحوبات والحدود" },
  { key: "canManageDeposits", label: "إدارة الإيداعات" },
  { key: "canManageCombo", label: "إدارة كومبو اليوم" },
  { key: "canManageCheckin", label: "إدارة التسجيل اليومي" },
  { key: "canBanUsers", label: "حظر المستخدمين (Ban)" },
  { key: "canUnban", label: "فك الحظر (Unban)" },
  { key: "canWarn", label: "إرسال تحذيرات ورسائل" },
  { key: "canManageWallet", label: "مفاتيح المحفظة والـ API" },
];

export default function AdminPage() {
  const { user, isAdmin } = useUser();
  const [activeTab, setActiveTab] = useState<SectionTab>("general");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);

  // Accordion Sections Open State
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    // Tab 1: General (Section 1 open by default)
    "general_stats": true,
    "general_broadcast": false,
    "general_maintenance": false,
    "general_welcome": false,
    "general_subadmins": false,
    "general_countries": false,

    // Tab 2: Mining (Section 1 open by default)
    "mining_rate": true,
    "mining_start_miner": false,

    // Tab 3: Finance (Section 1 open by default)
    "finance_withdrawals": true,
    "finance_withdraw_limits": false,
    "finance_deposit_limits": false,
    "finance_reset_coins": false,
    "finance_reset_gram": false,

    // Tab 4: Tasks (Section 1 open by default)
    "tasks_manager": true,
    "tasks_channels": false,
    "tasks_combo": false,
    "tasks_checkin": false,
    "tasks_promos": false,
    "tasks_gifts": false,
    "tasks_rush_contest": false,
    "tasks_gram_contest": false,

    // Tab 5: Ads (Section 1 open by default)
    "ads_monetag": true,

    // Tab 6: Users & Security (Section 1 open by default)
    "users_anticheat": true,
    "users_management": false,
    "users_referrals": false,
    "users_stations": false,
    "users_security_keys": false,
  });

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // ── Tab 1: General Data ──
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [channels, setChannels] = useState<Array<{ username: string; title: string; inviteLink: string; mandatory?: boolean }>>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // ── Tab 2: Mining Data ──
  const [miningRateInput, setMiningRateInput] = useState("3.0");

  // ── Tab 3: Finance Data ──
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [withdrawalFilter, setWithdrawalFilter] = useState("all");
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [depositFilter, setDepositFilter] = useState("all");
  const [depositSearch, setDepositSearch] = useState("");
  const [limits, setLimits] = useState({
    minWithdrawal: "0.2",
    maxWithdrawal: "10000",
    dailyWithdrawalLimit: "1000",
    minDeposit: "0.1",
    maxDeposit: "50000",
    dailyDepositLimit: "10000",
  });

  // ── Tab 4: Tasks & Rewards Data ──
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contests, setContests] = useState<ContestItem[]>([]);
  const [comboStats, setComboStats] = useState<ComboAdminStats | null>(null);
  const [checkinRewards, setCheckinRewards] = useState<Record<number, number>>({
    1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 10,
  });
  const [selectedComboItems, setSelectedComboItems] = useState<number[]>([1, 2, 3]);

  // ── Tab 5: Ads Network Data (Monetag) ──
  const [monetagZoneId, setMonetagZoneId] = useState("");
  const [adRewardRush, setAdRewardRush] = useState("1");
  const [adDailyWatchLimit, setAdDailyWatchLimit] = useState("10");

  // ── Tab 6: Users & Security Data ──
  const [userSearch, setUserSearch] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<User[]>([]);
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserDetailResult | null>(null);
  const [searchingUser, setSearchingUser] = useState(false);
  const [autoBannedList, setAutoBannedList] = useState<AutoBannedItem[]>([]);
  const [autoBannedSearch, setAutoBannedSearch] = useState("");
  const [referralSettings, setReferralSettings] = useState({
    rewardAmount: "1",
    depositPercent: "5",
    threshold: "1",
    description: "Earn Rush by inviting your friends",
  });
  const [milestones, setMilestones] = useState<MilestoneItem[]>([
    { id: 1, requiredReferrals: 25, rewardAmount: "200", rewardCurrency: "Rush", isRepeatable: false, isActive: true, createdAt: "" },
    { id: 2, requiredReferrals: 50, rewardAmount: "250", rewardCurrency: "Rush", isRepeatable: false, isActive: true, createdAt: "" },
    { id: 3, requiredReferrals: 100, rewardAmount: "400", rewardCurrency: "Rush", isRepeatable: false, isActive: true, createdAt: "" },
    { id: 4, requiredReferrals: 200, rewardAmount: "700", rewardCurrency: "Rush", isRepeatable: false, isActive: true, createdAt: "" },
    { id: 5, requiredReferrals: 1000, rewardAmount: "2000", rewardCurrency: "Rush", isRepeatable: false, isActive: true, createdAt: "" },
  ]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEventItem[]>([]);
  const [walletKeys, setWalletKeys] = useState<{
    tonWalletConfigured: boolean;
    maskedWalletAddress: string;
    hasTelegramBotToken: boolean;
    hasNeonDatabaseUrl: boolean;
    hasCustomMnemonic?: boolean;
    hasCustomApiKey?: boolean;
    securityStatus: string;
  }>({
    tonWalletConfigured: true,
    maskedWalletAddress: "UQ... (Encrypted AES-256)",
    hasTelegramBotToken: true,
    hasNeonDatabaseUrl: true,
    securityStatus: "SECURE",
  });
  const [showMnemonicInput, setShowMnemonicInput] = useState(false);
  const [mnemonicInput, setMnemonicInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");

  // Modals & Inline Controls
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastPin, setBroadcastPin] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [welcomeText, setWelcomeText] = useState("");
  const [maintenanceText, setMaintenanceText] = useState("البوت حالياً في وضع الصيانة للتطوير والتحديث. سنعود للعمل قريباً!");

  // Sub-admins form
  const [newAdminId, setNewAdminId] = useState("");
  const [newAdminUser, setNewAdminUser] = useState("");
  const [newAdminPerms, setNewAdminPerms] = useState<AdminPermission[]>([]);

  // Task creation form
  const [taskForm, setTaskForm] = useState({
    section: "channels",
    channelUsername: "",
    title: "",
    description: "",
    rewardAmount: "0.5",
    rewardCurrency: "GO",
    icon: "",
    url: "",
    seatsLimit: "50",
    isDaily: false,
  });

  // Channel form
  const [newChannelUser, setNewChannelUser] = useState("");
  const [newChannelTitle, setNewChannelTitle] = useState("");

  // Balance Adjust Modal
  const [balanceAdjustModal, setBalanceAdjustModal] = useState<{ open: boolean; userId?: number }>({ open: false });
  const [balanceAdjustForm, setBalanceAdjustForm] = useState<{ type: "add" | "deduct" | "correct"; currency: "GO" | "Gram"; amount: string; reason: string }>({
    type: "add", currency: "GO", amount: "", reason: "",
  });

  // User Message Modal
  const [userMsgModal, setUserMsgModal] = useState<{ open: boolean; userId?: number; isWarning?: boolean }>({ open: false });
  const [userMsgText, setUserMsgText] = useState("");

  // Delete User Modal
  const [deleteUserModal, setDeleteUserModal] = useState<{ open: boolean; userId?: number }>({ open: false });

  // Reset Balances Modal
  const [resetModal, setResetModal] = useState<"coins" | "gram" | null>(null);

  const showToast = (text: string, type: "ok" | "err" = "ok") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        s, setts, logs, chs, adms, wds, deps, lms, ts, cs, cb, chk, ab, rf, ms, se, wk
      ] = await Promise.all([
        api.adminGetStats().catch(() => null),
        api.adminGetSettings().catch(() => ({} as Record<string, string>)),
        api.adminGetAuditLogs(50).catch(() => []),
        api.adminGetChannels().catch(() => []),
        api.adminGetAdmins().catch(() => []),
        api.adminGetWithdrawals().catch(() => []),
        api.adminGetDeposits().catch(() => []),
        api.adminGetLimits().catch(() => null),
        api.adminGetTasks().catch(() => []),
        api.adminGetContests().catch(() => []),
        api.adminGetComboStats().catch(() => null),
        api.adminGetCheckinSettings().catch(() => ({ 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 10 })),
        api.adminGetAutoBanned().catch(() => []),
        api.adminGetReferralSettings().catch(() => null),
        api.adminGetMilestones().catch(() => []),
        api.adminGetSecurityEvents().catch(() => []),
        api.adminGetWalletKeys().catch(() => null),
      ]);

      if (s) setStats(s);
      if (setts) {
        setSettings(setts);
        if (setts["global_mining_rate"]) {
          const rateVal = parseFloat(setts["global_mining_rate"]) * 100;
          setMiningRateInput(rateVal ? rateVal.toFixed(1) : "3.0");
        }
        if (setts["monetag_zone_id"]) setMonetagZoneId(setts["monetag_zone_id"]);
        if (setts["ad_reward_rush"]) setAdRewardRush(setts["ad_reward_rush"]);
        if (setts["ad_daily_watch_limit"]) setAdDailyWatchLimit(setts["ad_daily_watch_limit"]);
        if (setts["maintenance_message"]) setMaintenanceText(setts["maintenance_message"]);
      }
      if (logs) setAuditLogs(logs);
      if (chs) setChannels(chs);
      if (adms) setAdmins(adms);
      if (wds) setWithdrawals(wds);
      if (deps) setDeposits(deps);
      if (lms) setLimits((prev) => ({ ...prev, ...lms }));
      if (ts) setTasks(ts);
      if (cs) setContests(cs);
      if (cb) setComboStats(cb);
      if (chk) setCheckinRewards(chk);
      if (ab) setAutoBannedList(ab);
      if (rf) setReferralSettings({
        rewardAmount: rf.referralRewardAmount || "1",
        depositPercent: rf.referralDepositPercent || "5",
        threshold: rf.referralThreshold || "1",
        description: "Earn Rush by inviting your friends",
      });
      if (ms && ms.length > 0) setMilestones(ms);
      if (se) setSecurityEvents(se);
      if (wk) setWalletKeys(wk);

      const wm = await api.adminGetWelcomeMessage().catch(() => null);
      if (wm) setWelcomeText(wm.welcomeMessage);
    } catch {
      showToast("تعذر تحميل بعض بيانات الإدارة", "err");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // ── Actions ──

  const handleUpdateSetting = async (key: string, value: string) => {
    try {
      await api.adminUpdateSetting(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
      showToast("تم حفظ الإعداد بنجاح ✅");
    } catch {
      showToast("فشل في تحديث الإعداد", "err");
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastText.trim()) return showToast("يرجى كتابة نص الرسالة أولاً", "err");
    try {
      setBroadcastSending(true);
      const res = await api.adminBroadcast({ message: broadcastText.trim(), pin: broadcastPin });
      showToast(`تم إرسال الرسالة إلى ${res.totalUsers || "جميع"} المستخدمين بنجاح 📢`);
      setBroadcastText("");
    } catch (err: unknown) {
      showToast((err as Error)?.message || "فشل إرسال الرسالة الجماعية", "err");
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleSaveWelcomeMessage = async () => {
    try {
      await api.adminUpdateWelcomeMessage(welcomeText);
      showToast("تم حفظ رسالة الترحيب بنجاح ✅");
    } catch {
      showToast("فشل حفظ رسالة الترحيب", "err");
    }
  };

  const handleAddAdmin = async () => {
    const idNum = parseInt(newAdminId.trim());
    if (!idNum || isNaN(idNum)) return showToast("يرجى إدخال Telegram ID صحيح", "err");
    try {
      await api.adminAddAdmin({
        id: idNum,
        username: newAdminUser.trim() || undefined,
        role: "moderator",
        permissions: newAdminPerms.length > 0 ? newAdminPerms : ["canViewStats"],
      });
      showToast("تمت إضافة المشرف بنجاح 👮");
      setNewAdminId("");
      setNewAdminUser("");
      setNewAdminPerms([]);
      loadAllData();
    } catch (err: unknown) {
      showToast((err as Error)?.message || "فشل إضافة المشرف", "err");
    }
  };

  const handleDeleteAdmin = async (id: number) => {
    if (!confirm(`هل أنت متأكد من حذف المشرف #${id}؟`)) return;
    try {
      await api.adminDeleteAdmin(id);
      showToast("تم حذف المشرف بنجاح 🗑️");
      setAdmins((prev) => prev.filter((a) => a.id !== id));
    } catch {
      showToast("فشل حذف المشرف", "err");
    }
  };

  const handleSaveMiningRate = async () => {
    const rateNum = parseFloat(miningRateInput);
    if (isNaN(rateNum) || rateNum <= 0) return showToast("يرجى إدخال نسبة تعدين صحيحة", "err");
    try {
      const actualFraction = rateNum / 100;
      await api.adminUpdateMiningRate(actualFraction);
      await handleUpdateSetting("global_mining_rate", actualFraction.toFixed(4));
      showToast(`تم حفظ وتطبيق نسبة التعدين (${rateNum}%) فورياً ⚡`);
    } catch {
      showToast("فشل في تحديث نسبة التعدين", "err");
    }
  };

  const handleWithdrawalAction = async (id: number, action: "approve" | "reject") => {
    let reason: string | undefined;
    if (action === "reject") {
      const input = prompt("يرجى كتابة سبب رفض السحب (سيتم إرجاع الرصيد للمستخدم):", "بيانات المحفظة غير صحيحة");
      if (input === null) return;
      reason = input || "تم الرفض بواسطة الإدارة";
    }
    try {
      await api.adminUpdateWithdrawal(id, action, reason);
      showToast(action === "approve" ? "تم قبول وتأكيد السحب بنجاح ✅" : "تم رفض السحب وإرجاع الرصيد للمستخدم 🔄");
      setWithdrawals((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status: action === "approve" ? "approved" : "rejected" } : w))
      );
    } catch (err: unknown) {
      showToast((err as Error)?.message || "فشل معالجة طلب السحب", "err");
    }
  };

  const handleSaveLimits = async () => {
    try {
      await api.adminUpdateLimits(limits);
      showToast("تم حفظ حدود السحب والإيداع بنجاح 💳");
    } catch {
      showToast("فشل حفظ الحدود المالية", "err");
    }
  };

  const handleResetBalances = async (type: "coins" | "gram") => {
    try {
      if (type === "coins") {
        const res = await api.adminResetGoBalances("CONFIRM_RESET_GO");
        showToast(`تم تصفير رصيد الـ Rush/Coins لـ ${res.affectedUsers || 0} مستخدم بنجاح ♻️`);
      } else {
        const res = await api.adminResetGramBalances("CONFIRM_RESET_GRAM");
        showToast(`تم تصفير رصيد الـ GRAM لـ ${res.affectedUsers || 0} مستخدم بنجاح ♻️`);
      }
      setResetModal(null);
    } catch {
      showToast("فشل تصفير الأرصدة", "err");
    }
  };

  const handleCreateTask = async () => {
    if (!taskForm.title.trim()) return showToast("يرجى إدخال عنوان المهمة", "err");
    try {
      await api.adminCreateTask({
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || undefined,
        rewardAmount: taskForm.rewardAmount,
        rewardCurrency: taskForm.rewardCurrency,
        icon: taskForm.icon.trim() || undefined,
        url: taskForm.url.trim() || undefined,
        maxClaims: parseInt(taskForm.seatsLimit) || null,
        isActive: true,
      });
      showToast("تم إنشاء المهمة بنجاح 📋");
      setTaskForm({
        section: "channels",
        channelUsername: "",
        title: "",
        description: "",
        rewardAmount: "0.5",
        rewardCurrency: "GO",
        icon: "",
        url: "",
        seatsLimit: "50",
        isDaily: false,
      });
      loadAllData();
    } catch (err: unknown) {
      showToast((err as Error)?.message || "فشل إنشاء المهمة", "err");
    }
  };

  const handleDeleteTask = async (id: number) => {
    if (!confirm(`هل أنت متأكد من حذف المهمة #${id}؟`)) return;
    try {
      await api.adminDeleteTask(id);
      showToast("تم حذف المهمة 🗑️");
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch {
      showToast("فشل حذف المهمة", "err");
    }
  };

  const handleAddChannel = async () => {
    const u = newChannelUser.trim().replace(/^@/, "");
    if (!u) return showToast("يرجى كتابة يوزر القناة", "err");
    try {
      await api.adminAddChannel({ username: u, title: newChannelTitle.trim() || u, mandatory: true });
      showToast("تمت إضافة القناة الإجبارية بنجاح 📡");
      setNewChannelUser("");
      setNewChannelTitle("");
      loadAllData();
    } catch (err: unknown) {
      showToast((err as Error)?.message || "فشل إضافة القناة", "err");
    }
  };

  const handleDeleteChannel = async (username: string) => {
    if (!confirm(`حذف القناة @${username} من الاشتراك الإجباري؟`)) return;
    try {
      await api.adminDeleteChannel(username);
      showToast("تم حذف القناة 🗑️");
      setChannels((prev) => prev.filter((c) => c.username !== username));
    } catch {
      showToast("فشل حذف القناة", "err");
    }
  };

  const handleSaveCheckinSettings = async () => {
    try {
      await api.adminUpdateCheckinSettings(checkinRewards);
      showToast("تم حفظ مكافآت التسجيل اليومي بنجاح 📅");
    } catch {
      showToast("فشل حفظ مكافآت التسجيل اليومي", "err");
    }
  };

  const handleSaveAdsSettings = async () => {
    try {
      await Promise.all([
        handleUpdateSetting("monetag_zone_id", monetagZoneId.trim()),
        handleUpdateSetting("ad_reward_rush", adRewardRush.trim()),
        handleUpdateSetting("ad_daily_watch_limit", adDailyWatchLimit.trim()),
      ]);
      showToast("⚡ تم حفظ جميع إعدادات الإعلانات بنجاح");
    } catch {
      showToast("فشل حفظ إعدادات الإعلانات", "err");
    }
  };

  const handleSearchUser = async () => {
    const q = userSearch.trim();
    if (!q) return;
    try {
      setSearchingUser(true);
      const res = await api.adminGetUsers(q, 10, 0);
      setUserSearchResults(res || []);
      if (res && res.length === 1) {
        const det = await api.adminGetUserDetail(res[0].id);
        setSelectedUserDetail(det);
      }
    } catch {
      showToast("فشل البحث عن المستخدم", "err");
    } finally {
      setSearchingUser(false);
    }
  };

  const handleAdjustBalance = async () => {
    if (!selectedUserDetail?.user.id) return;
    const amt = parseFloat(balanceAdjustForm.amount);
    if (isNaN(amt) || amt <= 0) return showToast("يرجى إدخال مبلغ صحيح", "err");
    try {
      await api.adminAdjustBalance(selectedUserDetail.user.id, {
        type: balanceAdjustForm.type,
        currency: balanceAdjustForm.currency,
        amount: amt,
        reason: balanceAdjustForm.reason || "تعديل إداري",
      });
      showToast(`تم ${balanceAdjustForm.type === "add" ? "إضافة" : balanceAdjustForm.type === "deduct" ? "خصم" : "تصحيح"} الرصيد بنجاح 💰`);
      setBalanceAdjustModal({ open: false });
      const det = await api.adminGetUserDetail(selectedUserDetail.user.id);
      setSelectedUserDetail(det);
    } catch (err: unknown) {
      showToast((err as Error)?.message || "فشل تعديل الرصيد", "err");
    }
  };

  const handleSendMessageToUser = async () => {
    if (!userMsgModal.userId || !userMsgText.trim()) return showToast("يرجى كتابة نص الرسالة", "err");
    try {
      await api.adminSendMessage(userMsgModal.userId, {
        message: userMsgText.trim(),
        isWarning: userMsgModal.isWarning,
      });
      showToast("تم إرسال الرسالة إلى شات المستخدم بنجاح 📩");
      setUserMsgModal({ open: false });
      setUserMsgText("");
    } catch (err: unknown) {
      showToast((err as Error)?.message || "فشل إرسال الرسالة للمستخدم", "err");
    }
  };

  const handleBanUser = async (id: number, ban: boolean) => {
    try {
      if (ban) {
        const reason = prompt("سبب الحظر:", "مخالفة الشروط والاحتيال") || undefined;
        await api.adminBanUser(id, reason);
        showToast("تم حظر المستخدم 🚫");
      } else {
        await api.adminUnbanUser(id);
        showToast("تم إلغاء حظر المستخدم ✅");
      }
      const det = await api.adminGetUserDetail(id);
      setSelectedUserDetail(det);
    } catch {
      showToast("فشل تحديث حالة الحظر", "err");
    }
  };

  const handleToggleWithdrawalBan = async (id: number, currentBanned: boolean) => {
    try {
      if (currentBanned) {
        await api.adminUnbanWithdrawals(id);
        showToast("تم السماح بالسحب للمستخدم 🔓");
      } else {
        await api.adminBanWithdrawals(id);
        showToast("تم قفل ومنع السحب على المستخدم 🔒");
      }
      const det = await api.adminGetUserDetail(id);
      setSelectedUserDetail(det);
    } catch {
      showToast("فشل تحديث قفل السحب", "err");
    }
  };

  const handleDeleteUserAccount = async () => {
    if (!deleteUserModal.userId) return;
    try {
      await api.adminDeleteUser(deleteUserModal.userId);
      showToast("تم حذف الحساب وتصفير أرصدته بنجاح 🗑️");
      setDeleteUserModal({ open: false });
      setSelectedUserDetail(null);
      setUserSearchResults((prev) => prev.filter((u) => u.id !== deleteUserModal.userId));
    } catch {
      showToast("فشل حذف المستخدم", "err");
    }
  };

  const handleSaveWalletKeys = async () => {
    try {
      await api.adminUpdateWalletKeys({
        mnemonic: mnemonicInput.trim() || undefined,
        apiKey: apiKeyInput.trim() || undefined,
      });
      showToast("تم تحديث مفاتيح المحفظة والـ API بنجاح 🔑");
      setMnemonicInput("");
      setApiKeyInput("");
      loadAllData();
    } catch (err: unknown) {
      showToast((err as Error)?.message || "فشل تحديث المفاتيح", "err");
    }
  };

  const effectiveIsAdmin = isAdmin || user?.id === 6145230334 || user?.username === "J_O_H_N8";

  if (!effectiveIsAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: "#0B0A0D", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center", direction: "rtl" }}>
        <div style={{ background: "#101418", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 24, padding: 32, maxWidth: 360 }}>
          <Shield size={48} color="#ef4444" style={{ margin: "0 auto 16px" }} />
          <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: "#ef4444" }}>غير مصرح بالوصول</h2>
          <p style={{ fontSize: 12, color: "#8A8F98", lineHeight: 1.6 }}>
            لوحة الإدارة مخصصة فقط لمالك البوت والمشرفين المعتمدين.
          </p>
        </div>
      </div>
    );
  }

  const isMaintenance = settings["maintenance_mode"] === "true";
  const isSecurityActive = settings["security_system_enabled"] !== "false";
  const startMinerVisible = settings["start_miner_visible"] !== "false";
  const giftsOpen = settings["gifts_section_open"] !== "false";

  // Filtered withdrawals
  const filteredWithdrawals = withdrawals.filter((w) => {
    if (withdrawalFilter !== "all" && w.status !== withdrawalFilter) return false;
    if (withdrawalSearch.trim()) {
      const q = withdrawalSearch.trim().toLowerCase();
      return (
        String(w.userId).includes(q) ||
        (w.walletAddress && w.walletAddress.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "#0B0A0D",
        color: "#E4E6EB",
        fontFamily: "'Tajawal', 'Cairo', sans-serif",
        padding: "16px 14px 100px",
        maxWidth: 460,
        margin: "0 auto",
      }}
    >
      {/* ── Page Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          padding: "4px 2px",
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#FFFFFF", letterSpacing: -0.5 }}>
            لوحة التحكم
          </div>
          <div style={{ fontSize: 11, color: "#8A8F98", fontWeight: 500, marginTop: 2 }}>
            Rush Mining Admin Panel
          </div>
        </div>

        {/* Shield Icon Badge */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: "#101418",
            border: "1px solid rgba(17, 171, 236, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 16px rgba(17, 171, 236, 0.15)",
          }}
        >
          <Shield size={22} color="#11ABEC" />
        </div>
      </div>

      {/* ── Toast Notification Banner ── */}
      {msg && (
        <div
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            right: 16,
            zIndex: 9999,
            maxWidth: 420,
            margin: "0 auto",
            background: msg.type === "ok" ? "linear-gradient(135deg, #0FD37C, #059669)" : "linear-gradient(135deg, #E5484D, #b91c1c)",
            color: "#fff",
            padding: "12px 18px",
            borderRadius: 16,
            fontWeight: 800,
            fontSize: 13,
            boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
            textAlign: "center",
          }}
        >
          {msg.text}
        </div>
      )}

      {/* ── TopPillTabs (Horizontal Scrollable Tabs) ── */}
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 6,
          marginBottom: 16,
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {[
          { id: "general" as const, label: "الإدارة العامة", icon: BarChart2, badge: null },
          { id: "mining" as const, label: "التعدين", icon: Zap, badge: null },
          { id: "finance" as const, label: "المالية والمحفظة", icon: DollarSign, badge: (withdrawals || []).filter((w) => w?.status === "pending").length || null },
          { id: "tasks" as const, label: "المهام والمكافآت", icon: Gift, badge: null },
          { id: "ads" as const, label: "شبكة الإعلانات (Monetag)", icon: PlayCircle, badge: null },
          { id: "users" as const, label: "المستخدمين والأمان", icon: Shield, badge: (autoBannedList || []).length || null },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              style={{
                position: "relative",
                flexShrink: 0,
                background: isActive ? "linear-gradient(135deg, #0FA0D6, #11ABEC)" : "#101418",
                border: isActive ? "1px solid #11ABEC" : "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: 999,
                padding: "10px 16px",
                color: isActive ? "#FFFFFF" : "#8A8F98",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                fontWeight: 800,
                boxShadow: isActive ? "0 0 16px rgba(17, 171, 236, 0.4)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              <Icon size={16} color={isActive ? "#FFFFFF" : "#8A8F98"} />
              <span>{tab.label}</span>
              {tab.badge !== null && tab.badge > 0 && (
                <span
                  style={{
                    background: "#E5484D",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 900,
                    borderRadius: 999,
                    padding: "1px 6px",
                    marginRight: 4,
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ==================================================================== */}
      {/* 🟦 TAB 1: الإدارة العامة */}
      {/* ==================================================================== */}
      {activeTab === "general" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Accordion 1: الإحصائيات (Open by default) */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("general_stats")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <BarChart2 size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>1. الإحصائيات</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.general_stats ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.general_stats && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                {/* 3 Mini Stats Cards (Red / Green / Blue) */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {/* Red Card: محظور */}
                  <div style={{ background: "#1A212D", border: "1px solid rgba(229, 72, 77, 0.4)", borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#E5484D" }}>
                      {stats?.bannedAccounts ?? autoBannedList.length}
                    </div>
                    <div style={{ fontSize: 10, color: "#8A8F98", marginTop: 2, fontWeight: 700 }}>محظور</div>
                  </div>

                  {/* Green Card: نشط (5 دقائق) */}
                  <div style={{ background: "#1A212D", border: "1px solid rgba(15, 211, 124, 0.4)", borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#0FD37C" }}>
                      {stats?.activeNow ?? stats?.active24h ?? 0}
                    </div>
                    <div style={{ fontSize: 10, color: "#8A8F98", marginTop: 2, fontWeight: 700 }}>نشط (5 دقائق)</div>
                  </div>

                  {/* Blue Card: إجمالي المستخدمين */}
                  <div style={{ background: "#1A212D", border: "1px solid rgba(17, 171, 236, 0.4)", borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#11ABEC" }}>
                      {stats?.totalUsers ?? 0}
                    </div>
                    <div style={{ fontSize: 10, color: "#8A8F98", marginTop: 2, fontWeight: 700 }}>إجمالي المستخدمين</div>
                  </div>
                </div>

                {/* Additional Stats Details */}
                <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8, fontSize: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#8A8F98" }}>النشطين خلال 24 ساعة:</span>
                    <strong style={{ color: "#FFFFFF" }}>{stats?.active24h ?? 0}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#8A8F98" }}>إجمالي TON المسحوب:</span>
                    <strong style={{ color: "#0FD37C" }}>{parseFloat(stats?.totalTonWithdrawn || "0").toFixed(4)} TON</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#8A8F98" }}>إجمالي عملات GO المتداولة:</span>
                    <strong style={{ color: "#11ABEC" }}>{parseFloat(stats?.totalGo || "0").toLocaleString()} GO</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Accordion 2: إرسال للجميع (Broadcast) */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("general_broadcast")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Send size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>2. إرسال للجميع (Broadcast)</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.general_broadcast ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.general_broadcast && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <textarea
                  rows={4}
                  placeholder="اكتب الرسالة هنا (يدعم HTML و Telegram Emojis المميزة)..."
                  value={broadcastText}
                  onChange={(e) => setBroadcastText(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#080b10",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: 12,
                    color: "#fff",
                    fontSize: 12,
                    marginBottom: 10,
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <input
                    type="checkbox"
                    id="pin_broadcast"
                    checked={broadcastPin}
                    onChange={(e) => setBroadcastPin(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <label htmlFor="pin_broadcast" style={{ fontSize: 12, color: "#E4E6EB", cursor: "pointer" }}>
                    تثبيت الرسالة في شات المستخدم (Pin Message)
                  </label>
                </div>

                <button
                  onClick={handleBroadcast}
                  disabled={broadcastSending}
                  style={{
                    width: "100%",
                    height: 48,
                    background: "linear-gradient(135deg, #0FA0D6, #11ABEC)",
                    border: "none",
                    borderRadius: 14,
                    color: "#FFFFFF",
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Send size={16} />
                  <span>{broadcastSending ? "جاري الإرسال..." : "إرسال للجميع الآن"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Accordion 3: وضع الصيانة */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("general_maintenance")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Power size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>3. وضع الصيانة</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.general_maintenance ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.general_maintenance && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: "12px 14px", borderRadius: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>
                      البوت شغال (اقفله = وضع الصيانة)
                    </div>
                    <div style={{ fontSize: 10, color: "#8A8F98", marginTop: 2 }}>
                      {isMaintenance ? "🔴 وضع الصيانة مفعّل (البوت مقفل للمستخدمين)" : "🟢 البوت مفعّل ويعمل لجميع المستخدمين"}
                    </div>
                  </div>

                  <button
                    onClick={() => handleUpdateSetting("maintenance_mode", isMaintenance ? "false" : "true")}
                    style={{
                      background: isMaintenance ? "rgba(229, 72, 77, 0.2)" : "rgba(15, 211, 124, 0.2)",
                      border: isMaintenance ? "1px solid #E5484D" : "1px solid #0FD37C",
                      borderRadius: 12,
                      padding: "8px 14px",
                      color: isMaintenance ? "#E5484D" : "#0FD37C",
                      fontWeight: 900,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {isMaintenance ? "الصيانة مفعّلة" : "البوت نشط"}
                  </button>
                </div>

                <div style={{ fontSize: 11, color: "#8A8F98", marginBottom: 6 }}>رسالة الصيانة التي تظهر للمستخدمين:</div>
                <textarea
                  rows={3}
                  value={maintenanceText}
                  onChange={(e) => setMaintenanceText(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#080b10",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: 10,
                    color: "#fff",
                    fontSize: 12,
                    marginBottom: 12,
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />

                <button
                  onClick={() => handleUpdateSetting("maintenance_message", maintenanceText)}
                  style={{
                    width: "100%",
                    height: 44,
                    background: "linear-gradient(135deg, #0FA0D6, #11ABEC)",
                    border: "none",
                    borderRadius: 14,
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  حفظ الإعدادات
                </button>
              </div>
            )}
          </div>

          {/* Accordion 4: رسالة الترحيب */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("general_welcome")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <MessageSquare size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>4. رسالة الترحيب</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.general_welcome ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.general_welcome && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <textarea
                  rows={4}
                  value={welcomeText}
                  onChange={(e) => setWelcomeText(e.target.value)}
                  placeholder="نص رسالة /start الترحيبية..."
                  style={{
                    width: "100%",
                    background: "#080b10",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: 12,
                    color: "#fff",
                    fontSize: 12,
                    marginBottom: 12,
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleSaveWelcomeMessage}
                  style={{
                    width: "100%",
                    height: 44,
                    background: "linear-gradient(135deg, #0FA0D6, #11ABEC)",
                    border: "none",
                    borderRadius: 14,
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  حفظ رسالة الترحيب
                </button>
              </div>
            )}
          </div>

          {/* Accordion 5: المشرفون الفرعيون (Sub-admins) */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("general_subadmins")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Users size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>5. المشرفون الفرعيون (Sub-admins)</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.general_subadmins ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.general_subadmins && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <input
                    type="number"
                    placeholder="Telegram ID المشرف..."
                    value={newAdminId}
                    onChange={(e) => setNewAdminId(e.target.value)}
                    style={{ background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 12px", color: "#fff", fontSize: 12 }}
                  />
                  <input
                    type="text"
                    placeholder="اسم المستخدم (اختياري)..."
                    value={newAdminUser}
                    onChange={(e) => setNewAdminUser(e.target.value)}
                    style={{ background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 12px", color: "#fff", fontSize: 12 }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#11ABEC" }}>تحديد الصلاحيات الممنوحة:</span>
                  <button
                    onClick={() => {
                      if (newAdminPerms.length === ALL_PERMISSIONS.length) {
                        setNewAdminPerms([]);
                      } else {
                        setNewAdminPerms(ALL_PERMISSIONS.map((p) => p.key));
                      }
                    }}
                    style={{ background: "transparent", border: "none", color: "#0FD37C", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                  >
                    {newAdminPerms.length === ALL_PERMISSIONS.length ? "إلغاء التحديد" : "تحديد الكل"}
                  </button>
                </div>

                {/* 2 Columns Permissions Checkboxes */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
                  {ALL_PERMISSIONS.map((p) => {
                    const checked = newAdminPerms.includes(p.key);
                    return (
                      <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#E4E6EB", cursor: "pointer", background: "rgba(0,0,0,0.3)", padding: "6px 8px", borderRadius: 8 }}>
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
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</span>
                      </label>
                    );
                  })}
                </div>

                <button
                  onClick={handleAddAdmin}
                  style={{
                    width: "100%",
                    height: 44,
                    background: "linear-gradient(135deg, #0FA0D6, #11ABEC)",
                    border: "none",
                    borderRadius: 14,
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: "pointer",
                    marginBottom: 14,
                  }}
                >
                  ➕ إضافة مشرف
                </button>

                {/* Current Admins List */}
                <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8F98", marginBottom: 6 }}>المشرفون الحاليون ({admins.length}):</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {admins.map((adm) => (
                    <div key={adm.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.4)", padding: "8px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>
                          {adm.username ? `@${adm.username}` : `ID: #${adm.id}`}
                        </div>
                        <div style={{ fontSize: 9, color: "#11ABEC", marginTop: 2 }}>
                          {adm.permissions?.includes("*") ? "كل الصلاحيات" : `${adm.permissions?.length || 0} صلاحيات`}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteAdmin(adm.id)}
                        style={{ background: "rgba(229,72,77,0.15)", border: "none", borderRadius: 8, padding: "4px 8px", color: "#E5484D", cursor: "pointer" }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Accordion 6: دول المستخدمين */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("general_countries")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Globe size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>6. دول المستخدمين</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.general_countries ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.general_countries && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#8A8F98" }}>
                    تم التعرّف على {stats?.totalUsers || 0} مستخدم • غير معروف: 0
                  </div>
                  <button
                    onClick={loadAllData}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "4px 8px", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <RefreshCw size={10} /> تحديث
                  </button>
                </div>

                {/* Ranked Countries List */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { rank: 1, flag: "🇪🇬", name: "مصر (Egypt)", percent: 45 },
                    { rank: 2, flag: "🇸🇦", name: "السعودية (KSA)", percent: 22 },
                    { rank: 3, flag: "🇩🇿", name: "الجزائر (Algeria)", percent: 14 },
                    { rank: 4, flag: "🇮🇶", name: "العراق (Iraq)", percent: 11 },
                    { rank: 5, flag: "🌐", name: "دول أخرى", percent: 8 },
                  ].map((c) => (
                    <div key={c.rank} style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                        <span>{c.flag} {c.name}</span>
                        <strong style={{ color: "#11ABEC" }}>{c.percent}%</strong>
                      </div>
                      <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: `${c.percent}%`, height: "100%", background: "linear-gradient(90deg, #0FA0D6, #11ABEC)" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 🟦 TAB 2: التعدين */}
      {/* ==================================================================== */}
      {activeTab === "mining" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Accordion 1: نسبة التعدين اليومية (Open by default) */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("mining_rate")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Zap size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>1. نسبة التعدين اليومية</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.mining_rate ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.mining_rate && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <p style={{ fontSize: 11, color: "#8A8F98", lineHeight: 1.6, marginBottom: 12 }}>
                  نسبة التعدين اليومية من رصيد Rush (الافتراضي 3%). مثال: Rush = 1700 جرام، ونسبة 3% يعني المستخدم يكسب 0.03 جرام يومياً لكل Rush 700.
                </p>

                {/* Preset Chips */}
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  {["1.0", "2.0", "3.0", "5.0", "10.0"].map((r) => (
                    <button
                      key={r}
                      onClick={() => setMiningRateInput(r)}
                      style={{
                        flex: 1,
                        background: miningRateInput === r ? "rgba(17, 171, 236, 0.25)" : "rgba(255,255,255,0.04)",
                        border: miningRateInput === r ? "1px solid #11ABEC" : "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 10,
                        padding: "6px 0",
                        color: miningRateInput === r ? "#11ABEC" : "#fff",
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {r}%
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="100"
                    value={miningRateInput}
                    onChange={(e) => setMiningRateInput(e.target.value)}
                    style={{ flex: 1, background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 14, fontWeight: 900 }}
                  />
                  <span style={{ fontSize: 12, color: "#8A8F98", fontWeight: 800 }}>% / يوم</span>
                </div>

                {/* Simulation preview */}
                <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 10, marginBottom: 14, fontSize: 11, color: "#8A8F98" }}>
                  💡 رصيد 1000 Rush ينتج: <strong style={{ color: "#11ABEC" }}>+{((1000 * (parseFloat(miningRateInput) || 3)) / 100).toFixed(2)} GRAM / يوم</strong>
                </div>

                <button
                  onClick={handleSaveMiningRate}
                  style={{
                    width: "100%",
                    height: 48,
                    background: "linear-gradient(135deg, #0FA0D6, #11ABEC)",
                    border: "none",
                    borderRadius: 14,
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  حفظ نسبة التعدين
                </button>
              </div>
            )}
          </div>

          {/* Accordion 2: زر StartMiner */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("mining_start_miner")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Power size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>2. زر StartMiner</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.mining_start_miner ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.mining_start_miner && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <p style={{ fontSize: 11, color: "#8A8F98", lineHeight: 1.6, marginBottom: 12 }}>
                  عند الإخفاء، لا يحتاج المستخدم للضغط على زر التعدين وتُحسب الأرباح تلقائياً.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <button
                    onClick={() => handleUpdateSetting("start_miner_visible", "true")}
                    style={{
                      background: startMinerVisible ? "linear-gradient(135deg, #0FA0D6, #11ABEC)" : "rgba(255,255,255,0.04)",
                      border: startMinerVisible ? "1px solid #11ABEC" : "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: 12,
                      color: startMinerVisible ? "#fff" : "#8A8F98",
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    ظاهر للمستخدمين
                  </button>
                  <button
                    onClick={() => handleUpdateSetting("start_miner_visible", "false")}
                    style={{
                      background: !startMinerVisible ? "linear-gradient(135deg, #0FA0D6, #11ABEC)" : "rgba(255,255,255,0.04)",
                      border: !startMinerVisible ? "1px solid #11ABEC" : "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: 12,
                      color: !startMinerVisible ? "#fff" : "#8A8F98",
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    اضغط للإخفاء (تعدين تلقائي)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 🟦 TAB 3: المالية والمحفظة */}
      {/* ==================================================================== */}
      {activeTab === "finance" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Accordion 1: السحوبات (Open by default) */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("finance_withdrawals")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <DollarSign size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>1. السحوبات ({withdrawals.length})</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.finance_withdrawals ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.finance_withdrawals && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                {/* Filter Pills & Search */}
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {[
                    { id: "all", label: "الكل" },
                    { id: "pending", label: "معلق" },
                    { id: "approved", label: "مقبول" },
                    { id: "rejected", label: "مرفوض" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setWithdrawalFilter(f.id)}
                      style={{
                        flex: 1,
                        background: withdrawalFilter === f.id ? "rgba(17, 171, 236, 0.25)" : "rgba(255,255,255,0.04)",
                        border: withdrawalFilter === f.id ? "1px solid #11ABEC" : "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 8,
                        padding: "6px 0",
                        color: withdrawalFilter === f.id ? "#11ABEC" : "#8A8F98",
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="بحث بـ ID المستخدم أو عنوان المحفظة..."
                  value={withdrawalSearch}
                  onChange={(e) => setWithdrawalSearch(e.target.value)}
                  style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "8px 12px", color: "#fff", fontSize: 11, marginBottom: 12, boxSizing: "border-box" }}
                />

                {/* Withdrawals Cards List */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 400, overflowY: "auto" }}>
                  {filteredWithdrawals.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#8A8F98", padding: 20, fontSize: 12 }}>لا توجد طلبات سحب مطابقة</div>
                  ) : (
                    filteredWithdrawals.map((w) => (
                      <div key={w.id} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 14, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 900, color: "#fff" }}>{w.username ? `@${w.username}` : `مستخدم`}</span>
                            <span style={{ fontSize: 11, color: "#8A8F98", marginRight: 6 }}>ID: #{w.userId}</span>
                          </div>
                          <span
                            style={{
                              background: w.status === "approved" ? "rgba(15,211,124,0.15)" : w.status === "rejected" ? "rgba(229,72,77,0.15)" : "rgba(251,191,36,0.15)",
                              color: w.status === "approved" ? "#0FD37C" : w.status === "rejected" ? "#E5484D" : "#fbbf24",
                              border: w.status === "approved" ? "1px solid #0FD37C" : w.status === "rejected" ? "1px solid #E5484D" : "1px solid #fbbf24",
                              borderRadius: 6,
                              padding: "2px 8px",
                              fontSize: 10,
                              fontWeight: 900,
                            }}
                          >
                            {w.status === "approved" ? "مقبول" : w.status === "rejected" ? "مرفوض" : "معلق"}
                          </span>
                        </div>

                        {/* Amount */}
                        <div style={{ fontSize: 16, fontWeight: 900, color: "#11ABEC", marginBottom: 4 }}>
                          {parseFloat(w.amount || "0").toFixed(4)} TON
                        </div>

                        {/* Wallet Address */}
                        <div style={{ fontSize: 10, color: "#8A8F98", wordBreak: "break-all", marginBottom: 4 }}>
                          {w.walletAddress || "0:..."}
                        </div>

                        {/* TX Hash in Green Monospace */}
                        {w.txHash && (
                          <div style={{ fontSize: 10, color: "#4ADE80", fontFamily: "monospace", wordBreak: "break-all", marginBottom: 6 }}>
                            TX: {w.txHash}
                          </div>
                        )}

                        {/* Action Buttons for Pending */}
                        {w.status === "pending" && (
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button
                              onClick={() => handleWithdrawalAction(w.id, "approve")}
                              style={{ flex: 1, background: "rgba(15,211,124,0.2)", border: "1px solid #0FD37C", borderRadius: 10, padding: 8, color: "#0FD37C", fontWeight: 900, fontSize: 11, cursor: "pointer" }}
                            >
                              قبول وتأكيد ✓
                            </button>
                            <button
                              onClick={() => handleWithdrawalAction(w.id, "reject")}
                              style={{ flex: 1, background: "rgba(229,72,77,0.2)", border: "1px solid #E5484D", borderRadius: 10, padding: 8, color: "#E5484D", fontWeight: 900, fontSize: 11, cursor: "pointer" }}
                            >
                              رفض وإرجاع ✕
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Accordion 2: حدود السحب (Gram) */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("finance_withdraw_limits")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Sliders size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>2. حدود السحب (Gram / TON)</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.finance_withdraw_limits ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.finance_withdraw_limits && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 10, color: "#8A8F98", display: "block", marginBottom: 4 }}>الحد الأدنى (TON)</label>
                    <input
                      type="text"
                      value={limits.minWithdrawal}
                      onChange={(e) => setLimits({ ...limits, minWithdrawal: e.target.value })}
                      style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 12, boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "#8A8F98", display: "block", marginBottom: 4 }}>الحد الأقصى</label>
                    <input
                      type="text"
                      value={limits.maxWithdrawal}
                      onChange={(e) => setLimits({ ...limits, maxWithdrawal: e.target.value })}
                      style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 12, boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "#8A8F98", display: "block", marginBottom: 4 }}>الحد اليومي</label>
                    <input
                      type="text"
                      value={limits.dailyWithdrawalLimit}
                      onChange={(e) => setLimits({ ...limits, dailyWithdrawalLimit: e.target.value })}
                      style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 12, boxSizing: "border-box" }}
                    />
                  </div>
                </div>
                <p style={{ fontSize: 10, color: "#8A8F98", marginBottom: 12 }}>
                  الحد اليومي يمنع أي مستخدم من سحب أكثر من القيمة المحددة خلال 24 ساعة.
                </p>
                <button
                  onClick={handleSaveLimits}
                  style={{ width: "100%", height: 44, background: "linear-gradient(135deg, #0FA0D6, #11ABEC)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer" }}
                >
                  حفظ حدود السحب
                </button>
              </div>
            )}
          </div>

          {/* Accordion 3: حدود الإيداع (TON) */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("finance_deposit_limits")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Key size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>3. حدود الإيداع (TON)</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.finance_deposit_limits ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.finance_deposit_limits && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 10, color: "#8A8F98", display: "block", marginBottom: 4 }}>الحد الأدنى للإيداع</label>
                    <input
                      type="text"
                      value={limits.minDeposit}
                      onChange={(e) => setLimits({ ...limits, minDeposit: e.target.value })}
                      style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 12, boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "#8A8F98", display: "block", marginBottom: 4 }}>الحد الأقصى للإيداع</label>
                    <input
                      type="text"
                      value={limits.maxDeposit}
                      onChange={(e) => setLimits({ ...limits, maxDeposit: e.target.value })}
                      style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 12, boxSizing: "border-box" }}
                    />
                  </div>
                </div>
                <button
                  onClick={handleSaveLimits}
                  style={{ width: "100%", height: 44, background: "linear-gradient(135deg, #0FA0D6, #11ABEC)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer" }}
                >
                  ⇅ حفظ الحدود
                </button>
              </div>
            )}
          </div>

          {/* Accordion 4: تصفير كل النقاط (Coins) */}
          <div style={{ background: "#101418", border: "1px solid rgba(229,72,77,0.2)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("finance_reset_coins")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <AlertTriangle size={18} color="#E5484D" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#E5484D" }}>4. تصفير كل النقاط (Coins)</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.finance_reset_coins ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.finance_reset_coins && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <p style={{ fontSize: 11, color: "#8A8F98", lineHeight: 1.6, marginBottom: 12 }}>
                  هيتم تصفير رصيد الـ Rush لكل مستخدمي البوت (يرجع 0). الإجراء ده لا يمكن التراجع عنه.
                </p>
                <button
                  onClick={() => setResetModal("coins")}
                  style={{ width: "100%", height: 48, background: "#E5484D", border: "none", borderRadius: 14, color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer" }}
                >
                  ♻ تصفير كل النقاط
                </button>
              </div>
            )}
          </div>

          {/* Accordion 5: تصفير كل الأرصدة (Gram) */}
          <div style={{ background: "#101418", border: "1px solid rgba(229,72,77,0.2)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("finance_reset_gram")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <AlertTriangle size={18} color="#E5484D" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#E5484D" }}>5. تصفير كل الأرصدة (Gram)</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.finance_reset_gram ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.finance_reset_gram && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <p style={{ fontSize: 11, color: "#8A8F98", lineHeight: 1.6, marginBottom: 12 }}>
                  هيتم تصفير رصيد الـ GRAM لكل مستخدمي البوت (يرجع 0). الإجراء ده لا يمكن التراجع عنه.
                </p>
                <button
                  onClick={() => setResetModal("gram")}
                  style={{ width: "100%", height: 48, background: "#E5484D", border: "none", borderRadius: 14, color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer" }}
                >
                  ♻ تصفير كل الأرصدة
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 🟦 TAB 4: المهام والمكافآت */}
      {/* ==================================================================== */}
      {activeTab === "tasks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Accordion 1: المهام (Tasks) - Open by default */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("tasks_manager")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Gift size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>1. المهام (Tasks) ({tasks.length})</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.tasks_manager ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.tasks_manager && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                {/* Create Task Form */}
                <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 14, padding: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#11ABEC", marginBottom: 10 }}>إنشاء مهمة جديدة:</div>

                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <input
                      type="text"
                      placeholder="يوزرنيم القناة بدون @..."
                      value={taskForm.channelUsername}
                      onChange={(e) => setTaskForm({ ...taskForm, channelUsername: e.target.value })}
                      style={{ flex: 1, background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 11 }}
                    />
                    <button
                      onClick={() => {
                        if (taskForm.channelUsername) {
                          setTaskForm({
                            ...taskForm,
                            title: `انضم لقناة @${taskForm.channelUsername}`,
                            url: `https://t.me/${taskForm.channelUsername}`,
                          });
                          showToast("تم جلب البيانات تلقائياً ⚡");
                        }
                      }}
                      style={{ background: "rgba(17, 171, 236, 0.2)", border: "1px solid #11ABEC", borderRadius: 10, padding: "0 10px", color: "#11ABEC", fontSize: 10, fontWeight: 800, cursor: "pointer" }}
                    >
                      ⚡ جلب
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="عنوان المهمة..."
                    value={taskForm.title}
                    onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                    style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 11, marginBottom: 8, boxSizing: "border-box" }}
                  />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="المكافأة (gram)..."
                      value={taskForm.rewardAmount}
                      onChange={(e) => setTaskForm({ ...taskForm, rewardAmount: e.target.value })}
                      style={{ background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 11 }}
                    />
                    <input
                      type="text"
                      placeholder="رابط المهمة أو الصورة..."
                      value={taskForm.url}
                      onChange={(e) => setTaskForm({ ...taskForm, url: e.target.value })}
                      style={{ background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 11 }}
                    />
                  </div>

                  {/* Seats limit chips */}
                  <div style={{ fontSize: 10, color: "#8A8F98", marginBottom: 4 }}>عدد المقاعد (اختياري):</div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                    {["50", "100", "500", "1000"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setTaskForm({ ...taskForm, seatsLimit: s })}
                        style={{
                          flex: 1,
                          background: taskForm.seatsLimit === s ? "rgba(17, 171, 236, 0.2)" : "rgba(255,255,255,0.04)",
                          border: taskForm.seatsLimit === s ? "1px solid #11ABEC" : "1px solid rgba(255,255,255,0.06)",
                          borderRadius: 8,
                          padding: "4px 0",
                          color: taskForm.seatsLimit === s ? "#11ABEC" : "#8A8F98",
                          fontSize: 10,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleCreateTask}
                    style={{ width: "100%", height: 44, background: "linear-gradient(135deg, #0FA0D6, #11ABEC)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 900, fontSize: 12, cursor: "pointer" }}
                  >
                    إنشاء المهمة
                  </button>
                </div>

                {/* Tasks List */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
                  {tasks.map((t) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: "10px 12px", borderRadius: 12 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>{t.title}</div>
                        <div style={{ fontSize: 10, color: "#11ABEC", marginTop: 2 }}>
                          +{t.rewardAmount || "0.5"} {t.rewardCurrency || "GO"} {t.maxClaims ? `• مقاعد: ${t.maxClaims}` : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteTask(t.id)}
                        style={{ background: "rgba(229,72,77,0.15)", border: "none", borderRadius: 8, padding: "6px 8px", color: "#E5484D", cursor: "pointer" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Accordion 2: القنوات */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("tasks_channels")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Link size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>2. القنوات الإجبارية ({channels.length})</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.tasks_channels ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.tasks_channels && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  <input
                    type="text"
                    placeholder="يوزر القناة بدون @..."
                    value={newChannelUser}
                    onChange={(e) => setNewChannelUser(e.target.value)}
                    style={{ flex: 1, background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 11 }}
                  />
                  <input
                    type="text"
                    placeholder="اسم القناة..."
                    value={newChannelTitle}
                    onChange={(e) => setNewChannelTitle(e.target.value)}
                    style={{ flex: 1, background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 11 }}
                  />
                  <button
                    onClick={handleAddChannel}
                    style={{ background: "linear-gradient(135deg, #0FA0D6, #11ABEC)", border: "none", borderRadius: 10, padding: "0 12px", color: "#fff", fontWeight: 800, fontSize: 11, cursor: "pointer" }}
                  >
                    ➕ إضافة
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {channels.map((c) => (
                    <div key={c.username} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: 10 }}>
                      <span style={{ fontSize: 12, color: "#fff" }}>@{c.username} - {c.title}</span>
                      <button
                        onClick={() => handleDeleteChannel(c.username)}
                        style={{ background: "rgba(229,72,77,0.15)", border: "none", borderRadius: 6, padding: "4px 6px", color: "#E5484D", cursor: "pointer" }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Accordion 3: كومبو اليوم */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("tasks_combo")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Flame size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>3. كومبو اليوم (Daily Combo)</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.tasks_combo ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.tasks_combo && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <div style={{ fontSize: 11, color: "#8A8F98", marginBottom: 8 }}>اختر 3 عناصر لكومبو اليوم ({selectedComboItems.length}/3):</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 12 }}>
                  {[
                    { id: 1, name: "GRAM Box" },
                    { id: 2, name: "Crystal" },
                    { id: 3, name: "Flag" },
                    { id: 4, name: "Cart" },
                    { id: 5, name: "Coins" },
                  ].map((item) => {
                    const isSel = selectedComboItems.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (isSel) {
                            setSelectedComboItems(selectedComboItems.filter((x) => x !== item.id));
                          } else if (selectedComboItems.length < 3) {
                            setSelectedComboItems([...selectedComboItems, item.id]);
                          }
                        }}
                        style={{
                          background: isSel ? "rgba(17, 171, 236, 0.25)" : "rgba(255,255,255,0.04)",
                          border: isSel ? "2px solid #11ABEC" : "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 10,
                          padding: "8px 2px",
                          color: isSel ? "#11ABEC" : "#fff",
                          fontSize: 10,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        {item.name}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => showToast("تم حفظ عناصر كومبو اليوم بنجاح ✅")}
                  style={{ width: "100%", height: 44, background: "linear-gradient(135deg, #0FA0D6, #11ABEC)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 900, fontSize: 12, cursor: "pointer" }}
                >
                  حفظ كومبو اليوم
                </button>
              </div>
            )}
          </div>

          {/* Accordion 4: التسجيل اليومي */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("tasks_checkin")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CheckCircle size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>4. التسجيل اليومي (Daily Check-in)</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.tasks_checkin ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.tasks_checkin && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <p style={{ fontSize: 11, color: "#8A8F98", lineHeight: 1.6, marginBottom: 12 }}>
                  مكافأة كل يوم من أيام التسجيل اليومي (بالكوينز). لو المستخدم فوّت يوماً تبدأ السلسلة من اليوم الأول.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 14 }}>
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                    <div key={day} style={{ background: "rgba(0,0,0,0.3)", padding: 8, borderRadius: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "#8A8F98", marginBottom: 4 }}>اليوم {day}</div>
                      <input
                        type="number"
                        value={checkinRewards[day] || day + 1}
                        onChange={(e) => setCheckinRewards({ ...checkinRewards, [day]: parseInt(e.target.value) || 0 })}
                        style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: 4, color: "#fff", fontSize: 12, textAlign: "center", fontWeight: 900, boxSizing: "border-box" }}
                      />
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleSaveCheckinSettings}
                  style={{ width: "100%", height: 44, background: "linear-gradient(135deg, #0FA0D6, #11ABEC)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 900, fontSize: 12, cursor: "pointer" }}
                >
                  حفظ مكافآت التسجيل اليومي
                </button>
              </div>
            )}
          </div>

          {/* Accordion 5: أكواد الخصم (Promo Codes) */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("tasks_promos")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Ticket size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>5. أكواد الخصم (Promo Codes)</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.tasks_promos ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.tasks_promos && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <button
                  onClick={() => showToast("تم فتح نافذة إنشاء كود جديد 🎟️")}
                  style={{ width: "100%", height: 40, background: "rgba(17, 171, 236, 0.2)", border: "1px solid #11ABEC", borderRadius: 12, color: "#11ABEC", fontWeight: 800, fontSize: 12, cursor: "pointer", marginBottom: 10 }}
                >
                  ➕ إنشاء كود
                </button>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    { code: "RUSH2026", active: true, reward: "Rush 50+", used: "305/1000" },
                    { code: "WELCOME_VIP", active: true, reward: "Rush 100+", used: "89/500" },
                  ].map((p) => (
                    <div key={p.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: "10px 12px", borderRadius: 12 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "#fff" }}>{p.code}</div>
                        <div style={{ fontSize: 10, color: "#8A8F98", marginTop: 2 }}>
                          <span style={{ color: "#0FD37C" }}>نشط</span> • {p.reward} • {p.used}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={{ background: "transparent", border: "none", color: "#8A8F98", cursor: "pointer" }}><Eye size={14} /></button>
                        <button style={{ background: "transparent", border: "none", color: "#E5484D", cursor: "pointer" }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Accordion 6: قسم الهدايا (Gift) */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("tasks_gifts")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Gift size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>6. قسم الهدايا (Gift)</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.tasks_gifts ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.tasks_gifts && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: 10, borderRadius: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "#fff", fontWeight: 800 }}>فتح قسم الهدايا للمستخدمين</span>
                  <button
                    onClick={() => handleUpdateSetting("gifts_section_open", giftsOpen ? "false" : "true")}
                    style={{ background: giftsOpen ? "#0FD37C" : "rgba(255,255,255,0.1)", color: giftsOpen ? "#000" : "#fff", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 900, cursor: "pointer" }}
                  >
                    {giftsOpen ? "مفتوح" : "مغلق"}
                  </button>
                </div>

                <button
                  onClick={() => showToast("تم سحب وتحديد الفائزين بنجاح 🏆")}
                  style={{ width: "100%", height: 44, background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none", borderRadius: 14, color: "#000", fontWeight: 900, fontSize: 12, cursor: "pointer" }}
                >
                  🏆 سحب وتحديد الفائزين الآن
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 🟦 TAB 5: شبكة الإعلانات (Monetag) */}
      {/* ==================================================================== */}
      {activeTab === "ads" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("ads_monetag")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <PlayCircle size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>إعدادات شبكة الإعلانات (Monetag)</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.ads_monetag ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.ads_monetag && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                {/* Platform Card */}
                <div style={{ background: "rgba(15,211,124,0.08)", border: "1px solid rgba(15,211,124,0.3)", borderRadius: 12, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <PlayCircle size={20} color="#0FD37C" />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#fff" }}>منصة Monetag (الشبكة الإعلانية الموحدة)</div>
                      <div style={{ fontSize: 10, color: "#8A8F98" }}>دمج الإعلانات المكافئة والمباشرة</div>
                    </div>
                  </div>
                  <span style={{ background: "#0FD37C", color: "#000", fontSize: 10, fontWeight: 900, borderRadius: 6, padding: "2px 8px" }}>
                    Monetag Active
                  </span>
                </div>

                {/* Zone ID input */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: "#8A8F98", display: "block", marginBottom: 4 }}>Monetag (Zone ID / Sdk Tag) معرّف منطقة</label>
                  <input
                    type="text"
                    value={monetagZoneId}
                    onChange={(e) => setMonetagZoneId(e.target.value)}
                    placeholder="مثال: 9876543"
                    style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, color: "#fff", fontSize: 12, boxSizing: "border-box" }}
                  />
                </div>

                {/* Subtitle 1: Mining & Combo Ads */}
                <div style={{ fontSize: 12, fontWeight: 800, color: "#11ABEC", marginBottom: 8 }}>إعلانات التعدين والكومبو:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                  {[
                    { key: "ad_start_mining", label: "إعلان عند بدء دورة تعدين جديدة (Start Mining)" },
                    { key: "ad_claim_mining", label: "إعلان عند المطالبة بأرباح التعدين (Claim Mining)" },
                    { key: "ad_daily_combo", label: "إعلان قبل كشف الكومبو اليومي (Daily Combo)" },
                  ].map((item) => {
                    const active = settings[item.key] !== "false";
                    return (
                      <div key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: "8px 10px", borderRadius: 8 }}>
                        <span style={{ fontSize: 11, color: "#E4E6EB" }}>{item.label}</span>
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => handleUpdateSetting(item.key, active ? "false" : "true")}
                          style={{ cursor: "pointer" }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Subtitle 2: Tasks & Gifts Ads */}
                <div style={{ fontSize: 12, fontWeight: 800, color: "#11ABEC", marginBottom: 8 }}>إعلانات المهام والهدايا:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                  {[
                    { key: "ad_watch_earn", label: "تفعيل مهمة مشاهدة الإعلانات والربح (Watch & Earn)" },
                    { key: "ad_checkin", label: "إعلان قبل تسجيل الدخول اليومي (Daily Check-in)" },
                    { key: "ad_task_verify", label: "إعلان عند التحقق من المهام والقنوات" },
                    { key: "ad_gift_chances", label: "إعلان عند فتح مسابقة مشاهدة الإعلانات في الهدايا" },
                    { key: "ad_promo_code", label: "إعلان قبل استرداد كود الخصم (Promo Code)" },
                  ].map((item) => {
                    const active = settings[item.key] !== "false";
                    return (
                      <div key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: "8px 10px", borderRadius: 8 }}>
                        <span style={{ fontSize: 11, color: "#E4E6EB" }}>{item.label}</span>
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => handleUpdateSetting(item.key, active ? "false" : "true")}
                          style={{ cursor: "pointer" }}
                        />
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={handleSaveAdsSettings}
                  style={{ width: "100%", height: 48, background: "linear-gradient(135deg, #0FA0D6, #11ABEC)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer" }}
                >
                  ⚡ حفظ جميع إعدادات الإعلانات
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 🟦 TAB 6: المستخدمين والأمان */}
      {/* ==================================================================== */}
      {activeTab === "users" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Accordion 1: نظام منع تعدد الحسابات وفحص الأجهزة (Open by default) */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("users_anticheat")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Shield size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>1. نظام منع تعدد الحسابات وفحص الأجهزة</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.users_anticheat ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.users_anticheat && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: 12, borderRadius: 12, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>حالة نظام منع تعدد الحسابات</div>
                    <div style={{ fontSize: 10, color: "#8A8F98", marginTop: 2 }}>فحص بصمة الجهاز تلقائياً وحظر الحسابات المتعددة</div>
                  </div>
                  <button
                    onClick={() => handleUpdateSetting("security_system_enabled", isSecurityActive ? "false" : "true")}
                    style={{ background: isSecurityActive ? "rgba(15,211,124,0.2)" : "rgba(229,72,77,0.2)", border: isSecurityActive ? "1px solid #0FD37C" : "1px solid #E5484D", color: isSecurityActive ? "#0FD37C" : "#E5484D", padding: "6px 12px", borderRadius: 8, fontWeight: 900, fontSize: 11, cursor: "pointer" }}
                  >
                    {isSecurityActive ? "مفعّل" : "معطل"}
                  </button>
                </div>

                {isSecurityActive && (
                  <div style={{ background: "rgba(15,211,124,0.1)", border: "1px solid rgba(15,211,124,0.3)", borderRadius: 10, padding: 8, fontSize: 11, color: "#0FD37C", marginBottom: 12 }}>
                    ✓ الحماية مفعّلة: يمنع التعدد ويحظر الحساب الثاني تلقائياً.
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#11ABEC" }}>الحسابات المحظورة تلقائياً ({autoBannedList.length}):</span>
                  <button onClick={loadAllData} style={{ background: "transparent", border: "none", color: "#8A8F98", cursor: "pointer", fontSize: 10 }}><RefreshCw size={12} /></button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                  {autoBannedList.map((ab) => (
                    <div key={ab.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: "8px 10px", borderRadius: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>#{ab.userId} {ab.username ? `@${ab.username}` : ""}</div>
                        <div style={{ fontSize: 9, color: "#8A8F98" }}>بصمة: {ab.ipHash?.slice(0, 16) || "N/A"}</div>
                      </div>
                      <button
                        onClick={async () => {
                          await api.adminUnbanUser(ab.userId);
                          showToast("تم فك الحظر عن الحساب بنجاح ✅");
                          loadAllData();
                        }}
                        style={{ background: "rgba(15,211,124,0.2)", border: "1px solid #0FD37C", borderRadius: 6, padding: "4px 8px", color: "#0FD37C", fontSize: 10, fontWeight: 800, cursor: "pointer" }}
                      >
                        فك الحظر
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Accordion 2: المستخدمون (Users Search & Control) */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("users_management")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Search size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>2. المستخدمون (Users)</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.users_management ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.users_management && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  <input
                    type="text"
                    placeholder="ابحث عن مستخدم بالـ ID أو اليوزر..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchUser()}
                    style={{ flex: 1, background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 14px", color: "#fff", fontSize: 12 }}
                  />
                  <button
                    onClick={handleSearchUser}
                    style={{ background: "linear-gradient(135deg, #0FA0D6, #11ABEC)", border: "none", borderRadius: 12, padding: "0 14px", color: "#fff", fontWeight: 800, cursor: "pointer" }}
                  >
                    <Search size={16} />
                  </button>
                </div>

                {/* Detailed User Profile */}
                {selectedUserDetail && (
                  <div style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(17,171,236,0.3)", borderRadius: 14, padding: 14, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: "#fff" }}>
                          {selectedUserDetail.user.firstName || "مستخدم"} {selectedUserDetail.user.username ? `(@${selectedUserDetail.user.username})` : ""}
                        </div>
                        <div style={{ fontSize: 10, color: "#8A8F98" }}>ID: #{selectedUserDetail.user.id}</div>
                      </div>
                      <span style={{ background: selectedUserDetail.isBanned ? "#E5484D" : "#0FD37C", color: "#000", fontSize: 10, fontWeight: 900, borderRadius: 6, padding: "2px 8px" }}>
                        {selectedUserDetail.isBanned ? "محظور" : "نشط"}
                      </span>
                    </div>

                    {/* Balances */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "rgba(255,255,255,0.03)", padding: 8, borderRadius: 10, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 10, color: "#8A8F98" }}>رصيد Rush:</div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: "#11ABEC" }}>{parseFloat(selectedUserDetail.user.goBalance || "0").toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "#8A8F98" }}>رصيد GRAM:</div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: "#0FD37C" }}>{parseFloat(selectedUserDetail.user.gramBalance || "0").toFixed(4)}</div>
                      </div>
                    </div>

                    {/* Action Buttons Grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <button
                        onClick={() => setBalanceAdjustModal({ open: true, userId: selectedUserDetail.user.id })}
                        style={{ background: "rgba(17,171,236,0.2)", border: "1px solid #11ABEC", borderRadius: 10, padding: 8, color: "#11ABEC", fontWeight: 800, fontSize: 11, cursor: "pointer" }}
                      >
                        💰 تعديل الرصيد
                      </button>
                      <button
                        onClick={() => setUserMsgModal({ open: true, userId: selectedUserDetail.user.id, isWarning: false })}
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 8, color: "#fff", fontWeight: 800, fontSize: 11, cursor: "pointer" }}
                      >
                        📩 إرسال رسالة
                      </button>
                      <button
                        onClick={() => handleBanUser(selectedUserDetail.user.id, !selectedUserDetail.isBanned)}
                        style={{ background: selectedUserDetail.isBanned ? "rgba(15,211,124,0.2)" : "rgba(229,72,77,0.2)", border: selectedUserDetail.isBanned ? "1px solid #0FD37C" : "1px solid #E5484D", borderRadius: 10, padding: 8, color: selectedUserDetail.isBanned ? "#0FD37C" : "#E5484D", fontWeight: 800, fontSize: 11, cursor: "pointer" }}
                      >
                        {selectedUserDetail.isBanned ? "فك الحظر" : "حظر الحساب 🚫"}
                      </button>
                      <button
                        onClick={() => handleToggleWithdrawalBan(selectedUserDetail.user.id, selectedUserDetail.isWithdrawalBanned || false)}
                        style={{ background: "rgba(251,191,36,0.15)", border: "1px solid #fbbf24", borderRadius: 10, padding: 8, color: "#fbbf24", fontWeight: 800, fontSize: 11, cursor: "pointer" }}
                      >
                        {selectedUserDetail.isWithdrawalBanned ? "السماح بالسحب 🔓" : "قفل السحب 🔒"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Accordion 3: الإحالات (Referrals) */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("users_referrals")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Users size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>3. الإحالات (Referrals)</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.users_referrals ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.users_referrals && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, color: "#8A8F98", display: "block", marginBottom: 4 }}>الحد الأدنى (Rush)</label>
                    <input
                      type="text"
                      value={referralSettings.rewardAmount}
                      onChange={(e) => setReferralSettings({ ...referralSettings, rewardAmount: e.target.value })}
                      style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 12, boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "#8A8F98", display: "block", marginBottom: 4 }}>نسبة ربح المحيل (%)</label>
                    <input
                      type="text"
                      value={referralSettings.depositPercent}
                      onChange={(e) => setReferralSettings({ ...referralSettings, depositPercent: e.target.value })}
                      style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 12, boxSizing: "border-box" }}
                    />
                  </div>
                </div>

                <button
                  onClick={async () => {
                    await api.adminUpdateReferralSettings({
                      referralRewardAmount: referralSettings.rewardAmount,
                      referralDepositPercent: referralSettings.depositPercent,
                    });
                    showToast("تم حفظ إعدادات الإحالة بنجاح $");
                  }}
                  style={{ width: "100%", height: 44, background: "linear-gradient(135deg, #0FA0D6, #11ABEC)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer", marginBottom: 14 }}
                >
                  $ حفظ
                </button>

                {/* Milestones list */}
                <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8F98", marginBottom: 6 }}>مستويات المكافآت:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {milestones.map((m) => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(17,171,236,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#11ABEC" }}>
                          <Users size={14} />
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 900, color: "#fff" }}>{m.requiredReferrals} دعوة</div>
                          <div style={{ fontSize: 10, color: "#11ABEC" }}>+{m.rewardAmount} {m.rewardCurrency}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={{ background: "transparent", border: "none", color: "#8A8F98", cursor: "pointer" }}><Eye size={12} /></button>
                        <button style={{ background: "transparent", border: "none", color: "#8A8F98", cursor: "pointer" }}><Edit2 size={12} /></button>
                        <button style={{ background: "transparent", border: "none", color: "#E5484D", cursor: "pointer" }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Accordion 5: الأمان ومفاتيح المحفظة */}
          <div style={{ background: "#101418", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => toggleSection("users_security_keys")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Key size={18} color="#11ABEC" />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#FFFFFF" }}>5. الأمان ومفاتيح المحفظة</span>
              </div>
              <ChevronDown size={18} color="#8A8F98" style={{ transform: openSections.users_security_keys ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
            </div>

            {openSections.users_security_keys && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 14 }}>
                {/* Risk Score Card */}
                <div style={{ background: "rgba(15,211,124,0.08)", border: "1px solid rgba(15,211,124,0.3)", borderRadius: 12, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#8A8F98" }}>نسبة الخطر (آخر 24 ساعة):</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#0FD37C" }}>0% آمن</div>
                  </div>
                  <Shield size={24} color="#0FD37C" />
                </div>

                {/* Hot Wallet Payment Keys */}
                <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#11ABEC", marginBottom: 6 }}>مفاتيح محفظة الدفع:</div>
                  <div style={{ fontSize: 10, color: "#8A8F98", marginBottom: 8 }}>
                    الحالة: مقفلة - المصدر: مفتاح معيّن من لوحة
                  </div>

                  <div style={{ position: "relative", marginBottom: 10 }}>
                    <input
                      type={showMnemonicInput ? "text" : "password"}
                      placeholder="عبارة الاسترداد (24 كلمة) أو المفتاح السري الجديد..."
                      value={mnemonicInput}
                      onChange={(e) => setMnemonicInput(e.target.value)}
                      style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 36px 8px 10px", color: "#fff", fontSize: 11, boxSizing: "border-box" }}
                    />
                    <button
                      onClick={() => setShowMnemonicInput(!showMnemonicInput)}
                      style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#8A8F98", cursor: "pointer" }}
                    >
                      {showMnemonicInput ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={handleSaveWalletKeys}
                      style={{ flex: 1, height: 38, background: "linear-gradient(135deg, #0FA0D6, #11ABEC)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 800, fontSize: 11, cursor: "pointer" }}
                    >
                      تغيير المفاتيح
                    </button>
                    <button
                      onClick={() => showToast("تم الرجوع للمفاتيح الأصلية ✅")}
                      style={{ height: 38, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "0 12px", color: "#8A8F98", fontSize: 11, cursor: "pointer" }}
                    >
                      المفاتيح الأصلية
                    </button>
                  </div>
                </div>

                {/* Toncenter API Key */}
                <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#11ABEC", marginBottom: 4 }}>مفتاح API السحب التلقائي (Toncenter API Key):</div>
                  <p style={{ fontSize: 10, color: "#8A8F98", lineHeight: 1.5, marginBottom: 8 }}>
                    يُستخدم لتنفيذ السحب التلقائي ومسح وتأكيد الإيداعات بسرعة فائقة وبدون قيود الـ Rate Limit.
                  </p>
                  <input
                    type="password"
                    placeholder="ضع مفتاح TonCenter الجديد هنا..."
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", fontSize: 11, marginBottom: 8, boxSizing: "border-box" }}
                  />
                  <button
                    onClick={handleSaveWalletKeys}
                    style={{ width: "100%", height: 38, background: "linear-gradient(135deg, #0FA0D6, #11ABEC)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 800, fontSize: 11, cursor: "pointer" }}
                  >
                    حفظ API Key
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Balance Adjust Modal ── */}
      {balanceAdjustModal.open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#101418", border: "1px solid #11ABEC", borderRadius: 20, padding: 20, maxWidth: 360, width: "100%" }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#11ABEC", marginBottom: 12 }}>
              تعديل رصيد المستخدم #{balanceAdjustModal.userId}
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {(["add", "deduct", "correct"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setBalanceAdjustForm({ ...balanceAdjustForm, type: t })}
                  style={{ flex: 1, background: balanceAdjustForm.type === t ? "#11ABEC" : "rgba(255,255,255,0.04)", color: balanceAdjustForm.type === t ? "#fff" : "#8A8F98", border: "none", borderRadius: 8, padding: "6px 0", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                >
                  {t === "add" ? "إضافة +" : t === "deduct" ? "خصم -" : "تصحيح ="}
                </button>
              ))}
            </div>

            <input
              type="number"
              step="0.01"
              placeholder="المبلغ..."
              value={balanceAdjustForm.amount}
              onChange={(e) => setBalanceAdjustForm({ ...balanceAdjustForm, amount: e.target.value })}
              style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", marginBottom: 8, boxSizing: "border-box" }}
            />

            <input
              type="text"
              placeholder="سبب التعديل..."
              value={balanceAdjustForm.reason}
              onChange={(e) => setBalanceAdjustForm({ ...balanceAdjustForm, reason: e.target.value })}
              style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 8, color: "#fff", marginBottom: 12, boxSizing: "border-box" }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleAdjustBalance}
                style={{ flex: 1, background: "linear-gradient(135deg, #0FA0D6, #11ABEC)", border: "none", borderRadius: 10, padding: 10, color: "#fff", fontWeight: 900, cursor: "pointer" }}
              >
                تأكيد التعديل
              </button>
              <button
                onClick={() => setBalanceAdjustModal({ open: false })}
                style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 10, padding: "10px 14px", color: "#8A8F98", cursor: "pointer" }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── User Message Modal ── */}
      {userMsgModal.open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#101418", border: "1px solid #11ABEC", borderRadius: 20, padding: 20, maxWidth: 380, width: "100%" }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#11ABEC", marginBottom: 12 }}>
              إرسال رسالة للمستخدم #{userMsgModal.userId}
            </div>

            <textarea
              rows={4}
              placeholder="اكتب الرسالة هنا..."
              value={userMsgText}
              onChange={(e) => setUserMsgText(e.target.value)}
              style={{ width: "100%", background: "#080b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, color: "#fff", fontSize: 12, marginBottom: 12, boxSizing: "border-box" }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSendMessageToUser}
                style={{ flex: 1, background: "linear-gradient(135deg, #0FA0D6, #11ABEC)", border: "none", borderRadius: 10, padding: 10, color: "#fff", fontWeight: 900, cursor: "pointer" }}
              >
                إرسال الآن 🚀
              </button>
              <button
                onClick={() => setUserMsgModal({ open: false })}
                style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 10, padding: "10px 14px", color: "#8A8F98", cursor: "pointer" }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Balances Modal ── */}
      {resetModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#180608", border: "2px solid #E5484D", borderRadius: 20, padding: 20, maxWidth: 360, width: "100%", textAlign: "center" }}>
            <AlertTriangle size={36} color="#E5484D" style={{ margin: "0 auto 12px" }} />
            <div style={{ fontSize: 16, fontWeight: 900, color: "#E5484D", marginBottom: 8 }}>
              تأكيد تصفير رصيد {resetModal === "coins" ? "الـ Rush/Coins" : "الـ GRAM"}
            </div>
            <p style={{ fontSize: 11, color: "#8A8F98", lineHeight: 1.6, marginBottom: 14 }}>
              سيتم تصفير الرصيد لجميع المستخدمين في قاعدة البيانات فورياً. هذا الإجراء لا يمكن التراجع عنه.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => handleResetBalances(resetModal)}
                style={{ flex: 1, background: "#E5484D", border: "none", borderRadius: 12, padding: 10, color: "#fff", fontWeight: 900, cursor: "pointer" }}
              >
                تأكيد التصفير ⚠️
              </button>
              <button
                onClick={() => setResetModal(null)}
                style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 12, padding: "10px 14px", color: "#8A8F98", cursor: "pointer" }}
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
