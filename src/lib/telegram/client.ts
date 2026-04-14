const TELEGRAM_API = "https://api.telegram.org/bot";

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("Telegram credentials not configured");
    return false;
  }

  // Telegram has a 4096 character limit
  const truncated = text.length > 4000 ? text.substring(0, 3997) + "..." : text;

  try {
    const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: truncated,
        parse_mode: "MarkdownV2",
      }),
    });

    if (!response.ok) {
      // Retry with plain text if MarkdownV2 fails
      const retry = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: truncated.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, ""),
          parse_mode: undefined,
        }),
      });
      return retry.ok;
    }

    return true;
  } catch (error) {
    console.error("Failed to send Telegram message:", error);
    return false;
  }
}
