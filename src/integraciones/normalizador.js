/**
 * normalizador.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Convierte el payload crudo de cada plataforma al modelo interno de pedido.
 *
 * Modelo interno esperado por pedidos.controller → createPedidoInterno():
 * {
 *   origen:         string   — 'rappi' | 'pedidosya' | 'mercadolibre' | 'ifood' | ...
 *   origen_id:      string   — ID del pedido en la plataforma
 *   nombre_cliente: string
 *   modo_entrega:   'takeaway' | 'delivery'
 *   modo_pago:      'efectivo' | 'online' | 'posnet'
 *   mp_status:      'approved' | null  — las apps cobran ellas, así que llega aprobado
 *   notas:          string | null
 *   items: [{ nombre, cantidad, precio_unit }]
 *   total:          number
 * }
 *
 * Cada adaptador recibe el payload raw y devuelve el modelo interno.
 * Si no puede normalizarlo lanza un Error descriptivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ── RAPPI ─────────────────────────────────────────────────────────────────
 * TODO: completar cuando Rappi entregue la documentación del webhook.
 * Estructura esperada (tentativa según docs públicas de Rappi):
 * {
 *   order: { id, status, payment_method, delivery_type, customer: { name },
 *            products: [{ name, quantity, price }], total_price }
 * }
 */
function rappi(payload) {
  const o = payload.order ?? payload;
  if (!o?.id) throw new Error('[rappi] payload sin order.id');
  return {
    origen:         'rappi',
    origen_id:      String(o.id),
    nombre_cliente: o.customer?.name ?? 'Cliente Rappi',
    modo_entrega:   o.delivery_type === 'pickup' ? 'takeaway' : 'delivery',
    modo_pago:      'online',
    mp_status:      'approved',   // Rappi ya cobró
    notas:          o.special_instructions ?? null,
    items: (o.products ?? o.items ?? []).map(i => ({
      nombre:     i.name ?? i.nombre,
      cantidad:   i.quantity ?? i.cantidad ?? 1,
      precio_unit:Math.round((i.price ?? i.precio_unit ?? 0) * 100) / 100,
    })),
    total: Math.round((o.total_price ?? o.total ?? 0) * 100) / 100,
  };
}

/* ── PEDIDOSYA ─────────────────────────────────────────────────────────────
 * TODO: completar con la doc oficial de PedidosYa.
 * Estructura esperada (tentativa):
 * {
 *   id, registeredDate, deliveryMethod, payment: { type },
 *   customer: { name }, notes,
 *   details: [{ name, quantity, unitPrice }], totalAmount
 * }
 */
function pedidosya(payload) {
  if (!payload?.id) throw new Error('[pedidosya] payload sin id');
  return {
    origen:         'pedidosya',
    origen_id:      String(payload.id),
    nombre_cliente: payload.customer?.name ?? 'Cliente PedidosYa',
    modo_entrega:   payload.deliveryMethod === 'PICKUP' ? 'takeaway' : 'delivery',
    modo_pago:      'online',
    mp_status:      'approved',
    notas:          payload.notes ?? null,
    items: (payload.details ?? []).map(i => ({
      nombre:     i.name,
      cantidad:   i.quantity,
      precio_unit:Math.round((i.unitPrice ?? 0) * 100) / 100,
    })),
    total: Math.round((payload.totalAmount ?? 0) * 100) / 100,
  };
}

/* ── MERCADOLIBRE FOODS ────────────────────────────────────────────────────
 * TODO: completar cuando ML entregue acceso a la API.
 * La estructura de ML Foods aún no está documentada públicamente.
 */
function mercadolibre(payload) {
  if (!payload?.id) throw new Error('[mercadolibre] payload sin id');
  return {
    origen:         'mercadolibre',
    origen_id:      String(payload.id),
    nombre_cliente: payload.buyer?.nickname ?? 'Cliente MercadoLibre',
    modo_entrega:   payload.shipping?.type === 'self_service' ? 'takeaway' : 'delivery',
    modo_pago:      'online',
    mp_status:      'approved',
    notas:          null,
    items: (payload.order_items ?? []).map(i => ({
      nombre:     i.item?.title ?? i.title,
      cantidad:   i.quantity,
      precio_unit:Math.round((i.unit_price ?? 0) * 100) / 100,
    })),
    total: Math.round((payload.total_amount ?? 0) * 100) / 100,
  };
}

/* ── IFOOD ─────────────────────────────────────────────────────────────────
 * TODO: completar con la API de iFood cuando se contrate.
 */
function ifood(payload) {
  if (!payload?.id) throw new Error('[ifood] payload sin id');
  return {
    origen:         'ifood',
    origen_id:      String(payload.id),
    nombre_cliente: payload.customer?.name ?? 'Cliente iFood',
    modo_entrega:   payload.deliveryMethod === 'TAKEOUT' ? 'takeaway' : 'delivery',
    modo_pago:      'online',
    mp_status:      'approved',
    notas:          payload.observations ?? null,
    items: (payload.items ?? []).map(i => ({
      nombre:     i.name,
      cantidad:   i.quantity,
      precio_unit:Math.round((i.unitPrice ?? 0) * 100) / 100,
    })),
    total: Math.round((payload.totalPrice ?? 0) * 100) / 100,
  };
}

/* ── MAPA DE ADAPTADORES ───────────────────────────────────────────────── */
const ADAPTADORES = { rappi, pedidosya, mercadolibre, ifood };

/**
 * Normaliza el payload de una plataforma al modelo interno.
 * @param {string} origen — nombre de la plataforma (debe existir en ADAPTADORES)
 * @param {object} payload — body del webhook tal como llegó
 * @returns {object} pedido normalizado
 */
export function normalizar(origen, payload) {
  const fn = ADAPTADORES[origen];
  if (!fn) throw new Error(`Integración "${origen}" no soportada todavía`);
  return fn(payload);
}

export const ORIGENES_SOPORTADOS = Object.keys(ADAPTADORES);
