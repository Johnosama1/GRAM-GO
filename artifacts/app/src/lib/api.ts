const BASE_URL = (import.meta.env.VITE_API_URL ?? "") + "/api";

function getTelegramInitData(): string {
  return (window as unknown as { Telegram?: { WebApp?: { initData: string } } })
    .Telegram?.WebApp?.initData || "";
}

// ── Session token (issued by /api/session/issue after verification) ──
let _sessionToken: string | null = null;

export function setSessionToken(token: string) {
  _sessionToken = token;
}

export function getSessionToken(): string | null {
  return _sessionToken;
}

export function clearSessionToken() {
  _sessionToken = null;
}

// ── Module-level caches ───────────────────────────────────────────────
let _slotsCache: Promise<WheelSlot[]> | null = null;
export function getWheelSlotsOnce(): Promise<WheelSlot[]> {
  if (!_slotsCache) _slotsCache = apiCall<WheelSlot[]>("/wheel");
  return _slotsCache;
}

export type BoostStatus = { active: boolean; multiplier: number; endsAt: string | null };
export async function getBoostStatus(): Promise<BoostStatus> {
  return apiCall<BoostStatus>("/wheel/boost");
}

let _tasksCache: Promise<Task[]> | null = null;
export function getTasksOnce(): Promise<Task[]> {
  if (!_tasksCache) {
    _tasksCache = apiCall<Task[]>("/tasks").catch((err) => {
      _tasksCache = null;
      throw err;
    });
  }
  return _tasksCache;
}

const _completedCache = new Map<number, Promise<number[]>>();
export function getCompletedTasksOnce(userId: number): Promise<number[]> {
  if (!_completedCache.has(userId))
    _completedCache.set(userId, apiCall<number[]>(`/tasks/${userId}/completed`));
  return _completedCache.get(userId)!;
}

const _withdrawalsCache = new Map<number, Promise<Withdrawal[]>>();
export function getWithdrawalsOnce(userId: number): Promise<Withdrawal[]> {
  if (!_withdrawalsCache.has(userId))
    _withdrawalsCache.set(userId, apiCall<Withdrawal[]>(`/withdrawals/${userId}`));
  return _withdrawalsCache.get(userId)!;
}

export async function swapUsdtToTon(userId: number, usdtAmount: number) {
  return apiCall<{ success: boolean; tonAmount: string; tonPrice: number; user: unknown }>(
    `/users/${userId}/swap`,
    { method: "POST", body: JSON.stringify({ usdtAmount }) }
  );
}

export async function swapGramToTon(userId: number, gramAmount: number) {
  return apiCall<{ success: boolean; tonAmount: string; tonPrice: number; user: unknown }>(
    `/users/${userId}/swap`,
    { method: "POST", body: JSON.stringify({ gramAmount }) }
  );
}

export async function swapGramToGo(userId: number, gramAmount: number) {
  return apiCall<{ success: boolean; gramAmount: string; goAmount: string; rate: number; user: User }>(
    `/users/${userId}/swap-gram-to-go`,
    { method: "POST", body: JSON.stringify({ gramAmount }) }
  );
}

export async function recordDeposit(data: { userId: number; amount: string; walletAddress?: string; txHash?: string }) {
  return apiCall<{ success: boolean; deposit: Deposit }>(
    "/withdrawals/deposit",
    { method: "POST", body: JSON.stringify(data) }
  );
}

const _depositsCache = new Map<number, Promise<Deposit[]>>();
export function getDepositsOnce(userId: number): Promise<Deposit[]> {
  if (!_depositsCache.has(userId))
    _depositsCache.set(userId, apiCall<Deposit[]>(`/withdrawals/deposits/${userId}`));
  return _depositsCache.get(userId)!;
}

export function invalidateUserCaches(userId: number) {
  _completedCache.delete(userId);
  _withdrawalsCache.delete(userId);
  _depositsCache.delete(userId);
  _tasksCache = null;
}

// ── Core fetch wrapper ────────────────────────────────────────────────
export async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const initData = getTelegramInitData();
  const baseHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (initData) baseHeaders["x-telegram-init-data"] = initData;
  if (_sessionToken) baseHeaders["x-session-token"] = _sessionToken;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...baseHeaders,
        ...(options?.headers as Record<string, string> | undefined),
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    const e = new Error("Request timeout or network error") as Error & { status: number; body: unknown };
    e.status = 0;
    e.body = {};
    throw e;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));

    if (res.status === 401 && err.error === "session_expired") {
      clearSessionToken();
    }

    const e = new Error(err.error || "Request failed") as Error & { status: number; body: unknown };
    e.status = res.status;
    e.body = err;
    throw e;
  }
  return res.json();
}

export const api = {
  getConfig: () => apiCall<{
    botUsername: string;
    referralThreshold: number;
    taskThreshold: number;
    minWithdrawal: number;
    depositWalletAddress?: string;
    minDeposit?: number;
    gramToGoRate?: number;
  }>("/config"),

  initUser: (data: { id: number; username?: string; first_name?: string; last_name?: string; photo_url?: string }) =>
    apiCall<User>("/users/init", { method: "POST", body: JSON.stringify(data) }),

  getUser: (id: number) => apiCall<User>(`/users/${id}`),

  issueSession: (userId: number) =>
    apiCall<SessionResult>("/session/issue", { method: "POST", body: JSON.stringify({ userId }) }),

  recheckSession: (userId: number) =>
    apiCall<SessionResult>("/session/recheck", { method: "POST", body: JSON.stringify({ userId }) }),

  spin: (userId: number) =>
    apiCall<{ winner: WheelSlot; user: User; slotIndex: number; slots: WheelSlot[] }>(`/users/${userId}/spin`, { method: "POST" }),

  getMiningStatus: () => apiCall<MiningStatus>("/mining/status"),
  claimMining: () => apiCall<ClaimMiningResult>("/mining/claim", { method: "POST" }),
  getMiningStats: () =>
    apiCall<{
      totalMiners: number;
      totalGoCirculation: string;
      totalGramMined: string;
      dailyNetworkYield: string;
      defaultRatePercent: number;
    }>("/mining/stats"),

  getTasks: () => apiCall<Task[]>("/tasks"),
  getUserCompletedTasks: (userId: number) => apiCall<number[]>(`/tasks/${userId}/completed`),
  completeTask: (taskId: number, userId: number) =>
    apiCall<{ success: boolean; user: User; rewardedGo?: number }>(`/tasks/${taskId}/complete`, { method: "POST", body: JSON.stringify({ userId }) }),

  getWheelSlots: () => apiCall<WheelSlot[]>("/wheel"),

  requestWithdrawal: (data: { userId: number; amount: string; walletAddress: string }) =>
    apiCall("/withdrawals", { method: "POST", body: JSON.stringify(data) }),
  getUserWithdrawals: (userId: number) => apiCall<Withdrawal[]>(`/withdrawals/${userId}`),
  getUserDeposits: (userId: number) => apiCall<Deposit[]>(`/withdrawals/deposits/${userId}`),

  adminCheck: (_userId?: number) => apiCall<{ isAdmin: boolean; role?: string; isOwner?: boolean; permissions?: string[] }>("/admin/check"),
  adminGetStats: () => apiCall<AdminStats>("/admin/stats"),
  adminBroadcast: (data: { message: string; pin?: boolean; entities?: unknown[] }) =>
    apiCall<{ ok: boolean; queued: boolean; totalUsers: number; message: string }>("/admin/broadcast", { method: "POST", body: JSON.stringify(data) }),
  adminGetSettings: () => apiCall<Record<string, string>>("/admin/settings"),
  adminUpdateSetting: (key: string, value: string) => apiCall<{ ok: boolean; key: string; value: string }>("/admin/settings", { method: "PUT", body: JSON.stringify({ key, value }) }),
  adminGetWelcomeMessage: () => apiCall<{ welcomeMessage: string }>("/admin/welcome-message"),
  adminUpdateWelcomeMessage: (message: string) => apiCall<{ ok: boolean; welcomeMessage: string }>("/admin/welcome-message", { method: "PUT", body: JSON.stringify({ message }) }),
  adminGetChannels: () => apiCall<Array<{ username: string; title: string; inviteLink: string; mandatory?: boolean }>>("/admin/channels"),
  adminAddChannel: (data: { username: string; title?: string; inviteLink?: string; mandatory?: boolean }) =>
    apiCall<{ ok: boolean; channels: Array<{ username: string; title: string; inviteLink: string; mandatory?: boolean }> }>("/admin/channels", { method: "POST", body: JSON.stringify(data) }),
  adminDeleteChannel: (username: string) => apiCall<{ ok: boolean; channels: Array<{ username: string; title: string; inviteLink: string; mandatory?: boolean }> }>(`/admin/channels/${username}`, { method: "DELETE" }),
  adminGetAdmins: () => apiCall<AdminUser[]>("/admin/admins"),
  adminAddAdmin: (data: { id: number; username?: string; role?: string; permissions: string[] }) =>
    apiCall<AdminUser>("/admin/admins", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateAdmin: (id: number, data: { role?: string; permissions?: string[] }) =>
    apiCall<AdminUser>(`/admin/admins/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  adminDeleteAdmin: (id: number) => apiCall<{ ok: boolean; success: boolean }>(`/admin/admins/${id}`, { method: "DELETE" }),
  adminGetAuditLogs: (limit?: number) => apiCall<AuditLog[]>(`/admin/audit-logs${limit ? `?limit=${limit}` : ""}`),
  adminUpdateMiningRate: (rate: number) => apiCall<{ ok: boolean; rate: string; percentage: string }>("/admin/mining/rate", { method: "POST", body: JSON.stringify({ rate }) }),
  adminGetWithdrawals: (status?: string, search?: string) =>
    apiCall<WithdrawalItem[]>(`/admin/withdrawals?${new URLSearchParams({ ...(status ? { status } : {}), ...(search ? { search } : {}) }).toString()}`),
  adminUpdateWithdrawal: (id: number, action: "approve" | "reject", reason?: string) =>
    apiCall<{ ok: boolean; success: boolean }>(`/admin/withdrawals/${id}/action`, { method: "POST", body: JSON.stringify({ action, reason }) }),
  adminGetDeposits: (status?: string, search?: string) =>
    apiCall<DepositItem[]>(`/admin/deposits?${new URLSearchParams({ ...(status ? { status } : {}), ...(search ? { search } : {}) }).toString()}`),
  adminUpdateDepositWallet: (address: string) => apiCall<{ ok: boolean; address: string }>("/admin/deposit-wallet", { method: "PUT", body: JSON.stringify({ address }) }),
  adminGetLimits: () => apiCall<{ minWithdrawal: string; maxWithdrawal: string; dailyWithdrawalLimit: string; minDeposit: string; maxDeposit: string; dailyDepositLimit: string }>("/admin/limits"),
  adminUpdateLimits: (limits: { minWithdrawal?: string; maxWithdrawal?: string; dailyWithdrawalLimit?: string; minDeposit?: string; maxDeposit?: string; dailyDepositLimit?: string }) =>
    apiCall<{ ok: boolean; limits: Record<string, string> }>("/admin/limits", { method: "PUT", body: JSON.stringify(limits) }),
  adminResetGoBalances: (confirm: string) => apiCall<{ ok: boolean; success: boolean; affectedUsers: number }>("/admin/reset-go-balances", { method: "POST", body: JSON.stringify({ confirm }) }),
  adminResetGramBalances: (confirm: string) => apiCall<{ ok: boolean; success: boolean; affectedUsers: number }>("/admin/reset-gram-balances", { method: "POST", body: JSON.stringify({ confirm }) }),
  adminGetTasks: () => apiCall<Task[]>("/admin/tasks"),
  adminCreateTask: (data: Partial<Task>) => apiCall<Task>("/admin/tasks", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateTask: (id: number, data: Partial<Task>) => apiCall<Task>(`/admin/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  adminDeleteTask: (id: number) => apiCall<{ ok: boolean; success: boolean }>(`/admin/tasks/${id}`, { method: "DELETE" }),
  adminGetContests: () => apiCall<ContestItem[]>("/admin/contests"),
  adminCreateContest: (data: Partial<ContestItem>) => apiCall<ContestItem>("/admin/contests", { method: "POST", body: JSON.stringify(data) }),
  adminFinalizeContest: (id: number) => apiCall<{ ok: boolean; contestId: number; winners: unknown[] }>(`/admin/contests/${id}/finalize`, { method: "POST" }),
  adminGetComboStats: () => apiCall<ComboAdminStats>("/admin/combo/stats"),
  adminGetCheckinSettings: () => apiCall<Record<number, number>>("/admin/checkin/settings"),
  adminUpdateCheckinSettings: (rewards: Record<number, number>) => apiCall<{ ok: boolean; rewards: Record<number, number> }>("/admin/checkin/settings", { method: "PUT", body: JSON.stringify({ rewards }) }),
  adminGetUsers: (search?: string, limit?: number, offset?: number) =>
    apiCall<User[]>(`/admin/users?${new URLSearchParams({ ...(search ? { search } : {}), ...(limit ? { limit: String(limit) } : {}), ...(offset ? { offset: String(offset) } : {}) }).toString()}`),
  adminGetUserDetail: (id: number) => apiCall<UserDetailResult>(`/admin/users/${id}`),
  adminAdjustBalance: (id: number, data: { type: "add" | "deduct" | "correct"; currency: "GO" | "Gram"; amount: number; reason: string }) =>
    apiCall<{ ok: boolean; success: boolean; targetId: number; previousBalance: number; newBalance: number; diff: number }>(`/admin/users/${id}/balance`, { method: "POST", body: JSON.stringify(data) }),
  adminSendMessage: (id: number, data: { message: string; isWarning?: boolean }) =>
    apiCall<{ ok: boolean; success: boolean }>(`/admin/users/${id}/message`, { method: "POST", body: JSON.stringify(data) }),
  adminBanUser: (id: number, reason?: string) => apiCall<{ ok: boolean; banned: boolean }>(`/admin/users/${id}/ban`, { method: "POST", body: JSON.stringify({ reason }) }),
  adminUnbanUser: (id: number) => apiCall<{ ok: boolean; unbanned: boolean }>(`/admin/users/${id}/unban`, { method: "POST" }),
  adminIpBanUser: (id: number) => apiCall<{ ok: boolean; ipHash: string | null; affectedUsers: number }>(`/admin/users/${id}/ip-ban`, { method: "POST" }),
  adminIpUnbanUser: (id: number) => apiCall<{ ok: boolean; ipHash: string | null; affectedUsers: number }>(`/admin/users/${id}/ip-unban`, { method: "POST" }),
  adminBanWithdrawals: (id: number) => apiCall<{ ok: boolean; isWithdrawalBanned: boolean }>(`/admin/users/${id}/withdrawal-ban`, { method: "POST" }),
  adminUnbanWithdrawals: (id: number) => apiCall<{ ok: boolean; isWithdrawalBanned: boolean }>(`/admin/users/${id}/withdrawal-unban`, { method: "POST" }),
  adminDeleteUser: (id: number) => apiCall<{ ok: boolean; success: boolean; targetId: number }>(`/admin/users/${id}`, { method: "DELETE" }),
  adminGetAutoBanned: () => apiCall<AutoBannedItem[]>("/admin/auto-banned"),
  adminGetReferralSettings: () => apiCall<{ referralRewardAmount: string; referralDepositPercent: string; referralThreshold: string }>("/admin/referral-settings"),
  adminUpdateReferralSettings: (data: { referralRewardAmount?: string; referralDepositPercent?: string; referralThreshold?: string }) =>
    apiCall<{ ok: boolean; settings: Record<string, string> }>("/admin/referral-settings", { method: "PUT", body: JSON.stringify(data) }),
  adminGetMilestones: () => apiCall<MilestoneItem[]>("/admin/milestones"),
  adminCreateMilestone: (data: { requiredReferrals: number; rewardAmount: number; rewardCurrency: string; isRepeatable: boolean }) =>
    apiCall<MilestoneItem>("/admin/milestones", { method: "POST", body: JSON.stringify(data) }),
  adminDeleteMilestone: (id: number) => apiCall<{ ok: boolean; success: boolean }>(`/admin/milestones/${id}`, { method: "DELETE" }),
  adminGetSecurityEvents: () => apiCall<SecurityEventItem[]>("/admin/security/events"),
  adminGetWalletKeys: () => apiCall<{ tonWalletConfigured: boolean; maskedWalletAddress: string; hasTelegramBotToken: boolean; hasNeonDatabaseUrl: boolean; hasCustomMnemonic?: boolean; hasCustomApiKey?: boolean; securityStatus: string }>("/admin/wallet-keys"),
  adminUpdateWalletKeys: (data: { mnemonic?: string; apiKey?: string; endpoint?: string }) =>
    apiCall<{ ok: boolean; message: string }>("/admin/wallet-keys", { method: "PUT", body: JSON.stringify(data) }),

  saveWallet: (userId: number, walletAddress: string | null) =>
    apiCall<{ savedWalletAddress: string | null }>(`/users/${userId}/wallet`, {
      method: "PUT",
      body: JSON.stringify({ walletAddress }),
    }),

  verifyDevice: (deviceId: string) =>
    apiCall<{ success: boolean; alreadyVerified?: boolean }>("/verify-device", {
      method: "POST",
      body: JSON.stringify({ deviceId }),
    }),

  getVerificationToken: () =>
    apiCall<{ token: string }>("/verification/get-token", {
      method: "POST",
    }),

  sendFingerprint: (payload: { fingerprint: string; meta: Record<string, unknown>; user_id?: number; fp_token?: string }) =>
    apiCall<{ ok?: boolean; success?: boolean; verified?: boolean; banned?: boolean; error?: string }>("/fingerprint", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getComboStatus: () => apiCall<ComboStatus>("/combo/status"),

  checkCombo: (selectedItems: number[]) =>
    apiCall<{ ok: boolean; isSuccess: boolean; reward: number; message: string; nextComboAt: string }>("/combo/check", {
      method: "POST",
      body: JSON.stringify({ selectedItems }),
    }),

  startSwordAdventure: () =>
    apiCall<{ ok: boolean; sessionToken: string; rewardPerEnemy: number; maxEnemiesPerRound: number; serverTime: string }>("/games/sword-adventure/start", {
      method: "POST",
    }),

  finishSwordAdventure: (data: { sessionToken: string; enemiesDefeated: number; durationSeconds: number }) =>
    apiCall<{ ok: boolean; success: boolean; enemiesDefeated: number; reward: number; currency: string; durationSeconds: number; goBalance: string; message: string }>("/games/sword-adventure/finish", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getCheckinStatus: () => apiCall<CheckinStatus>("/checkin/status"),

  claimDailyCheckin: () =>
    apiCall<{ ok: boolean; success: boolean; day: number; rewardAmount: number; goBalance: string; message: string }>("/checkin/claim", {
      method: "POST",
    }),

  getUserReferrals: (userId: number) => apiCall<ReferralEntry[]>(`/users/${userId}/referrals`),

  getLeaderboard: (userId?: number) =>
    apiCall<{
      top: Array<{
        rank: number;
        id: number;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        referralCount: number;
      }>;
      myRank: { rank: number; referralCount: number } | null;
    }>(`/leaderboard${userId ? `?userId=${userId}` : ""}`),

  verifyAccess: (userId: number) =>
    apiCall<VerifyAccessResult>(`/subscription/verify-access?userId=${userId}`),

  recheckSubscription: (userId: number) =>
    apiCall<{ isBlocked: boolean; missingChannels: SubscriptionChannel[] }>(
      "/subscription/recheck",
      { method: "POST", body: JSON.stringify({ userId }) }
    ),

  getSubscriptionStatus: (userId: number) =>
    apiCall<SubscriptionStatus>(`/subscription/status/${userId}`),
};

// ── Types ─────────────────────────────────────────────────────────────

export interface MiningStatus {
  isMining: boolean;
  goBalance: string;
  gramBalance: string;
  unclaimedGram: string;
  miningRate: number;
  dailyYield: string;
  perSecondYield: string;
  lastMiningAt: string;
  remainingSeconds?: number;
  cycleDurationSeconds?: number;
  serverTime?: string;
}

export interface ClaimMiningResult {
  success: boolean;
  claimedAmount: string;
  gramBalance: string;
  user: User;
}

export interface SessionResult {
  token: string;
  expiresAt: number;
  userId: number;
}

export interface User {
  id: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  balance: string;
  goBalance?: string;
  gramBalance?: string;
  unclaimedGram?: string;
  miningRate?: number;
  dailyYield?: string;
  perSecondYield?: string;
  isMining?: boolean;
  lastMiningAt?: string;
  tonBalance: string;
  spins: number;
  referralCount: number;
  tasksCompleted: number;
  referredBy: number | null;
  inviterName: string | null;
  savedWalletAddress: string | null;
  createdAt: string;
  isVerified: boolean;
  rewardedSpins: number;
  isBlockedForLeaving: boolean;
  isVisible: boolean | null;
  ipHash?: string | null;
  isBanned?: boolean;
  isWithdrawalBanned?: boolean;
}

export interface ReferralEntry {
  id: number;
  name: string;
  username: string | null;
  photoUrl: string | null;
  status: "pending" | "approved";
  joinedAt: string;
}

export interface ComboItem {
  id: number;
  name: string;
  image: string;
  description: string;
}

export interface ComboStatus {
  items: ComboItem[];
  attempted: boolean;
  isSuccess: boolean;
  rewardClaimed: boolean;
  selectedItems: number[];
  rewardAmount: number;
  nextComboAt: string;
  serverTime: string;
}

export interface CheckinDay {
  day: number;
  reward: number;
  currency: string;
  status: "claimed" | "available" | "locked";
}

export interface CheckinStatus {
  currentStreak: number;
  nextDay: number;
  alreadyClaimedToday: boolean;
  canClaim: boolean;
  todayReward: number;
  days: CheckinDay[];
  nextClaimAt: string;
  serverTime: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  url: string | null;
  icon: string | null;
  channelPhotoUrl: string | null;
  rewardAmount?: string;
  rewardCurrency?: string;
  maxClaims?: number | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface WheelSlot {
  id: number;
  amount: string;
  probability: number;
  displayOrder: number;
}

export interface Withdrawal {
  id: number;
  userId: number;
  amount: string;
  walletAddress: string;
  status: string;
  createdAt: string;
}

export interface Deposit {
  id: number;
  userId: number;
  amount: string;
  currency?: string;
  walletAddress?: string | null;
  txHash?: string | null;
  status: string;
  reason?: string | null;
  createdAt: string;
  confirmedAt?: string | null;
}

export type AdminPermission =
  | "canViewStats"
  | "canBroadcast"
  | "canManageUsers"
  | "canManageWithdrawals"
  | "canManageDeposits"
  | "canManageTasks"
  | "canManageChannels"
  | "canManageCombo"
  | "canManageCheckin"
  | "canManageSettings"
  | "canManageWallet"
  | "canManageApiSettings"
  | "canBanUsers"
  | "canManageAdmins"
  | "canUnban"
  | "canWarn"
  | "canReceiveWithdrawals"
  | "canEditWheel"
  | "*";

export interface AdminUser {
  id: number;
  username: string | null;
  role: string;
  addedAt: string;
  permissions: AdminPermission[];
}

export interface SubscriptionChannel {
  username: string;
  title: string;
  inviteLink: string;
}

export interface SubscriptionStatus {
  enforced: boolean;
  isBlocked: boolean;
  missingChannels: SubscriptionChannel[];
  requiredChannels: SubscriptionChannel[];
}

export interface VerifyAccessResult {
  allowed: boolean;
  enforced: boolean;
  message?: string;
  missingChannels: SubscriptionChannel[];
  requiredChannels: SubscriptionChannel[];
}

export interface AuditFinding {
  level: "danger" | "warning" | "info";
  text: string;
}

export interface ActivityLogEntry {
  time: string;
  event: string;
  type: "info" | "warning" | "danger";
}

export interface AuditResult {
  withdrawal: Withdrawal;
  user: User;
  riskScore: number;
  findings: AuditFinding[];
  activityLog: ActivityLogEntry[];
  stats: {
    accountAgeDays: number;
    balance: string;
    tonBalance: string;
    tasksCompleted: number;
    referralCount: number;
    rewardedSpins: number;
    estimatedSpinsEarned: number;
    estimatedMaxBalance: string;
    avgExpectedBalance: string;
    pendingWithdrawalsCount: number;
    totalWithdrawn: string;
    allWithdrawalsCount: number;
    isDeviceVerified: boolean;
    isBlockedForLeaving: boolean;
    isBanned: boolean;
    ipSuspicious: boolean;
    referralClusterCount: number;
  };
}

export interface AdminStats {
  totalUsers: number;
  activeNow: number;
  active24h: number;
  bannedAccounts: number;
  autoBannedAccounts: number;
  totalGo: string;
  totalGram: string;
  totalTonWithdrawn: string;
  pendingWithdrawalsCount: number;
  countries: Array<{ region: string; count: number; percentage: string }> | null;
}

export interface AuditLog {
  id: number;
  adminId: number;
  action: string;
  targetUserId: number | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface WithdrawalItem {
  id: number;
  userId: number;
  amount: string;
  currency: string;
  walletAddress: string;
  fee: string | null;
  status: string;
  txHash: string | null;
  errorMsg: string | null;
  createdAt: string;
  processedAt: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface DepositItem {
  id: number;
  userId: number;
  amount: string;
  currency: string;
  walletAddress: string | null;
  txHash: string | null;
  status: string;
  reason: string | null;
  createdAt: string;
  confirmedAt: string | null;
  username: string | null;
  firstName: string | null;
}

export interface ContestItem {
  id: number;
  title: string;
  description: string | null;
  rewardType: string;
  totalReward: string;
  winnerCount: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isFinished: boolean;
  winners: Array<{ rank: number; userId: number; prize: string }> | null;
  createdAt: string;
}

export interface MilestoneItem {
  id: number;
  requiredReferrals: number;
  rewardAmount: string;
  rewardCurrency: string;
  isRepeatable: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface AutoBannedItem {
  id: number;
  userId: number;
  reason: string;
  bannedAt: string;
  bannedBy: string;
  matchedSignals: string[] | null;
  isActive: boolean;
  username: string | null;
  firstName: string | null;
  ipHash: string | null;
}

export interface SecurityEventItem {
  id: number;
  userId: number;
  eventType: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface ComboAdminAttempt {
  id: number;
  userId: number;
  username: string | null;
  firstName: string | null;
  selectedItems: number[];
  isSuccess: boolean;
  rewardAmount: string;
  createdAt: string;
}

export interface ComboAdminStats {
  todayDate: string;
  startsAt?: string;
  expiresAt?: string;
  combo: {
    item1: { id: number; name: string; image?: string };
    item2: { id: number; name: string; image?: string };
    item3: { id: number; name: string; image?: string };
    rewardAmount: string;
  } | null;
  totalAttemptsToday: number;
  successfulSolvesToday: number;
  totalRewardsDistributed: string;
  allItems: Array<{ id: number; name: string; image: string; description: string }>;
  recentAttempts?: ComboAdminAttempt[];
}

export interface DeviceFingerprintItem {
  id: number;
  userId: number;
  fingerprint: string;
  screenResolution?: string | null;
  timeZone?: string | null;
  userAgent?: string | null;
  ipHash?: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export interface UserDetailResult {
  user: User;
  inviter?: { id: number; username: string | null; firstName: string | null } | null;
  transactions: Array<{
    id: number;
    type: string;
    amount: string;
    currency: string;
    details: Record<string, unknown> | null;
    createdAt: string;
  }>;
  referralsCount: number;
  referrals?: Array<{ id: number; refereeId?: number; createdAt?: string }>;
  withdrawals: WithdrawalItem[];
  deposits?: DepositItem[];
  fingerprints?: DeviceFingerprintItem[];
  tasksCompletedCount?: number;
  totalDeposited?: string;
  totalWithdrawn?: string;
  isBanned: boolean;
  isWithdrawalBanned?: boolean;
  banReason: string | null;
}

