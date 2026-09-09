# Burger Must API

Backend REST para el sistema de gestión de Burger Must Selection.

## Stack

Node.js · Express · PostgreSQL (Supabase) · JWT · MercadoPago

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/auth/login` | — | Login, devuelve JWT |
| POST | `/api/auth/register` | admin | Crear usuario |
| GET  | `/api/auth/me` | cualquier rol | Datos del usuario logueado |
| GET  | `/api/menu` | — | Menú público activo |
| GET  | `/api/menu/all` | admin | Todos los productos |
| POST | `/api/menu` | admin | Crear producto |
| PATCH | `/api/menu/:id` | admin | Editar producto |
| DELETE | `/api/menu/:id` | admin | Desactivar producto |
| POST | `/api/pedidos` | — | Crear pedido |
| GET  | `/api/pedidos` | admin, cocina | Listar pedidos |
| GET  | `/api/pedidos/:id` | admin, cocina | Detalle de pedido |
| PATCH | `/api/pedidos/:id/estado` | admin, cocina | Cambiar estado |
| POST | `/api/pagos/preference` | — | Crear preference MercadoPago |
| POST | `/api/pagos/webhook` | — | Webhook de MercadoPago |
| GET  | `/api/finanzas/resumen` | admin | KPIs del día |
| GET  | `/api/finanzas/historico` | admin | Histórico de ventas |

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
2. Cargar las variables de entorno del `.env.example`
3. Railway detecta Node.js automáticamente y usa `npm start`
