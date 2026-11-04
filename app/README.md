# Frontend de SaludFactura

Interfaz en Next.js App Router, React, TypeScript y CSS propio. Supabase Auth gestiona el acceso; las operaciones de salud consumen los endpoints internos `/api/*`. No necesita credenciales de Factus en el navegador.

## Desarrollo en Windows

Desde la raíz del repositorio:

```powershell
npm.cmd ci
npm.cmd run dev
```

Configurar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `.env.local` (ignorado por Git). También se admite `NEXT_PUBLIC_SUPABASE_ANON_KEY` como alternativa. Estas son claves públicas; nunca colocar `service_role` ni claves secretas en variables `NEXT_PUBLIC_*`.

Abrir `http://localhost:3000/login`. Para compilar: `npm.cmd run build`. Reiniciar el servidor de desarrollo después de cambiar las variables.

Las pruebas de roles y redirecciones se ejecutan con `npm.cmd run test:frontend`. Cubren que `user_metadata` no conceda administración y que no se acepten redirecciones externas. No sustituyen las pruebas de autorización del backend ni un acceso real con cuentas de Supabase.

Para cargar datos y completar operaciones, el backend necesita PostgreSQL configurado y sus tablas inicializadas. Los modos `FACTUS_MOCK=true` y `FACTUS_PAY_MOCK=true` simulan las APIs de Factus en el servidor; siguen necesitando la base de datos. Coordinar esa configuración con el responsable del backend.

## Pantallas

- `/login`: acceso de Usuario o Administración con correo y contraseña mediante Supabase Auth, mensajes de error y opción de mostrar contraseña. No quedan cuentas ni contraseñas de demostración codificadas.
- `/administracion`: panel del administrador con accesos a supervisión e integración y descripción de perfiles. No crea ni modifica usuarios.

- `/caja`: admisión, cantidades de servicios, estimación del cobro, QR, estados de pago y factura SS-Recaudo. Búsqueda y filtros sobre las admisiones recibidas; el backend limita la consulta a 50 recientes.
- `/facturacion`: consulta y selección de atenciones, validación previa, emisión SS-CUFE y descargas. Una revisión se descarta al cambiar las opciones de la factura.
- `/glosas`: registro, validación del formulario, aceptación/rechazo y descargas de notas crédito. El saldo definitivo y las reglas se verifican en el backend.
- `/cartera`: indicadores globales y filtros por EPS, NIT y saldo. Los filtros no alteran los indicadores globales. No registra pagos de EPS.
- `/`: estado técnico de las integraciones para la demo, reservado al administrador en la interfaz.

La navegación incluye sección activa, acceso al contenido mediante teclado y menú adaptable a móvil. Las consultas muestran carga, errores y opciones de actualización. No se reintentan automáticamente operaciones de escritura tras una falla de red: consultar su estado antes de repetirlas.

## Coordinación

Supabase Auth valida correo y contraseña. Su SDK conserva y renueva la sesión; la contraseña no se guarda en el código ni en almacenamiento propio. El inicio restaura la cuenta con `getUser()` y escucha cambios de sesión. Sin una cuenta autenticada, no se montan las pantallas operativas. Cerrar sesión utiliza alcance local (este navegador).

El rol se obtiene exclusivamente de `user.app_metadata.role`: `admin` o `administrador` habilitan Administración; cualquier otro valor corresponde a Usuario. Nunca se concede administración desde `user_metadata` ni desde el selector del login. El selector debe coincidir con el rol de la cuenta. Usuario accede a Caja, Facturación, Glosas y Cartera; Administración también accede al panel y al diagnóstico de integraciones.

El responsable de Supabase debe crear las cuentas en Authentication → Users y asignar el administrador mediante una operación confiable del servidor, por ejemplo `auth.admin.updateUserById(id, { app_metadata: { role: 'administrador' } })`, conservando otros metadatos que utilice el proyecto. Esa operación necesita credenciales administrativas y no se ejecuta desde este frontend. Tras cambiar un rol, renovar la sesión o salir y volver a ingresar.

Las peticiones internas y las descargas PDF/XML adjuntan `Authorization: Bearer <access_token>` de Supabase. **El backend existente todavía debe verificar el JWT y autorizar cada endpoint**; los filtros de navegación no protegen las API. La conexión PostgreSQL por `DATABASE_URL` es independiente de estas variables públicas de Auth. No se migraron los servicios a la Data API ni se modificaron las políticas RLS.

Los componentes compartidos y tipos de respuesta están en `app/components/`. El backend, las integraciones, las reglas de negocio y el esquema de datos permanecen en sus carpetas actuales. Los tipos del frontend describen las respuestas existentes; no validan el JSON en tiempo de ejecución.

Antes de la demo, comprobar con el backend: admisión → QR → pago → SS-Recaudo → validación → SS-CUFE → glosa → nota crédito → cartera, y también pago rechazado y QR vencido. La compilación y las pruebas de lógica no sustituyen esta comprobación integrada ni la revisión visual en navegador.
