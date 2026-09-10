/**
 * BAIA Cafe — Delivery Zones & Fee Config (single source of truth)
 *
 * Adding a new zone later = adding one object to `zones`. No logic changes needed.
 * - `coveragePolygon` stays empty until each zone boundary is traced (needed only
 *   for the optional pin-drop map). Format when filled: [[lat, lng], ...].
 * - feeSchedule: fee = baseFee + incrementFee * ceil(max(0, items - includedItems) / incrementBlock)
 *   with optional maxFee cap.
 */

export const DELIVERY_MIN_DIRECTIONS_LENGTH = 10;

export const deliveryConfig = {
  zones: [
    {
      id: 'laurente',
      name: 'Laurente',
      fullName: 'Laurente',
      landmarks: [
        'Atlaza Resort',
        'BAIA Café',
        'PLWM Burias Church (Sitio Bocal)'
      ],
      coveragePolygon: [],
      feeSchedule: { baseFee: 20, includedItems: 4, incrementFee: 20, incrementBlock: 4, maxFee: 40 }
    },
    {
      id: 'bolod',
      name: 'Bolod',
      fullName: 'Bolod',
      landmarks: [
        'Barangay Nazareno–Bolod Boundary Marker',
        'NJJL General Merchandise',
        'Bolod Barangay Hall / Community Center',
        'San Pascual National High School (Main)',
        'San Pascual Central School',
        'San Pascual Municipal Hall & Town Plaza',
        'St. Paschal Baylon Parish Church'
      ],
      coveragePolygon: [],
      feeSchedule: { baseFee: 120, includedItems: 8, incrementFee: 60, incrementBlock: 8 }
    },
    {
      id: 'pantalan',
      name: 'Pantalan',
      fullName: 'Pantalan',
      landmarks: [
        'San Pascual Public Market (Pamilihan)',
        'LGU Tourism Office',
        'Sunset View Tourist Hotel / Port Lodges',
        'San Pascual Port / Pantalan'
      ],
      coveragePolygon: [],
      feeSchedule: { baseFee: 120, includedItems: 8, incrementFee: 60, incrementBlock: 8 }
    }
  ],
  batching: {
    windowMinutes: 30,
    mode: 'customer-choice-batch-or-standard',
    // Batch delivery costs this fraction of the standard tier fee.
    batchDiscount: 0.5,
    // Zones where customers may choose batch delivery (half price, shared trip).
    batchZones: ['bolod', 'pantalan']
  }
};

export function getDeliveryZone(zoneId) {
  if (!zoneId) return null;
  return deliveryConfig.zones.find((z) => z.id === zoneId) || null;
}

export function getZoneLandmarks(zoneId) {
  return getDeliveryZone(zoneId)?.landmarks || [];
}

/**
 * Fee from Zone + item count (customer's own cart only — never cross-customer).
 * Pass { batched: true } for batch delivery (half price, batch-eligible zones only).
 * Returns 0 when zone is unknown/unselected (fee hidden until zone is picked).
 */
export function calculateDeliveryFee(zoneId, itemCount, options = {}) {
  const zone = getDeliveryZone(zoneId);
  if (!zone) return 0;
  const count = Math.max(0, Math.floor(Number(itemCount) || 0));
  if (count <= 0) return 0;
  const { baseFee, includedItems, incrementFee, incrementBlock, maxFee } = zone.feeSchedule;
  const extra = Math.max(0, count - includedItems);
  let fee = baseFee + incrementFee * Math.ceil(extra / incrementBlock);
  if (typeof maxFee === 'number') fee = Math.min(fee, maxFee);
  if (options.batched && isBatchEligible(zoneId)) {
    fee = Math.round(fee * deliveryConfig.batching.batchDiscount);
  }
  return fee;
}

/** Batch delivery (half price, shared trip) is offered in these zones only. */
export function isBatchEligible(zoneId) {
  return deliveryConfig.batching.batchZones.includes(zoneId);
}

/**
 * Delivery Details validation: Zone → Landmark (when the zone lists any) →
 * Directions length → Speed choice (Standard/Batch, required in batch zones).
 * Returns { valid, error } — error is a human-readable message for toasts.
 */
export function validateDeliveryDetails({ zoneId, landmark, directions, speed }) {
  const zone = getDeliveryZone(zoneId);
  if (!zone) {
    return { valid: false, error: 'Please select a delivery zone.' };
  }
  if (zone.landmarks.length > 0) {
    if (!landmark || !zone.landmarks.includes(landmark)) {
      return { valid: false, error: `Please choose a landmark in ${zone.name}.` };
    }
  }
  const text = (directions || '').trim();
  if (text.length < DELIVERY_MIN_DIRECTIONS_LENGTH) {
    return {
      valid: false,
      error: `Please add delivery directions (at least ${DELIVERY_MIN_DIRECTIONS_LENGTH} characters) so the rider can find you.`
    };
  }
  if (isBatchEligible(zoneId) && speed !== 'standard' && speed !== 'batch') {
    return { valid: false, error: 'Please choose Standard or Batch delivery.' };
  }
  return { valid: true, error: '' };
}

export function getSpeedLabel(speed) {
  return speed === 'batch' ? 'Batch (half price)' : 'Standard';
}

/**
 * What the customer sees after sending: sets dispatch expectations per speed.
 * - Standard: rider on the road ~30 minutes after the order is sent.
 * - Batch: order waits and goes out with the next order to the same area.
 */
export function getDeliverySpeedNote(zoneName, speed) {
  if (speed === 'batch') {
    return `You've chosen batch delivery — half the fee. Your order goes on the road with the next order to ${zoneName}, whether that's another batch or a standard delivery.`;
  }
  const mins = deliveryConfig.batching.windowMinutes;
  return `Standard delivery — the rider will be on the road about ${mins} minutes after your order is sent.`;
}

export function getBatchingNote(zoneName, speed = 'standard') {
  return getDeliverySpeedNote(zoneName, speed);
}

/**
 * Optional pin-drop coverage check (only meaningful once polygons are traced).
 * Returns { checked, inside, message }. When no polygon exists, { checked: false }
 * so callers treat landmark + directions as sufficient.
 */
export function checkPinInZone(zoneId, lat, lng) {
  const zone = getDeliveryZone(zoneId);
  if (!zone || !Array.isArray(zone.coveragePolygon) || zone.coveragePolygon.length < 3) {
    return { checked: false, inside: true, message: '' };
  }
  // Ray-casting point-in-polygon. Polygon points are [lat, lng]; test point is (x=lng, y=lat).
  const poly = zone.coveragePolygon;
  const x = lng;
  const y = lat;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0];
    const xi = poly[i][1];
    const yj = poly[j][0];
    const xj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return {
    checked: true,
    inside,
    message: inside
      ? ''
      : `This spot doesn't look like it's in ${zone.name}. Please double check your zone selection or adjust the pin.`
  };
}
