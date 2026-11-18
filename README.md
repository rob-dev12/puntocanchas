# PuntoReservas

Aplicación para descubrir canchas, reservar horarios y gestionar tus reservas deportivas. El proyecto conserva la app Android original y suma una versión web con React, TypeScript y Supabase.

## Ejecutar la versión web

Requisitos: Node.js 20.19+ o 22.12+. No necesita instalación global ni permisos de administrador.

```powershell
npm.cmd install
npm.cmd run dev
```

Abre la dirección local que muestra Vite. El selector inicial permite elegir los deportes soportados. Solo en desarrollo y sin Supabase aparece un catálogo de prueba local para recorrer el pathway: incluye una comuna de referencia con código geográfico por cada región y recintos de Fútbol, Pádel y Tenis. Su disponibilidad, precios y simulación de pago no son reales y no generan reservas ni cobros. En producción, el catálogo y la disponibilidad requieren datos remotos.

Para comprobar la compilación de producción:

```powershell
npm.cmd run build
```

## Conectar Supabase

1. Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en el entorno local de Vite. Nunca pongas la clave `service_role` en el frontend.
2. Aplica las migraciones existentes en orden, incluidas `20261117150000_reservation_schema.sql`, `20261117151000_reservation_transactions.sql`, `20261117152000_reservation_followups.sql`, `20261117153000_individual_payment_links.sql` y `20261118133000_slot_total_pricing.sql`. Son aditivas; no reemplazan las tablas heredadas.
3. Publica las funciones `sport-actions`, `get-availability`, `create-reservation-checkout`, `mp-webhook`, `manage-reservation` y `manage-venue`. `mp-webhook` debe desplegarse sin verificación JWT; `supabase/config.toml` define esta excepción.
4. Configura en Supabase Secrets `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `APP_URL`, `RESERVATION_CODE_PEPPER`, `APIKEY_BREVO` y `BREVO_FROM_MAIL`, además de los secretos de Supabase que la plataforma proporciona. Usa un valor aleatorio y único para el pepper, consérvalo para no invalidar códigos existentes y nunca lo publiques ni lo expongas al cliente.
5. Habilita Anonymous Sign-Ins para el flujo público de reservas y crea cuentas Auth para propietarios. Un administrador debe asignar sus `user_id` a los recintos en `venue_memberships`.
6. Reinicia Vite después de configurar el entorno.

La ruta de reserva consulta las canchas activas y sus horarios de apertura, duración, cupos y precio total por bloque desde `courts`. Ese total se distribuye entre los participantes; cada uno recibe una preferencia de Mercado Pago por su aporte y la reserva inicial se confirma solo cuando se aprueban todos los aportes. La columna heredada `price_per_player` se conserva por compatibilidad, pero ya no determina el precio de las nuevas reservas. La disponibilidad se calcula por cancha y fecha en una Edge Function; la retención del horario y su exclusión ante traslapes se aplican transaccionalmente en PostgreSQL. El webhook verificado, no el retorno del navegador, actualiza pagos y estados. La gestión por código usa códigos aleatorios, hash con pepper, cifrado recuperable y limitación de intentos.

Los propietarios pueden crear, actualizar y desactivar canchas, configurar precios/cupos/horarios, editar políticas y revisar solicitudes de cancelación desde el panel. Las cuentas Auth deben existir previamente y un administrador debe asignarlas a cada recinto en `venue_memberships`. Aprobar o rechazar una solicitud registra una decisión administrativa; no ejecuta automáticamente un reembolso en Mercado Pago. Tampoco se automatiza el reembolso si vence una retención después de que solo algunos participantes hayan pagado; ese caso requiere revisión operativa.

Las migraciones y funciones nuevas deben desplegarse y validarse en el proyecto Supabase antes de que el flujo sea operativo. El RPC heredado `book_court` y las tablas anteriores se conservan; el nuevo recorrido no lo invoca ni descuenta `wallet_balance`.

## App Android

El proyecto Android Compose existente continúa disponible en `app/` y se puede abrir desde Android Studio. El archivo `.env.example` conserva también el espacio `GEMINI_API_KEY` para ese proyecto.
