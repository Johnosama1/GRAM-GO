import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "en" | "ar" | "ru";

export interface Translations {
  // Navigation
  navMine: string;
  navTasks: string;
  navCombo: string;
  navFriends: string;
  navProfile: string;
  navWallet: string;
  navAdmin: string;

  // Profile Header
  profileTitle: string;
  userId: string;
  copied: string;
  copyId: string;
  noUsername: string;
  telegramUser: string;
  level: string;
  dailyYield: string;
  day: string;

  // Profile Balances
  gramGold: string;
  goPower: string;
  tonBalance: string;
  minedTokens: string;
  miningPower: string;
  readyToWithdraw: string;

  // Profile Tabs
  tabWallet: string;
  tabSwap: string;
  tabSettings: string;

  // Wallet View
  connectWallet: string;
  connectedWallet: string;
  disconnect: string;
  notConnected: string;
  connectWalletPrompt: string;
  connectWalletDesc: string;
  deposit: string;
  withdraw: string;
  history: string;
  amount: string;
  available: string;
  minWithdrawal: string;
  withdrawTon: string;
  withdrawing: string;
  insufficientTon: string;
  withdrawSuccess: string;
  withdrawSuccessDesc: string;
  withdrawFailed: string;
  noHistory: string;
  pending: string;
  processing: string;
  approved: string;
  sent: string;
  rejected: string;

  // Deposit View
  depositTitle: string;
  depositTonConnect: string;
  depositManual: string;
  depositAmount: string;
  depositNow: string;
  depositing: string;
  depositSuccess: string;
  depositSuccessDesc: string;
  depositFailed: string;
  depositAddress: string;
  copyAddress: string;
  addressCopied: string;
  depositMemo: string;
  memoNotice: string;
  minDepositNotice: string;

  // Swap View
  swapTitle: string;
  swapSubtitle: string;
  youPay: string;
  youReceive: string;
  yourBalance: string;
  swapRate: string;
  all: string;
  swapGramToGo: string;
  swapping: string;
  swapSuccess: string;
  swapSuccessDesc: string;
  swapFailed: string;
  insufficientGram: string;
  enterValidAmount: string;
  swapBoostNotice: string;

  // Settings View
  settingsTitle: string;
  settingsSubtitle: string;
  botLanguage: string;
  selectLanguage: string;
  defaultBadge: string;
  english: string;
  arabic: string;
  russian: string;
  botInfo: string;
  officialChannel: string;
  supportHelp: string;
  joinChannel: string;
  contactSupport: string;
  appVersion: string;

  // Home & Other Pages
  claimMining: string;
  claiming: string;
  minedSuccessfully: string;
  miningActive: string;
  miningIdle: string;
  speed: string;
  friendsTitle: string;
  tasksTitle: string;
  comboTitle: string;
  dailyCheckin: string;
  claimDaily: string;
}

const translations: Record<Language, Translations> = {
  en: {
    // Navigation
    navMine: "Mine",
    navTasks: "Tasks",
    navCombo: "Combo",
    navFriends: "Friends",
    navProfile: "Profile",
    navWallet: "Wallet",
    navAdmin: "Admin",

    // Profile Header
    profileTitle: "Profile",
    userId: "User ID",
    copied: "Copied!",
    copyId: "Copy ID",
    noUsername: "No username",
    telegramUser: "Telegram User",
    level: "Level",
    dailyYield: "Daily Mining Yield",
    day: "day",

    // Profile Balances
    gramGold: "GRAM GOLD",
    goPower: "GO POWER",
    tonBalance: "TON",
    minedTokens: "Mined Tokens",
    miningPower: "Mining Capacity",
    readyToWithdraw: "Ready to Withdraw",

    // Profile Tabs
    tabWallet: "Wallet",
    tabSwap: "Swap",
    tabSettings: "Settings",

    // Wallet View
    connectWallet: "Connect Wallet",
    connectedWallet: "Connected Wallet",
    disconnect: "Disconnect",
    notConnected: "Not connected",
    connectWalletPrompt: "Connect TON Wallet",
    connectWalletDesc: "Connect your non-custodial TON wallet to make instant deposits and secure withdrawals.",
    deposit: "Deposit",
    withdraw: "Withdraw",
    history: "History",
    amount: "Amount",
    available: "Available",
    minWithdrawal: "Min withdrawal: 0.1 TON",
    withdrawTon: "Withdraw TON",
    withdrawing: "Submitting...",
    insufficientTon: "Insufficient TON balance",
    withdrawSuccess: "Withdrawal Requested!",
    withdrawSuccessDesc: "Your request has been submitted and is being processed.",
    withdrawFailed: "Withdrawal failed",
    noHistory: "No withdrawal history yet",
    pending: "Pending",
    processing: "Processing",
    approved: "Approved",
    sent: "Sent",
    rejected: "Rejected",

    // Deposit View
    depositTitle: "Deposit TON",
    depositTonConnect: "Instant Deposit",
    depositManual: "Manual Transfer",
    depositAmount: "Deposit Amount",
    depositNow: "Deposit via TON Connect",
    depositing: "Processing Deposit...",
    depositSuccess: "Deposit Sent!",
    depositSuccessDesc: "Transaction sent to network. Your balance will update upon confirmation.",
    depositFailed: "Deposit transaction failed",
    depositAddress: "Official Deposit Address",
    copyAddress: "Copy Address",
    addressCopied: "Address Copied!",
    depositMemo: "Required Memo / Comment",
    memoNotice: "Important: You must include your Telegram ID in the memo field so the deposit is credited to your account.",
    minDepositNotice: "Minimum deposit: 0.1 TON",

    // Swap View
    swapTitle: "Swap GRAM → GO",
    swapSubtitle: "Convert your mined GRAM into GO to boost your mining power",
    youPay: "You Pay",
    youReceive: "You Receive",
    yourBalance: "Balance",
    swapRate: "Conversion Rate",
    all: "ALL",
    swapGramToGo: "Swap GRAM to GO",
    swapping: "Swapping...",
    swapSuccess: "Swap Successful!",
    swapSuccessDesc: "GRAM converted to GO. Your mining yield has increased!",
    swapFailed: "Swap failed",
    insufficientGram: "Insufficient GRAM balance",
    enterValidAmount: "Please enter a valid amount",
    swapBoostNotice: "GO tokens increase your daily mining speed and daily output.",

    // Settings View
    settingsTitle: "Settings",
    settingsSubtitle: "Customize bot language and preferences",
    botLanguage: "Bot Language",
    selectLanguage: "Select your preferred language",
    defaultBadge: "Default",
    english: "English",
    arabic: "العربية (Arabic)",
    russian: "Русский (Russian)",
    botInfo: "Information & Support",
    officialChannel: "Official Channel",
    supportHelp: "Customer Support",
    joinChannel: "Join Channel",
    contactSupport: "Contact Support",
    appVersion: "Version 4.5.0",

    // Home & Other Pages
    claimMining: "Claim Gram",
    claiming: "Claiming...",
    minedSuccessfully: "Mined successfully!",
    miningActive: "Mining Active",
    miningIdle: "Mining Idle",
    speed: "Speed",
    friendsTitle: "Invite Friends",
    tasksTitle: "Earn Rewards",
    comboTitle: "Daily Combo",
    dailyCheckin: "Daily Check-in",
    claimDaily: "Claim Today",
  },

  ar: {
    // Navigation
    navMine: "تعدين",
    navTasks: "المهام",
    navCombo: "كومبو",
    navFriends: "الأصدقاء",
    navProfile: "الملف الشخصي",
    navWallet: "المحفظة",
    navAdmin: "المشرف",

    // Profile Header
    profileTitle: "الملف الشخصي",
    userId: "معرّف الحساب",
    copied: "تم النسخ!",
    copyId: "نسخ المعرّف",
    noUsername: "بدون يوزر",
    telegramUser: "مستخدم تليجرام",
    level: "المستوى",
    dailyYield: "الإنتاج اليومي",
    day: "يوم",

    // Profile Balances
    gramGold: "جرام ذهب",
    goPower: "نقاط GO",
    tonBalance: "رصيد TON",
    minedTokens: "العملات المُعدّنة",
    miningPower: "قوة التعدين",
    readyToWithdraw: "جاهز للسحب",

    // Profile Tabs
    tabWallet: "المحفظة",
    tabSwap: "التبديل",
    tabSettings: "الإعدادات",

    // Wallet View
    connectWallet: "ربط المحفظة",
    connectedWallet: "المحفظة المربوطة",
    disconnect: "قطع الاتصال",
    notConnected: "غير مربوطة",
    connectWalletPrompt: "ربط محفظة TON",
    connectWalletDesc: "قم بربط محفظة TON الخاصة بك لتفعيل عمليات الإيداع والسحب الفوري بأمان.",
    deposit: "إيداع",
    withdraw: "سحب",
    history: "السجل",
    amount: "المبلغ",
    available: "المتاح",
    minWithdrawal: "الحد الأدنى للسحب: 0.1 TON",
    withdrawTon: "سحب TON",
    withdrawing: "جاري الإرسال...",
    insufficientTon: "رصيد TON غير كافٍ",
    withdrawSuccess: "تم طلب السحب بنجاح!",
    withdrawSuccessDesc: "تم إرسال طلبك بنجاح وجاري المعالجة.",
    withdrawFailed: "فشلت عملية السحب",
    noHistory: "لا توجد عمليات سحب سابقة",
    pending: "قيد الانتظار",
    processing: "قيد المعالجة",
    approved: "تمت الموافقة",
    sent: "تم الإرسال",
    rejected: "مرفوض",

    // Deposit View
    depositTitle: "إيداع TON",
    depositTonConnect: "إيداع فوري",
    depositManual: "تحويل يدوي",
    depositAmount: "مبلغ الإيداع",
    depositNow: "إيداع عبر المحفظة",
    depositing: "جاري معالجة الإيداع...",
    depositSuccess: "تم إرسال الإيداع!",
    depositSuccessDesc: "تم إرسال المعاملة، سيتم تحديث رصيدك فور تأكيدها على الشبكة.",
    depositFailed: "فشلت عملية الإيداع",
    depositAddress: "عنوان الإيداع الرسمي",
    copyAddress: "نسخ العنوان",
    addressCopied: "تم نسخ العنوان!",
    depositMemo: "الملاحظة المطلوبة (Memo / Comment)",
    memoNotice: "هام جداً: يجب إدراج معرّف تليجرام الخاص بك في خانة الملاحظة ليتم إضافة الرصيد لحسابك تلقائياً.",
    minDepositNotice: "الحد الأدنى للإيداع: 0.1 TON",

    // Swap View
    swapTitle: "تبديل GRAM إلى GO",
    swapSubtitle: "حوّل عملات الجرام المُعدّنة إلى نقاط GO لزيادة سرعة وإنتاجية التعدين اليومية",
    youPay: "المراد تبديله",
    youReceive: "المستلم بـ GO",
    yourBalance: "رصيدك",
    swapRate: "سعر التحويل",
    all: "الكل",
    swapGramToGo: "تبديل GRAM إلى GO",
    swapping: "جاري التبديل...",
    swapSuccess: "تم التبديل بنجاح!",
    swapSuccessDesc: "تم تحويل الجرام إلى GO وزادت سرعة تعدينك اليومية بنجاح!",
    swapFailed: "فشل التبديل",
    insufficientGram: "رصيد الجرام غير كافٍ",
    enterValidAmount: "يرجى إدخال مبلغ صحيح",
    swapBoostNotice: "نقاط GO ترفع من قوتك التعدينية ونسبة أرباحك اليومية بشكل دائم.",

    // Settings View
    settingsTitle: "الإعدادات",
    settingsSubtitle: "تخصيص لغة البوت وتفضيلات الحساب",
    botLanguage: "لغة البوت",
    selectLanguage: "اختر لغة البوت المفضلة لديك",
    defaultBadge: "الأساسية",
    english: "English (الإنجليزية)",
    arabic: "العربية",
    russian: "Русский (الروسية)",
    botInfo: "المعلومات والدعم الفني",
    officialChannel: "القناة الرسمية",
    supportHelp: "الدعم والمساعدة",
    joinChannel: "انضم للقناة",
    contactSupport: "تواصل مع الدعم",
    appVersion: "الإصدار 4.5.0",

    // Home & Other Pages
    claimMining: "جمع الجرام",
    claiming: "جاري الجمع...",
    minedSuccessfully: "تم التعدين بنجاح!",
    miningActive: "التعدين يعمل",
    miningIdle: "التعدين متوقف",
    speed: "السرعة",
    friendsTitle: "دعوة الأصدقاء",
    tasksTitle: "المهام والمكافآت",
    comboTitle: "كومبو اليوم",
    dailyCheckin: "تسجيل الدخول اليومي",
    claimDaily: "استلام مكافأة اليوم",
  },

  ru: {
    // Navigation
    navMine: "Майнинг",
    navTasks: "Задания",
    navCombo: "Комбо",
    navFriends: "Друзья",
    navProfile: "Профиль",
    navWallet: "Кошелек",
    navAdmin: "Админ",

    // Profile Header
    profileTitle: "Профиль",
    userId: "ID аккаунта",
    copied: "Скопировано!",
    copyId: "Копировать ID",
    noUsername: "Без юзернейма",
    telegramUser: "Пользователь Telegram",
    level: "Уровень",
    dailyYield: "Дневная добыча",
    day: "день",

    // Profile Balances
    gramGold: "GRAM GOLD",
    goPower: "GO POWER",
    tonBalance: "TON",
    minedTokens: "Добытые токены",
    miningPower: "Мощность майнинга",
    readyToWithdraw: "Доступно к выводу",

    // Profile Tabs
    tabWallet: "Кошелек",
    tabSwap: "Обмен",
    tabSettings: "Настройки",

    // Wallet View
    connectWallet: "Подключить кошелек",
    connectedWallet: "Подключенный кошелек",
    disconnect: "Отключить",
    notConnected: "Не подключен",
    connectWalletPrompt: "Подключить TON кошелек",
    connectWalletDesc: "Подключите ваш некастодиальный TON кошелек для мгновенных депозитов и вывода средств.",
    deposit: "Депозит",
    withdraw: "Вывод",
    history: "История",
    amount: "Сумма",
    available: "Доступно",
    minWithdrawal: "Мин. вывод: 0.1 TON",
    withdrawTon: "Вывести TON",
    withdrawing: "Отправка...",
    insufficientTon: "Недостаточно TON на балансе",
    withdrawSuccess: "Запрос на вывод создан!",
    withdrawSuccessDesc: "Ваш запрос успешно отправлен и обрабатывается.",
    withdrawFailed: "Ошибка вывода",
    noHistory: "История выводов пуста",
    pending: "Ожидает",
    processing: "В обработке",
    approved: "Одобрено",
    sent: "Отправлено",
    rejected: "Отклонено",

    // Deposit View
    depositTitle: "Депозит TON",
    depositTonConnect: "Быстрый депозит",
    depositManual: "Ручной перевод",
    depositAmount: "Сумма депозита",
    depositNow: "Внести через TON Connect",
    depositing: "Обработка депозита...",
    depositSuccess: "Депозит отправлен!",
    depositSuccessDesc: "Транзакция отправлена в сеть. Баланс обновится после подтверждения.",
    depositFailed: "Ошибка транзакции депозита",
    depositAddress: "Официальный адрес депозита",
    copyAddress: "Скопировать адрес",
    addressCopied: "Адрес скопирован!",
    depositMemo: "Обязательный Memo / Комментарий",
    memoNotice: "Важно: Обязательно укажите ваш Telegram ID в поле комментария (Memo), чтобы средства зачислились на ваш аккаунт.",
    minDepositNotice: "Минимальный депозит: 0.1 TON",

    // Swap View
    swapTitle: "Обмен GRAM → GO",
    swapSubtitle: "Конвертируйте добытые GRAM в очки GO для увеличения скорости майнинга",
    youPay: "Вы отдаете",
    youReceive: "Вы получаете",
    yourBalance: "Баланс",
    swapRate: "Курс обмена",
    all: "ВСЕ",
    swapGramToGo: "Обменять GRAM на GO",
    swapping: "Обмен...",
    swapSuccess: "Обмен выполнен!",
    swapSuccessDesc: "GRAM конвертированы в GO. Мощность майнинга повышена!",
    swapFailed: "Ошибка обмена",
    insufficientGram: "Недостаточно GRAM на балансе",
    enterValidAmount: "Введите корректную сумму",
    swapBoostNotice: "Очки GO увеличивают скорость майнинга и ваш ежедневный доход.",

    // Settings View
    settingsTitle: "Настройки",
    settingsSubtitle: "Язык бота и параметры приложения",
    botLanguage: "Язык бота",
    selectLanguage: "Выберите предпочитаемый язык",
    defaultBadge: "Основной",
    english: "English (Английский)",
    arabic: "العربية (Арабский)",
    russian: "Русский",
    botInfo: "Информация и поддержка",
    officialChannel: "Официальный канал",
    supportHelp: "Служба поддержки",
    joinChannel: "Перейти в канал",
    contactSupport: "Написать в поддержку",
    appVersion: "Версия 4.5.0",

    // Home & Other Pages
    claimMining: "Собрать Gram",
    claiming: "Сбор...",
    minedSuccessfully: "Успешно собрано!",
    miningActive: "Майнинг активен",
    miningIdle: "Майнинг остановлен",
    speed: "Скорость",
    friendsTitle: "Пригласить друзей",
    tasksTitle: "Задания и награды",
    comboTitle: "Комбо дня",
    dailyCheckin: "Ежедневный вход",
    claimDaily: "Забрать награду",
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
  isRtl: boolean;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  t: translations.en,
  isRtl: false,
});

const LANG_STORAGE_KEY = "jjx_app_lang";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY) as Language | null;
      if (saved && (saved === "en" || saved === "ar" || saved === "ru")) {
        return saved;
      }
    } catch {
      // ignore
    }
    return "en"; // Default is English as requested
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  };

  const isRtl = language === "ar";
  const t = translations[language] || translations.en;

  useEffect(() => {
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language, isRtl]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRtl }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
