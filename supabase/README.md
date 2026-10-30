# Supabase para Estudio Guía

Este archivo crea el esquema inicial de la biblioteca de estudio:

- `study_categories`: categorías como CCNA, BlueCat, Linux y Universidad.
- `study_notes`: apuntes en Markdown con visibilidad `private` o `public`.
- `study_documents`: metadatos y estado de procesamiento de archivos.
- `study-files`: bucket privado para originales subidos.

## Ejecutar

1. Abre el proyecto correcto en Supabase.
2. Ve a **SQL Editor → New query**.
3. Ejecuta `001_core.sql` para crear categorías, notas, documentos y Storage privado.
4. Ejecuta `002_rag.sql` para añadir pgvector, fragmentos semánticos y búsqueda privada.

## Reglas importantes

- Las tablas y el bucket usan Row Level Security / políticas por propietario.
- Una nota se crea como `private`. Para publicarla, el usuario autenticado debe cambiarla a `public`.
- Publicar una nota no publica automáticamente sus documentos adjuntos.
- Los archivos deben subirse con una ruta que empiece por el UUID del usuario: `user-id/document-id/nombre.pdf`.
- No agregues claves `service_role` ni secretos de proveedor al frontend o al repositorio.

## Desplegar la función RAG

Desde la raíz del repositorio, despliega `supabase/functions/study-rag` con Supabase CLI (`supabase login`, `supabase link --project-ref PROJECT_REF`, `supabase functions deploy study-rag`). La CLI vía npm/pnpm requiere Node.js 20 o posterior.

La función espera `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_API_TOKEN` en **Edge Functions → Secrets**. No copies esos valores a `.env.local`, al frontend ni a GitHub. El RAG requiere inicio de sesión y consulta solo contenido de la cuenta del usuario.

La interfaz extrae e indexa notas y archivos PDF con texto seleccionable, TXT y MD. Los PDF escaneados requieren OCR.
