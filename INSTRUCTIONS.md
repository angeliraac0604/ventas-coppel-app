# Reglas de Desarrollo - Ventas Coppel App 🚀

Este documento define la estructura, estándares y arquitectura que DEBEN seguirse en el desarrollo de la aplicación para asegurar la consistencia y estabilidad.

## 1. Arquitectura Técnica 🏗️
- **Frontend:** React + Vite + TypeScript.
- **Estilos:** Tailwind CSS (vía CDN en `index.html`) + CSS personalizado en `index.html`.
- **Backend/DB:** Supabase (PostgreSQL + Auth + Storage).
- **Sincronización:** Google Apps Script para backup en Google Drive.

## 2. Convenciones de Nombres (Naming Bridge) 🌉
Existe una distinción estricta entre la base de datos y el código frontend:
- **Base de Datos (Snake Case):** `store_id`, `invoice_number`, `full_name`, `ticket_image`.
- **Frontend (Camel Case):** `storeId`, `invoiceNumber`, `fullName`, `ticketImage`.

**REGLA DE ORO:** Siempre mapear las propiedades al recibir datos de Supabase y al enviarlos.
- Ejemplo de mapeo al recibir: `storeId: row.store_id`
- Ejemplo de mapeo al enviar: `store_id: sale.storeId`

## 3. Manejo de Imágenes (Sync Bridge Architecture) 📸
Para garantizar que no se pierdan evidencias:
1. **Prioridad 1:** Subir a Supabase Storage (bucket `receipts`). Esto asegura el registro inmediato.
2. **Prioridad 2 (Background):** Sincronizar con Google Drive usando `googleAppsScriptService`. Si falla el Drive, la venta sigue siendo válida en Supabase.

## 4. Estructura de Archivos 📂
- `App.tsx`: Núcleo de la app (Estado global, Auth, Enrutamiento, Operaciones CRUD principales).
- `components/`: Componentes modulares de la UI.
- `services/`: Lógica de API y servicios externos (Supabase, Gemini, Drive).
- `types.ts`: Definiciones de interfaces TypeScript (Fuente de verdad para tipos).
- `constants.ts`: Configuraciones estáticas (Marcas, Colores, Endpoints).

## 5. Seguridad y Roles 🔐
- **admin:** Acceso total a todas las tiendas y configuración.
- **supervisor:** Ve estadísticas y ventas de sus tiendas asignadas (`assigned_stores`).
- **seller:** Solo ve y registra datos de su propia tienda (`store_id`).
- **viewer:** Solo lectura de estadísticas (Dashboard).

## 6. Estándares de Código 💻
- **No Vibe Coding:** Siempre usar tipos fuertes. No usar `any` a menos que sea estrictamente necesario por compatibilidad de librerías.
- **Iconos:** Usar exclusivamente `lucide-react`.
- **Real-time:** Las suscripciones de Supabase deben manejarse en `App.tsx` para actualizar el estado global.
- **SQL:** Mantener el script `REQUIRED_SQL` dentro de `App.tsx` sincronizado con la estructura real de la base de datos.

## 7. Instrucciones para la IA 🤖
Cada vez que trabajes en este proyecto:
1. Lee este archivo `INSTRUCTIONS.md`.
2. Verifica `types.ts` antes de modificar interfaces.
3. Asegúrate de no romper el mapeo CamelCase/SnakeCase.
4. Mantén la estética "Premium" (Gradients, Glassmorphism, Micro-animations) definida en el diseño original.

## 8. Blindaje contra Pantallas Blancas (Stability Rules) 🛡️
Para evitar que la app se quede bloqueada o en blanco:
- **Timeouts de Seguridad:** Todas las esperas de sesión (`auth`) o carga de datos críticos deben tener un `setTimeout` que fuerce el fin del estado de carga tras 3-5 segundos.
- **Optional Chaining:** Usar SIEMPRE `?.` al acceder a propiedades de perfiles o datos de la base de datos (ej. `userProfile?.role`).
- **Estados de Error:** Si una consulta falla, la app NO debe quedarse cargando; debe mostrar un botón de "Reintentar" o un mensaje claro.
- **Valores por Defecto:** Al mapear datos, proveer valores por defecto (ej. `price: row.price || 0`) para evitar errores de cálculo.
- **Fragmentos de Seguridad:** En `App.tsx`, el renderizado principal debe estar protegido por validaciones de `session` y `userProfile` antes de intentar renderizar componentes que dependan de ellos.
