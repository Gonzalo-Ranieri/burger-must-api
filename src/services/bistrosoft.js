/**
 * bistrosoft.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integración con la API de Bistrosoft.
 *
 * ESTADO: en espera de credenciales del cliente.
 * Cuando Shami entregue la API Key y la documentación, completar:
 *   - BISTROSOFT_API_URL  en .env
 *   - BISTROSOFT_API_KEY  en .env
 *   - Los métodos marcados con TODO abajo
 *
 * Flujo esperado (a confirmar con la doc de Bistrosoft):
 *   1. Nuestro sistema recibe un pedido → lo envía a Bistrosoft para que
 *      quede registrado en su punto de venta (KDS / Bistro Cocina).
 *   2. Bistrosoft puede devolver el estado del pedido vía webhook.
 *   3. Opcionalmente: sincronizar productos y precios desde Bistrosoft
 *      hacia nuestra base de datos.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BASE_URL = process.env.BISTROSOFT_API_URL;   // ej: https://api.bistrosoft.com/v1
const API_KEY  = process.env.BISTROSOFT_API_KEY;

function isEnabled() {
  return !!(BASE_URL && API_KEY);
}

async function request(method, path, body) {
  if (!isEnabled()) {
    console.warn('[bistrosoft] Integración desactivada — faltan variables de entorno.');
    return null;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${API_KEY}`,   // TODO: confirmar esquema de auth con Bistrosoft
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[bistrosoft] ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Envía un pedido a Bistrosoft para que quede registrado en el punto de venta.
 * Se llama desde pedidos.controller.js después de confirmar el pedido.
 *
 * @param {Object} pedido - pedido completo con items desde nuestra DB
 * @returns {Object|null} respuesta de Bistrosoft, o null si está desactivado
 */
export async function enviarPedido(pedido) {
  if (!isEnabled()) return null;

  // TODO: mapear nuestro modelo de pedido al formato que espera Bistrosoft.
  // Completar cuando llegue la documentación.
  const payload = {
    external_id:  pedido.id,
    numero:       pedido.numero,
    origen:       'web',                        // TODO: confirmar valor con Bistrosoft
    modo_entrega: pedido.modo_entrega,
    modo_pago:    pedido.modo_pago,
    total:        pedido.total,
    items: pedido.items.map(i => ({
      nombre:   i.nombre,
      cantidad: i.cantidad,
      precio:   i.precio_unit,
    })),
  };

  try {
    // TODO: confirmar el endpoint correcto con la doc de Bistrosoft
    const resultado = await request('POST', '/pedidos', payload);
    console.log(`[bistrosoft] Pedido ${pedido.numero} enviado →`, resultado);
    return resultado;
  } catch (err) {
    // No cortamos el flujo si Bistrosoft falla — el pedido ya está en nuestra DB
    console.error('[bistrosoft] Error al enviar pedido:', err.message);
    return null;
  }
}

/**
 * Obtiene el catálogo de productos desde Bistrosoft.
 * Útil para sincronizar precios si el cliente gestiona su menú desde Bistrosoft.
 *
 * @returns {Array|null}
 */
export async function obtenerProductos() {
  if (!isEnabled()) return null;
  try {
    // TODO: confirmar endpoint con la doc de Bistrosoft
    return await request('GET', '/productos');
  } catch (err) {
    console.error('[bistrosoft] Error al obtener productos:', err.message);
    return null;
  }
}

/**
 * Verifica que la conexión con Bistrosoft funciona.
 * Usar en el health check del backend.
 *
 * @returns {{ ok: boolean, message: string }}
 */
export async function healthCheck() {
  if (!isEnabled()) {
    return { ok: false, message: 'Integración desactivada — faltan BISTROSOFT_API_URL y BISTROSOFT_API_KEY' };
  }
  try {
    // TODO: confirmar endpoint de ping con la doc de Bistrosoft
    await request('GET', '/ping');
    return { ok: true, message: 'Conectado a Bistrosoft' };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

export default { enviarPedido, obtenerProductos, healthCheck, isEnabled };
