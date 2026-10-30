# Estudio Guía

Biblioteca de estudio construida con React, Vite, Bootstrap y Supabase. El sitio puede alojarse en GitHub Pages; iniciar sesión es necesario para acceder a la biblioteca y al RAG privado.

## Desarrollo local

1. Usa Node.js 20 o posterior y pnpm.
2. Copia `.env.example` a `.env.local` y completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Ejecuta `pnpm install` y `pnpm dev`.

La clave del navegador es la clave pública `sb_publishable_…`. No guardes claves `sb_secret_…` ni tokens de Cloudflare en este repositorio.

## GitHub Pages

El workflow de `.github/workflows/pages.yml` compila el proyecto al publicar cambios en `master`. En **Settings → Secrets and variables → Actions → Variables** crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`; luego configura **Settings → Pages → Build and deployment → GitHub Actions**.

El código del cliente será público. Los apuntes y archivos siguen protegidos por la autenticación, RLS y el bucket privado de Supabase. Para registro y confirmación de correo desde Pages, configura en Supabase Auth la URL del sitio y una URL permitida para `https://wilberquinto455.github.io/mi-cuaderno-estudio/`.

## Supabase

- El esquema inicial y el índice RAG están en [`supabase/README.md`](supabase/README.md).
- La Edge Function `study-rag` mantiene las claves de Cloudflare en secretos de Supabase y verifica la sesión del usuario.
- Los PDFs con texto seleccionable, TXT y MD se pueden indexar. Los PDF escaneados requieren OCR.

La página anterior se conserva en `2026-10-23/ho/outputs/index.html`; la aplicación actual tiene su `index.html` en la raíz del repositorio.
