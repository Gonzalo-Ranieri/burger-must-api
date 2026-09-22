# Burger Must API

Backend REST para el sistema de gestión de Burger Must Selection.
Sistema propio completo — sin dependencias de terceros para la gestión central.

## Stack

Node.js · Express · PostgreSQL (Supabase) · JWT · MercadoPago

## Módulos

| Módulo | Descripción |
|---|---|
| Auth | Login con JWT, roles: cliente / admin / cocina |
| Menú | CRUD de productos y categorías |
| Pedidos | Toma de pedidos, estados, historial |
| Pagos | MercadoPago Checkout Pro + webhooks |
| Finanzas | KPIs, ventas por categoría, histórico |
| Caja | Apertura/cierre de caja, movimientos manuales |
| Stock | Control de insumos, alertas de stock crítico |

## Endpoints

### Auth
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | — | Login, devuelve JWT |
| POST | `/api/auth/register` | admin | Crear usuario |
| GET | `/api/auth/me` | cualquier rol | Usuario logueado |

### Menú
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/menu` | — | Menú público activo |
| GET | `/api/menu/all` | admin | Todos los productos |
| POST | `/api/menu` | admin | Crear producto |
| PATCH | `/api/menu/:id` | admin | Editar producto |
| DELETE | `/api/menu/:id` | admin | Desactivar producto |

### Pedidos
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/pedidos` | — | Crear pedido |
| GET | `/api/pedidos` | admin, cocina | Listar pedidos |
| GET | `/api/pedidos/:id` | admin, cocina | Detalle |
| PATCH | `/api/pedidos/:id/estado` | admin, cocina | Cambiar estado |

### Pagos
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/pagos/preference` | — | Crear preference MP |
| POST | `/api/pagos/webhook` | — | Webhook MercadoPago |

### Finanzas
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/finanzas/resumen` | admin | KPIs del día |
| GET | `/api/finanzas/historico` | admin | Histórico de ventas |

### Caja
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/caja` | admin | Sesión activa con movimientos |
| POST | `/api/caja/abrir` | admin | Abrir caja con fondo inicial |
| POST | `/api/caja/cerrar` | admin | Cerrar caja y calcular totales |
| POST | `/api/caja/movimiento` | admin | Ingreso/egreso manual |
| GET | `/api/caja/historial` | admin | Historial de sesiones |

### Stock
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/stock` | admin | Todos los insumos |
| GET | `/api/stock/critico` | admin | Insumos bajo mínimo |
| POST | `/api/stock` | admin | Crear insumo |
| POST | `/api/stock/:id/movimiento` | admin | Entrada/salida/ajuste |
| GET | `/api/stock/:id/historial` | admin | Movimientos del insumo |

## Setup local

```bash
cp .env.example .env   # completar con tus valores
npm install
npm run dev
```

## Base de datos

Ejecutar `sql/schema.sql` en Supabase → SQL Editor.

## Deploy en Railway

1. Conectar este repo en railway.app
2. Cargar las variables del `.env.example`
3. Railway detecta Node.js y usa `npm start` automáticamente
