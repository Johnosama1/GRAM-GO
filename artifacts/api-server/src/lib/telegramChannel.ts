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

  // URL extraction
  const urlMatch = trimmed.match(/t\.me\/([A-Za-z0-9_+-]+)/);
  if (urlMatch) {
    const username = urlMatch[1].replace(/^@/, "");
    return `@${username}`;
  }

  // Numeric Chat ID (e.g. -1001234567890)
  if (trimmed.startsWith("-100") || (trimmed.startsWith("-") && /^-?\d+$/.test(trimmed))) {
    return trimmed;
  }

  // Username
  const clean = trimmed.replace(/^@/, "");
  return `@${clean}`;
}

export interface BotAdminCheckResult {
  ok: boolean;
  isAdmin: boolean;
  chatId?: string;
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
      error: "Invalid channel identifier",
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
          error: `Channel (${chatId}) not found or the link is invalid`,
        };
      }
      return {
        ok: false,
        isAdmin: false,
        error: `Bot cannot access channel (${chatId}). Please add GRAM GO bot as an administrator in the channel first.`,
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
        error: `Bot is not an administrator in channel (${chatId}). Please promote the bot to Administrator.`,
      };
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

    return {
      ok: true,
      isAdmin: true,
      chatId: String(chatData.result?.id || chatId),
      title: chatData.result?.title,
      photoUrl,
    };
  } catch (err: any) {
    logger.error({ err, channelInput }, "checkBotChannelAdmin failed");
    return {
      ok: false,
      isAdmin: false,
      error: "An error or timeout occurred while verifying channel with Telegram",
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
      error: "Invalid channel identifier",
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
      } else {
        return {
          isMember: false,
          status,
          error: "Please join the channel first, then tap verify",
        };
      }
    }

    // Handle Telegram API errors
    const desc = data.description || "";
    if (
      desc.includes("bot is not a member") ||
      desc.includes("member list is inaccessible") ||
      desc.includes("need administrator rights") ||
      desc.includes("chat not found")
    ) {
      return {
        isMember: false,
        error: "The bot is not an administrator in this channel to verify membership. Please contact administration.",
      };
    }

    if (desc.includes("USER_NOT_PARTICIPANT") || desc.includes("user not found")) {
      return {
        isMember: false,
        error: "Please join the channel first, then tap verify",
      };
    }

    return {
      isMember: false,
      error: desc || "Failed to verify channel membership",
    };
  } catch (err: any) {
    logger.error({ err, userId, channelInput }, "verifyUserChannelMembership error");
    return {
      isMember: false,
      error: "Unable to connect to Telegram to verify membership right now. Please try again later.",
    };
  }
}
