Let's see if the user meant to replace `withdrawals.ts` message with a custom emoji message. I will just forward the exact message sent to the user.
Wait, let's look at `withdrawals.ts` again.

```typescript
  // Send message to user that request was received
  try {
    const bot = getBot();
    if (bot) {
      const sentMsg = await bot.sendMessage(
        numUserId,
        `⏳ <b>طلب سحب قيد المراجعة</b>\n\n` +
          `💰 المبلغ: <b>${amt.toFixed(4)} Gram</b>\n` +
          `📍 المحفظة: <code>${esc(cleanAddress)}</code>\n\n` +
          `تم استلام طلب السحب بنجاح وسيتم معالجته قريباً.`,
        { parse_mode: "HTML" }
      );

      try {
        const forwarded = await bot.forwardMessage("@GramGOwithdrawal", numUserId, sentMsg.message_id);
        await db.update(withdrawalsTable)
          .set({ channelMessageId: forwarded.message_id })
          .where(eq(withdrawalsTable.id, wdRecord.id));
        logger.info({
          targetChannel: "@GramGOwithdrawal",
          originalChatId: numUserId,
          originalMessageId: sentMsg.message_id,
          forwardedMessageId: forwarded.message_id
        }, "Successfully forwarded withdrawal message to channel");
      } catch (fwdErr) {
        logger.error({
          err: fwdErr instanceof Error ? fwdErr.message : String(fwdErr),
          targetChannel: "@GramGOwithdrawal",
          originalChatId: numUserId,
          originalMessageId: sentMsg.message_id,
        }, "Telegram API error while forwarding withdrawal message");
      }
    }
  } catch (err) {
    /* ignore sending to user errors, or log them? */
  }
```

Wait, if the user requested a specific message with custom emojis, maybe I should format the pending message similarly to the success message?
I will just forward whatever is being sent. But wait, what if they meant they *already* added custom emojis, and because `copyMessage` strips them or something they were using `copyMessage` before? Wait, the current code doesn't use `copyMessage`. It uses `forwardMessage` in `withdrawalProcessor.ts`, but in `withdrawals.ts` it doesn't forward at all.
Wait! I should check `api-server/src/bot/index.ts` or somewhere else where withdrawal callback might be handled.
Is there any other place where withdrawal is CREATED?
What about the Telegram bot `/withdraw` command?
```typescript
artifacts/api-server/src/bot/index.ts:1257:    /^\/withdraw(als)?$/,
```
Let's see what that does.
It says `MOCKUP` or something?
