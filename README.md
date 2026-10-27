# Cancha Reserva

Aplicación para descubrir canchas, reservar horarios, organizar partidos exprés y compartir el costo por jugador. El proyecto conserva la app Android original y suma una versión web con React, TypeScript y Supabase.

## Ejecutar la versión web

Requisitos: Node.js 20.19+ o 22.12+. No necesita instalación global ni permisos de administrador.

```powershell
npm.cmd install
npm.cmd run dev
```

Abre la dirección local que muestra Vite. Si no configuras Supabase, la app inicia en modo demo y guarda las reservas y el monedero en el almacenamiento local del navegador.

Para comprobar la compilación de producción:

```powershell
npm.cmd run build
```

## Conectar Supabase

1. Crea un proyecto de Supabase y habilita **Anonymous Sign-Ins** en Authentication → Providers.
2. Ejecuta `supabase/migrations/20261027000000_initial_schema.sql` desde SQL Editor en el panel de Supabase. Crea el esquema, políticas RLS, canchas y partidos de ejemplo.
3. En Edge Functions, crea `sport-actions` y publica el contenido de `supabase/functions/sport-actions/index.ts`. La función requiere los secretos de proyecto `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`; Supabase los proporciona. Nunca pongas la clave `service_role` en el frontend.
4. Copia `.env.example` a `.env` y completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los datos del proyecto.
5. Reinicia `npm.cmd run dev`.

La app usa el cliente público solo para autenticación y lectura protegida por RLS. Crear reservas, crear o unirse a partidos y recargar el saldo se valida en la Edge Function y se ejecuta en funciones SQL transaccionales. Las políticas no permiten escrituras directas desde el navegador.

La recarga del monedero es una simulación para la experiencia; no integra un procesador ni realiza cobros reales.

## App Android

El proyecto Android Compose existente continúa disponible en `app/` y se puede abrir desde Android Studio. El archivo `.env.example` conserva también el espacio `GEMINI_API_KEY` para ese proyecto.
