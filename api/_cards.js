// Shared physical tap card helpers. A card is either linked to an account (its
// stamps live on the account) or a walk-in card (its stamps live on the card).

const CAFE_TIMEZONE = process.env.CAFE_TIMEZONE || 'Asia/Manila';
const WIFI_VOUCHER_DAILY_CAP = parseInt(process.env.WIFI_VOUCHER_DAILY_CAP || '150', 10);

// The counter reader types UIDs as 10 decimal digits (keep the leading 0)
export function cleanCardUid(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/[:\s-]/g, '').trim().toUpperCase();
}

// Phones read the chip's raw UID in hex (e.g. 0423E413AB12C4). The counter reader
// prints its first 4 bytes as a little-endian number, so convert to match.
export function readerUidFromAny(raw) {
  const clean = cleanCardUid(raw);
  if (/^\d{10}$/.test(clean)) return clean;
  if (/^[0-9A-F]{8}([0-9A-F]{6})?$/.test(clean)) {
    const bytes = clean.slice(0, 8).match(/../g).map((b) => parseInt(b, 16));
    const value = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
    return String(value).padStart(10, '0');
  }
  return '';
}

export function manilaDayBounds(date = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAFE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
  return {
    start: new Date(`${day}T00:00:00+08:00`).toISOString(),
    end: new Date(`${day}T23:59:59.999+08:00`).toISOString()
  };
}

// Restrict a stamps/redemptions query to the rows that belong to this card's holder
export function forHolder(query, card) {
  return card.user_id ? query.eq('user_id', card.user_id) : query.eq('card_id', card.id).is('user_id', null);
}

export async function holderProgress(db, card) {
  const [{ count: stamps }, { count: redemptions }] = await Promise.all([
    forHolder(db.from('stamps').select('*', { count: 'exact', head: true }), card),
    forHolder(db.from('redemptions').select('*', { count: 'exact', head: true }), card)
  ]);
  const totalStamps = stamps || 0;
  return {
    totalStamps,
    cycleProgress: totalStamps % 10,
    pendingRewards: Math.max(0, Math.floor(totalStamps / 10) - (redemptions || 0))
  };
}

export function holderName(card) {
  if (!card.user_id) return 'Walk-in card';
  return card.profiles?.display_name || card.profiles?.email?.split('@')[0] || 'Member';
}

// Same daily pool as the QR claim; a holder gets the same code back all day.
// Staff verified the purchase, so no new-account/IP limits (the IP is the cashier's).
export async function holderWifiVoucher(db, card) {
  try {
    const { data, error } = card.user_id
      ? await db.rpc('claim_next_wifi_voucher_v2', {
          p_user_id: card.user_id,
          p_ip_hash: null,
          p_is_new_account: false,
          p_daily_cap: WIFI_VOUCHER_DAILY_CAP,
          p_new_account_ip_cap: 0
        })
      : await db.rpc('claim_wifi_voucher_for_card', { p_card_id: card.id, p_daily_cap: WIFI_VOUCHER_DAILY_CAP });
    if (error || !data?.length) return null;
    return { code: data[0].voucher_code, durationHours: data[0].duration || 1, deviceLimit: data[0].devices || 2 };
  } catch (err) {
    console.warn('Wi-Fi voucher dispensing non-fatal notice:', err.message);
    return null;
  }
}

export const CARD_SELECT = 'id, user_id, card_uid, status, profiles ( id, display_name, email )';
