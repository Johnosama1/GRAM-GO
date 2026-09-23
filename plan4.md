The plan is clear. I need to modify the file `artifacts/api-server/src/routes/withdrawals.ts`.
When the withdrawal request is created, it currently sends a pending message to the user.
I need to forward this EXACT message to the channel defined in the environment (which is normally `@GramGOwithdrawal`).

Let's look at `withdrawals.ts`:
```typescript
<<<<<<< SEARCH
  // Send message to user that request was received
  try {
    const bot = getBot();
    if (bot) {
      await bot.sendMessage(
        numUserId,
        `⏳ <b>طلب سحب قيد المراجعة</b>\n\n` +
          `💰 المبلغ: <b>${amt.toFixed(4)} Gram</b>\n` +
          `📍 المحفظة: <code>${esc(cleanAddress)}</code>\n\n` +
          `تم استلام طلب السحب بنجاح وسيتم معالجته قريباً.`,
        { parse_mode: "HTML" }
      );
    }
  } catch {
    /* ignore */
  }
=======
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

      const targetChannel = "@GramGOwithdrawal";
      try {
        const forwarded = await bot.forwardMessage(targetChannel, numUserId, sentMsg.message_id);

        await db.update(withdrawalsTable)
          .set({ channelMessageId: forwarded.message_id })
          .where(eq(withdrawalsTable.id, wdRecord.id));

        logger.info({
          targetChannel,
          originalChatId: numUserId,
          originalMessageId: sentMsg.message_id,
          forwardedMessageId: forwarded.message_id
        }, "Successfully forwarded withdrawal message to channel");
      } catch (fwdErr) {
        logger.error({
          err: fwdErr instanceof Error ? fwdErr.message : String(fwdErr),
          targetChannel,
          originalChatId: numUserId,
          originalMessageId: sentMsg.message_id,
        }, "Telegram API error while forwarding withdrawal message");
      }
    }
  } catch (err) {
    /* ignore */
  }
>>>>>>> REPLACE
```

Wait, `db` and `withdrawalsTable` are already imported in `withdrawals.ts`. Let me check imports in `withdrawals.ts`.
