import { logger } from '../logger.js';
import { telegramConfig } from '../config.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendTelegramHtmlMessage(html: string): Promise<boolean> {
  const { botToken, chatId } = telegramConfig;
  if (!botToken || !chatId) {
    logger.warn('[telegram] skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_LANDMARK_REQUESTS_CHAT_ID not set');
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html.slice(0, 4000),
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn('[telegram] sendMessage failed', res.status, body.slice(0, 400));
      return false;
    }
    return true;
  } catch (e) {
    logger.warn('[telegram] sendMessage error', e instanceof Error ? e.message : e);
    return false;
  }
}

export function formatLandmarkStoryRequestTelegram(params: {
  requestRef: string;
  language: string | null;
  userEmail: string | null;
  userId: string | null;
  scanLatitude: number | null;
  scanLongitude: number | null;
  attachedLatitude: number | null;
  attachedLongitude: number | null;
  visionHintTitle: string | null;
  hasPhoto: boolean;
}): string {
  const lat = params.attachedLatitude ?? params.scanLatitude;
  const lng = params.attachedLongitude ?? params.scanLongitude;
  const mapUrl =
    lat != null && lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`
      : null;

  const lines = [
    '🆕 <b>Заявка на нову локацію</b> (3D Scanner)',
    '',
    `<b>Ref:</b> ${escapeHtml(params.requestRef)}`,
  ];

  if (lat != null && lng != null) {
    lines.push(`<b>Координати:</b> ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    if (mapUrl) {
      lines.push(`<a href="${escapeHtml(mapUrl)}">Відкрити на карті</a>`);
    }
  } else {
    lines.push('<b>Координати:</b> не передано');
  }

  if (params.userEmail) {
    lines.push(`<b>Email:</b> ${escapeHtml(params.userEmail)}`);
  }
  if (params.userId) {
    lines.push(`<b>User ID:</b> <code>${escapeHtml(params.userId)}</code>`);
  }
  if (params.language) {
    lines.push(`<b>Мова:</b> ${escapeHtml(params.language)}`);
  }
  lines.push(`<b>Фото:</b> ${params.hasPhoto ? 'так' : 'ні'}`);
  if (params.visionHintTitle) {
    lines.push(`<b>Підказка:</b> ${escapeHtml(params.visionHintTitle)}`);
  }

  return lines.join('\n');
}
