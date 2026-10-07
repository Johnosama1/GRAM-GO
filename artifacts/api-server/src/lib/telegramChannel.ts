import { logger } from "./logger";

export function getBotToken(): string {
  return (
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.TOKEN ||
    ""
  );
}

export function extractChannelUsername(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const match = trimmed.match(/t\.me\/([A-Za-z0-9_+-]+)/);
  if (match) return match[1].replace(/^@/, "");
  if (trimmed.startsWith("@")) return trimmed.replace(/^@/, "");
  return trimmed.replace(/^@/, "");
}

export function normalizeChatId(channelInput?: string | null): string | null {
  if (!channelInput) return null;
  const trimmed = channelInput.trim();
  if (!trimmed) return null;

  // Numeric Chat ID (e.g. -1001234567890, -123456)
  if (trimmed.startsWith("-100") || (trimmed.startsWith("-") && /^-?\d+$/.test(trimmed))) {
    return trimmed;
  }

  // Plain digits ID
  if (/^\d{6,}$/.test(trimmed)) {
    return `-100${trimmed}`;
  }

  // URL extraction
  const urlMatch = trimmed.match(/t\.me\/([A-Za-z0-9_+-]+)/);
  if (urlMatch) {
    const slug = urlMatch[1];
    if (slug.startsWith("+") || slug.toLowerCase().startsWith("joinchat")) {
      return slug;
    }
    const username = slug.replace(/^@/, "");
    return `@${username}`;
  }

  // Username
  const clean = trimmed.replace(/^@/, "");
  return `@${clean}`;
}

export interface BotAdminCheckResult {
  ok: boolean;
  isAdmin: boolean;
  chatId?: string;
  username?: string | null;
  title?: string;
  photoUrl?: string | null;
  error?: string;
}

/**
 * Checks if the bot can access the channel and is an administrator.
 */
export async function checkBotChannelAdmin(channelInput: string): Promise<BotAdminCheckResult> {
  const token = getBotToken();
  if (!token) {
    return {
      ok: false,
      isAdmin: false,
      error: "Telegram Bot Token is not configured on the server",
    };
  }

  const chatId = normalizeChatId(channelInput);
  if (!chatId) {
    return {
      ok: false,
      isAdmin: false,
      error: "يرجى إدخال معرّف القناة أو رابطها بشكل صحيح",
    };
  }

  // Invite links cannot be queried directly via Telegram Bot API without numeric chat ID
  if (chatId.startsWith("+") || chatId.toLowerCase().startsWith("joinchat")) {
    return {
      ok: false,
      isAdmin: false,
      error: "روابط الدعوة الخاصة لا تدعم التحقق المباشر من Telegram Bot API بدون معرف القناة الرقمي (-100...). يرجى إدخال @username الخاص بالقناة أو الـ Chat ID مع إضافة البوت كمشرف.",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    // 1. Get Chat information
    const chatRes = await fetch(
      `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`,
      { signal: controller.signal }
    );
    const chatData: any = await chatRes.json().catch(() => ({ ok: false }));

    if (!chatData.ok) {
      clearTimeout(timeout);
      const desc = chatData.description || "";
      if (desc.includes("chat not found")) {
        return {
          ok: false,
          isAdmin: false,
          error: `القناة (${chatId}) غير موجودة أو تم حذفها أو أن الرابط غير صحيح. يرجى التأكد من اسم المستخدم أو الـ Chat ID.`,
        };
      }
      if (desc.includes("bot was blocked") || desc.includes("bot is not a member") || desc.includes("chat not accessible")) {
        return {
          ok: false,
          isAdmin: false,
          error: `البوت غير موجود داخل القناة (${chatId}) أو ليس لديه إذن بالوصول. يرجى إضافة البوت إلى القناة أولاً.`,
        };
      }
      return {
        ok: false,
        isAdmin: false,
        error: `تعذر الوصول إلى القناة (${chatId}): ${desc || "تأكد من وجود البوت داخل القناة"}`,
      };
    }

    // 2. Check administrators in the channel to confirm bot admin status
    const adminsRes = await fetch(
      `https://api.telegram.org/bot${token}/getChatAdministrators?chat_id=${encodeURIComponent(chatId)}`,
      { signal: controller.signal }
    );
    const adminsData: any = await adminsRes.json().catch(() => ({ ok: false }));
    clearTimeout(timeout);

    if (!adminsData.ok) {
      return {
        ok: false,
        isAdmin: false,
        error: `البوت ليس مشرفاً (Administrator) في القناة (${chatId}). يجب ترقية البوت إلى مشرف لكي يتمكن من التحقق من انضمام الأعضاء.`,
      };
    }

    // Check if bot is among administrators
    const botId = parseInt(token.split(":")[0]);
    if (Array.isArray(adminsData.result) && !isNaN(botId)) {
      const isBotAdmin = adminsData.result.some((adm: any) => adm.user?.id === botId || adm.user?.is_bot);
      if (!isBotAdmin) {
        return {
          ok: false,
          isAdmin: false,
          error: `البوت ليس مشرفاً (Administrator) في القناة (${chatId}). يرجى ترقية البوت إلى مشرف.`,
        };
      }
    }

    // Extract photo if available
    let photoUrl: string | null = null;
    if (chatData.result?.photo?.big_file_id) {
      try {
        const fileRes = await fetch(
          `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(chatData.result.photo.big_file_id)}`
        );
        const fileData: any = await fileRes.json().catch(() => null);
        if (fileData?.ok && fileData.result?.file_path) {
          photoUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
        }
      } catch {
        // ignore photo fetch failure
      }
    }

    const resolvedChatId = String(chatData.result?.id || chatId);
    const resolvedUsername = chatData.result?.username ? String(chatData.result.username).replace(/^@/, "") : null;

    return {
      ok: true,
      isAdmin: true,
      chatId: resolvedChatId,
      username: resolvedUsername,
      title: chatData.result?.title,
      photoUrl,
    };
  } catch (err: any) {
    logger.error({ err, channelInput }, "checkBotChannelAdmin failed");
    return {
      ok: false,
      isAdmin: false,
      error: "حدث خطأ أو انقضت المهلة أثناء الاتصال بـ Telegram API للتحقق من القناة",
    };
  }
}

export interface UserMembershipResult {
  isMember: boolean;
  status?: string;
  error?: string;
}

/**
 * Server-side verification: Checks whether a Telegram user is a member of the channel.
 */
export async function verifyUserChannelMembership(
  userId: number,
  channelInput: string
): Promise<UserMembershipResult> {
  const token = getBotToken();
  if (!token) {
    return {
      isMember: false,
      error: "Telegram Bot Token is not configured on the server",
    };
  }

  const chatId = normalizeChatId(channelInput);
  if (!chatId) {
    return {
      isMember: false,
      error: "معرّف القناة غير صالح",
    };
  }

  // If chatId is an invite link slug without numeric id (+xyz or joinchat), getChatMember cannot query invite hashes directly
  if (chatId.startsWith("+") || chatId.toLowerCase().startsWith("joinchat")) {
    return {
      isMember: false,
      error: "البوت ليس مشرفاً في القناة للتحقق من العضوية. يرجى التواصل مع الإدارة.",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      `https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(userId)}`,
      { signal: controller.signal }
    );
    const data: any = await res.json().catch(() => ({ ok: false }));
    clearTimeout(timeout);

    if (data.ok && data.result) {
      const status = data.result.status;
      const isMemberStatus =
        status === "creator" ||
        status === "administrator" ||
        status === "member" ||
        (status === "restricted" && data.result.is_member !== false);

      if (isMemberStatus) {
        return { isMember: true, status };
      } else if (status === "kicked") {
        return {
          isMember: false,
          status: "kicked",
          error: "تم رفض الطلب: حسابك محظور من هذه القناة.",
        };
      } else {
        return {
          isMember: false,
          status: status || "left",
          error: "لم يتم العثور على اشتراكك في القناة. يرجى الانضمام إلى القناة أولاً ثم الضغط على استلام الهدية.",
        };
      }
    }

    // Handle Telegram API errors
    const desc = data.description || "";
    if (
      desc.includes("bot is not a member") ||
      desc.includes("member list is inaccessible") ||
      desc.includes("need administrator rights")
    ) {
      return {
        isMember: false,
        error: "البوت ليس مشرفاً في القناة ولا يستطيع التحقق من انضمام الأعضاء حالياً. يرجى إبلاغ الإدارة.",
      };
    }

    if (desc.includes("chat not found")) {
      return {
        isMember: false,
        error: "القناة غير موجودة أو تم تغيير معرّفها. يرجى إبلاغ الإدارة.",
      };
    }

    if (desc.includes("USER_NOT_PARTICIPANT") || desc.includes("user not found")) {
      return {
        isMember: false,
        status: "left",
        error: "لم يتم العثور على اشتراكك في القناة. يرجى الانضمام إلى القناة أولاً ثم الضغط على استلام الهدية.",
      };
    }

    return {
      isMember: false,
      error: desc ? `فشل التحقق: ${desc}` : "فشل التحقق من عضوية القناة",
    };
  } catch (err: any) {
    logger.error({ err, userId, channelInput }, "verifyUserChannelMembership error");
    return {
      isMember: false,
      error: "تعذر الاتصال بتليجرام للتحقق من العضوية حالياً. يرجى المحاولة بعد قليل.",
    };
  }
}
