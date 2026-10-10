# CRM-TUMI

CRM para el Restaurante El Tumi. React + Node.js + MySQL.

## Estado: CRM, CMS, Dashboard y Estadísticas

Implementado: estructura frontend/backend, migración MySQL, creación del administrador, inicio/cierre de sesión, sesiones persistidas, recuperación por correo y estructura adaptable del panel basada en Figma.

La página pública está en **http://localhost:5173/** y presenta inicio, historia, carta, galería, opiniones, contacto, registro y promociones siguiendo Figma. Es independiente de la autenticación administrativa. El formulario registra nombre, correo, celular peruano y consentimiento en MySQL sin crear una cuenta de acceso para el cliente.

El panel permanece en **http://localhost:5173/admin**. Clientes permite consultar y registrar clientes; promociones permite gestionar ofertas y campañas de correo, con pruebas locales sin proveedor. Canjes permite confirmar beneficios, consultar el historial y descargar o reimprimir tickets de 80 mm. Clientes incluye historial y segmentos por canjes; el CMS permite editar y publicar la web. Dashboard y Estadísticas muestran datos reales y permiten descargar reportes PDF y Excel.

Teléfono y horario confirmados: +51 902 356 348, lunes a domingo de 11:00 a 17:00. Los platos, precios, opiniones y banners son contenido de referencia de Figma pendiente de confirmación; se indica en el pie de página. El contenido inicial se conserva en `backend/assets/site-default.json`; la web consulta exclusivamente el contenido publicado de MySQL, editable desde el CMS. No generan campañas ni promociones canjeables. Los textos legales definitivos y enlaces sociales también quedan pendientes antes del lanzamiento.

El alcance y las reglas vigentes están en [AGENTS.md](AGENTS.md).

## Requisitos

- Node.js 22.12 o posterior (verificado con 22.15) y npm.
- MySQL 8.4 o posterior. La verificación local se realizó con MySQL 9.3.
- Docker Compose es opcional para MySQL y Mailpit.

## Instalación en otra máquina

1. Ejecuta `npm ci` en la raíz.
2. Copia `backend/.env.example` a `backend/.env` y configura `DATABASE_URL`. No uses las contraseñas de ejemplo.
3. Prepara la base de datos mediante una de las opciones siguientes.
4. Ejecuta `npm run db:generate` y `npm run db:migrate`.
5. Ejecuta `npm run admin:create` en una terminal interactiva. Solicita nombre, correo y contraseña oculta de 12–128 caracteres. No crea credenciales predeterminadas ni sobrescribe un administrador existente.
6. Ejecuta `npm run dev` y abre **http://localhost:5173/admin**.

Usa exactamente el origen configurado en `APP_ORIGIN`; cambiar `localhost` por `127.0.0.1` sin ajustar la configuración impedirá las solicitudes de autenticación.

### Con Docker

Copia `.env.example` a `.env` en la raíz y reemplaza las dos contraseñas. Ejecuta:

```sh
docker compose up -d
```

La base `crm_tumi` y el usuario `tumi` se crean automáticamente. Configura la misma contraseña en `backend/.env`; codifica los caracteres especiales de la contraseña al construir la URL MySQL. Si el puerto 3306 está ocupado, ajusta el puerto publicado y `DATABASE_URL`.

Mailpit recibe correos en el puerto 1025 y permite verlos en **http://localhost:8025**. No envía mensajes a destinatarios externos.

### Con MySQL instalado

Crea una base `crm_tumi` con `utf8mb4` y un usuario dedicado con permisos sobre esa base. Configura su conexión en `backend/.env`. No uses la cuenta root como usuario de la aplicación.

En el equipo donde se implementó esta etapa ya se preparó una instancia aislada en `.local/mysql-test`, puerto **3310**, con bases `crm_tumi` y `crm_tumi_test`. Las credenciales generadas están únicamente en archivos locales ignorados. No se modificó el servicio MySQL existente. Si esta instancia está detenida, puedes iniciarla en una terminal con:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local-mysql.ps1
```

Ese comando solo reinicia la instancia ya creada; no instala ni inicializa MySQL en otras máquinas. Detén la instancia con Ctrl+C en su terminal cuando no la necesites.

### Ver la base de datos en MySQL Workbench

La base ya reside en un servidor MySQL real. Prisma define su estructura y ejecuta consultas; no guarda los clientes dentro del código. Workbench es la interfaz con la que puedes conectarte a ese servidor.

Para la instancia local de este equipo, crea una conexión Standard TCP/IP con:

| Campo | Valor |
| --- | --- |
| Connection Name | CRM Tumi local |
| Hostname | `127.0.0.1` |
| Port | `3310` |
| Username | `tumi` |
| Default Schema | `crm_tumi` |
| Password | La contraseña de `DATABASE_URL` en `backend/.env`; no copies toda la URL |

Pulsa Test Connection, conecta y actualiza Schemas. La conexión habitual de MySQL en el puerto 3306 es otra instancia y no mostrará estas tablas.

Tablas actuales: `admin`, `session`, `passwordreset`, `customer` y `_prisma_migrations` (en esta instalación de Windows se muestran en minúsculas). Para consultar clientes:

```sql
USE crm_tumi;
SELECT id, name, email, phone, subscribed, consentAt, consentVersion, createdAt
FROM customer
ORDER BY createdAt DESC;
```

La tabla empieza vacía: los datos de prueba se crean en `crm_tumi_test` y se eliminan al terminar sus pruebas. Un registro válido en la página local se guarda en `crm_tumi` y permanece después de reiniciar la aplicación.

## Recuperación de contraseña

Configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` y, cuando corresponda, `SMTP_USER`/`SMTP_PASSWORD` en `backend/.env`. Sin un SMTP disponible, el enlace no se entregará; el servidor registrará un error genérico sin exponer secretos.

El enlace vence a los 30 minutos y solo se puede usar una vez. Cambiar la contraseña revoca todas las sesiones y enlaces pendientes. La respuesta al solicitar recuperación es la misma para correos existentes y desconocidos.

Las sesiones normales tienen una vigencia máxima de 8 horas y cookie de sesión del navegador; «Mantener sesión iniciada» permite 30 días. Cerrar sesión elimina la sesión en MySQL. Los tokens se almacenan como hashes; las contraseñas se protegen con scrypt.

## Comandos

| Comando | Función |
| --- | --- |
| `npm run dev` | API en 3001 y frontend en 5173 |
| `npm run build` | Compila API y frontend |
| `npm run typecheck` | Verifica TypeScript |
| `npm run db:generate` | Genera el cliente Prisma |
| `npm run db:migrate` | Aplica migraciones pendientes, sin reiniciar datos |
| `npm run admin:create` | Alta interactiva del administrador inicial |
| `npm test` | Pruebas API/MySQL y adaptador SMTP |
| `npm run test:core -w @tumi/api` | Pruebas de autenticación y registro; excluye la prueba SMTP |
| `npm run test:e2e` | Pruebas de navegador en escritorio y móvil |

## Pruebas

Crea una base separada cuyo nombre termine en `_test` y configura `backend/.env.test` con el mismo formato que `.env`, apuntando a esa base. Las pruebas exigen una conexión local y aplican sus migraciones allí; nunca deben apuntar a producción.

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

Si ya tienes Edge instalado en Windows, puedes usarlo en lugar de descargar Chromium:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

Las pruebas de navegador levantan sus propios servidores en 3002 y 5174, crean una cuenta de prueba aleatoria y eliminan esa cuenta al finalizar. Capturas y trazas se guardan en `test-results/`, excluido de Git. No se necesita crear el administrador real para ejecutar pruebas.

Validación de la etapa 1: compilación, TypeScript, nueve pruebas de autenticación y dos recorridos con Edge aprobados. Validación de la etapa 2: compilación, TypeScript y 15 pruebas API (autenticación y clientes) aprobadas. Las nuevas pruebas de navegador público se añadieron, pero no pudieron ejecutarse por rechazo del permiso; su revisión visual sigue pendiente. La última instalación reportó cero vulnerabilidades. La prueba adicional SMTP (`mail.test.ts`) sigue pendiente; no se verificó envío a correos reales.

## Organización y API

El código se divide en dos carpetas en la raíz: **frontend/** y **backend/**. Edita los archivos de sus carpetas `src/`; las carpetas `dist/` se generan con la compilación. Las dependencias `node_modules/` son necesarias para ejecutar el proyecto. `.local/` contiene la base de datos local y no debe borrarse como si fuera caché.

Tras la reorganización se verificaron TypeScript, compilación y las 16 pruebas del backend.

- `frontend`: React, rutas, estilos CSS Modules, fuentes locales y recursos originales de Figma.
- `backend/src`: servidor Express, autenticación, correo y alta administrativa.
- `backend/prisma`: esquema y migraciones MySQL.
- `backend/test`, `tests`: pruebas de integración y navegador.

API bajo `/api/v1`:

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/health` | Disponibilidad de MySQL |
| POST | `/public/customers` | `{name, email, phone, consent: true}`; registro público, sin sesión |
| POST | `/auth/login` | `{email, password, remember}`; establece cookie |
| GET | `/auth/me` | Administrador autenticado |
| POST | `/auth/logout` | Revoca sesión y elimina cookie |
| POST | `/auth/forgot-password` | `{email}`; solicitud de enlace |
| POST | `/auth/reset-password` | `{token, password}`; cambio de contraseña |
| GET | `/admin/overview` | Estado de la etapa, protegido por sesión |

Todas las escrituras exigen el encabezado `Origin` igual a `APP_ORIGIN`. El navegador lo añade; para clientes de prueba hay que establecerlo. Los nuevos endpoints administrativos deben situarse después del middleware de autenticación de `/api/v1/admin`.

El registro responde 201 al crear, 400 ante datos inválidos o falta de consentimiento, 409 ante correo/celular duplicado y 429 al superar 20 intentos por hora desde una IP. Normaliza correo a minúsculas y celular a `+51` más nueve dígitos. Índices únicos en MySQL impiden duplicados incluso simultáneos. Nunca sobrescribe datos ni reactiva suscripciones por un formulario duplicado. No existe un endpoint público para listar clientes.

## Producción y límites de esta etapa

- La compilación genera `frontend/dist` y `backend/dist`. Inicia la API con `npm start -w @tumi/api` después de configurar su entorno y aplicar migraciones.
- Sirve el frontend y `/api` bajo el mismo origen mediante un proxy inverso con HTTPS; configura fallback a `index.html` para rutas del frontend. La API escucha en loopback.
- Usa `NODE_ENV=production` y un `APP_ORIGIN` HTTPS. Las cookies usan `Secure`, `HttpOnly`, `SameSite=Lax` y prefijo `__Host-` en producción.
- `TRUST_PROXY=1` solo corresponde a exactamente un proxy confiable delante de la API. El limitador actual está diseñado para una única instancia.
- Dominio, credenciales SMTP reales, respaldos automatizados y despliegue público quedan pendientes. Las campañas inmediatas/programadas están disponibles en modo de prueba local y con adaptador SMTP configurable.
- `package-lock.json` fija las versiones. La sustitución de `deepmerge-ts` por la versión 8 corrige una alerta transitiva de Prisma; se verificaron generación y migraciones con esa versión.

No subas `.env`, `.local`, credenciales, bases de datos ni resultados de pruebas al repositorio.

## Canjes y tickets de 80 mm

En `/admin/canjes`, ingresa el código, valida la promoción, busca el celular registrado y revisa el beneficio. **Confirmar canje y emitir ticket** guarda el canje en MySQL y abre el ticket. Antes de confirmar puedes cancelar sin consumirlo. Después puedes imprimir o descargar el PDF; cancelar la impresión no revierte el canje.

- Un canje por cliente y promoción. El cupo total es opcional: activa **Limitar el total de canjes** al crear o editar una promoción e ingresa, por ejemplo, 200. Se permiten nuevos canjes hasta agotar ese total o vencer la fecha, lo que ocurra primero. Desactivado, solo se exige vigencia y un canje por cliente. No es un límite diario. Se rechazan promociones futuras, vencidas, pausadas o eliminadas. El cliente no necesita haber recibido el correo ni seguir suscrito.
- MySQL impide duplicados con un índice único y una transacción. La clave de solicitud permite recuperar el mismo ticket al repetir una confirmación después de perder la respuesta. Una nueva solicitud del mismo cliente/promoción se rechaza.
- El historial permite buscar cliente, celular, promoción, código o identificador de ticket, filtrar fechas inclusivas de Lima y paginar. Desde allí y desde el historial de Clientes se puede reimprimir o descargar el ticket existente.
- El ticket conserva los datos originales del cliente y beneficio. Las ediciones o eliminación de la promoción no cambian los tickets anteriores. No calcula importes finales ni acredita un pago.
- **Descargar PDF (80 mm)** genera una página de ancho real 80 mm y altura variable, con fuentes incrustadas. **Imprimir ticket** usa el diálogo del navegador: seleccionar papel de 80 mm, escala 100 % y desactivar encabezados/pies. El controlador de la impresora puede sustituir el formato; falta verificar el equipo físico del restaurante.
- La migración `202610030002_redemptions` añade `Redemption` y los contadores de actividad en `Customer`, sin borrar datos. Ejecutar `npm run db:generate` y `npm run db:migrate` antes de iniciar una instalación actualizada. Incluir `backend/assets/` en despliegues junto a `backend/dist/`; contiene las fuentes Inter y su licencia.

API protegida, bajo `/api/v1/admin/redemptions`:

| Método | Ruta | Función |
| --- | --- | --- |
| POST | `/promotion` | Validar código y vigencia |
| POST | `/preview` | Identificar cliente y detectar un canje previo, sin consumirlo |
| POST | `/` | Confirmar con código, celular, revisión y clave UUID de solicitud |
| GET | `/` | Historial con `search`, `from`, `to` y `page` |
| GET | `/:id/pdf` | Descargar el ticket histórico de 80 mm |

Validación del 2026-10-04: compilación y 41 pruebas backend aprobadas; 4 recorridos de clientes/canjes aprobados en escritorio y móvil. Verificados duplicados concurrentes, solicitudes repetidas, bajas, vigencia, copia histórica, filtros de Lima, segmentos y descarga. PDF de ancho 80 mm comprobado por lectura de su tamaño y renderizado, incluyendo condiciones extensas. Vista de impresión del navegador revisada. Figma alcanzó su límite de consultas; comparación exacta de canjes pendiente. Pruebas únicamente sobre la base aislada `_test`.

## Promociones y campañas de correo

El módulo está en `/admin/promociones`. Permite crear y editar ofertas con imagen, código compartido, beneficio, condiciones y vigencia; filtrar por nombre/código y estado; pausar/reactivar y eliminar con confirmación; preparar campañas con asunto, texto previo y segmento; previsualizar y confirmar un envío inmediato o programado. Las fechas se presentan y capturan en hora de Lima.

Eliminar una promoción la retira del listado y cancela sus campañas y destinatarios pendientes. Se conserva en MySQL con `deletedAt` para mantener campañas, correos e imágenes históricas; su código queda reservado. No puede editarse, reactivarse ni generar nuevas campañas. El historial identifica las promociones eliminadas. Un correo en curso puede terminar, pero un rechazo temporal posterior no provoca otro intento. La confirmación permite cancelar antes de eliminar; no hay restauración desde el panel.

La aplicación arranca con `CAMPAIGN_MAIL_MODE=preview` por defecto. En este modo **no envía correos a clientes**: el procesador genera los mensajes y los guarda en MySQL. Para verlos, entra a **Historial de campañas → Ver destinatarios y correos → Ver correo**. No necesitas una API ni un servidor SMTP para probar campañas. La recuperación de contraseña mantiene su adaptador SMTP anterior.

Después de actualizar el código:

```powershell
npm run db:generate
npm run db:migrate
npm run dev
```

Las migraciones añaden `Promotion`, `Campaign` y `CampaignRecipient`, y el campo nullable `Promotion.deletedAt`, sin borrar datos existentes. Detén primero el backend con `Ctrl+C` si Windows bloquea la regeneración de Prisma. `npm run dev` inicia frontend, API y procesador de campañas. Si ya estaba ejecutándose con el comando anterior, reinícialo para incluir el nuevo procesador. MySQL debe estar iniciado.

### Configurar el envío real cuando tengas proveedor

Edita únicamente `backend/.env` con los valores suministrados por el proveedor:

```dotenv
CAMPAIGN_MAIL_MODE=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=USUARIO_DEL_PROVEEDOR
SMTP_PASSWORD=SECRETO_DEL_PROVEEDOR
SMTP_FROM=El Tumi <promociones@example.com>
APP_ORIGIN=https://restaurante.example.com
UPLOAD_DIR=.local/uploads
```

Son ejemplos, no credenciales válidas. Usa puerto 465 y `SMTP_SECURE=true` si el proveedor lo exige; con 587 se negocia STARTTLS cuando lo ofrece. El remitente debe estar autorizado por el proveedor. Para destinatarios externos, `APP_ORIGIN` debe ser el dominio público HTTPS de la aplicación, de modo que funcionen las imágenes y el enlace de baja. Reinicia API y procesador tras cambiar su configuración. Ambos deben compartir modo, base y origen. No se ha probado entrega a bandejas reales.

Las campañas conservan el modo en que se confirmaron: una campaña `preview` nunca pasa automáticamente a `smtp`. Crea un nuevo envío explícito después de habilitar SMTP. La pantalla identifica el modo antes de confirmar. Cada envío guarda una copia de la oferta y del contenido del correo; las ediciones posteriores de la promoción no reescriben mensajes anteriores. Una vez que hay campañas o canjes, el código ya no se puede cambiar.

### Procesamiento y resultados

- Los trabajos se guardan en MySQL. El procesador consulta cada tres segundos y procesa hasta 25 destinatarios por turno. En producción ejecuta y supervisa `npm run worker -w @tumi/api` junto con la API, después de compilar.
- La audiencia se selecciona al comenzar la campaña. La vista previa muestra una estimación; se vuelve a comprobar la suscripción antes de cada intento. El enlace `/baja#token=…` abre una confirmación pública; no requiere una cuenta y no elimina al cliente.
- Pausar la promoción detiene sus envíos pendientes hasta reactivarla; cancelar una campaña omite sus pendientes definitivamente. Una operación de envío que ya esté en curso puede terminar. Una promoción vencida no continúa sus envíos.
- `simulated` significa prueba local, `accepted` aceptación SMTP, `failed` rechazo/fallo, `skipped` baja/cancelación/vencimiento y `uncertain` resultado por verificar. No se registran aperturas ni se presenta aceptación SMTP como entrega confirmada.
- Los rechazos temporales y fallos de conexión seguros se reintentan hasta tres veces (esperas de uno y dos minutos). Un fallo ambiguo después de iniciar el envío o un proceso interrumpido no se reenvía automáticamente. Los bloqueos de trabajo vencen después de cinco minutos para permitir recuperación. Antes de un nuevo envío manual, revisa los resultados ambiguos con el proveedor.
- La segmentación usa los canjes reales: nuevo sin canjes, activo con 1–3, frecuente con 4 o más e inactivo cuando han pasado más de 45 días desde el último canje o registro. Clientes y campañas comparten estos criterios.
- Las imágenes PNG/JPG/WebP se guardan en `UPLOAD_DIR` (máximo 2 MB, validación de tipo y firma). Incluye esa carpeta persistente y MySQL en los respaldos. No borres imágenes antiguas: pueden estar referenciadas por correos históricos. Las imágenes cargadas al cancelar un formulario se conservan; una política de limpieza queda pendiente.

### API añadida

| Método | Ruta bajo `/api/v1` | Función |
| --- | --- | --- |
| GET/POST | `/admin/promotions` | Listado paginado / creación |
| POST | `/admin/promotions/:id/edit` | Editar con revisión para evitar sobrescrituras |
| POST | `/admin/promotions/:id/pause` | Pausar/reactivar |
| POST | `/admin/promotions/:id/delete` | Eliminar con revisión; cancelar pendientes y preservar historial |
| POST | `/admin/promotion-image` | Imagen binaria con Content-Type PNG/JPEG/WebP |
| POST | `/admin/promotions/:id/preview` | HTML y estimación de audiencia |
| POST | `/admin/promotions/:id/campaigns` | Confirmar campaña con `requestKey` único y modo esperado |
| GET | `/admin/campaigns` y `/admin/campaigns/:id` | Historial y resultados paginados |
| GET | `/admin/campaigns/:id/messages/:recipientId` | Correo generado, solo administrador |
| POST | `/admin/campaigns/:id/cancel` | Cancelar pendientes |
| GET | `/public/media/:file` | Imagen pública de promoción |
| POST | `/public/unsubscribe` | Baja mediante token del correo |

Pruebas: `npm test` cubre persistencia, permisos, duplicados, programación, bajas, pausas, vencimiento, recuperación, concurrencia y clasificación de fallos; usa exclusivamente la base local `_test`. Las suites corren secuencialmente porque comparten esa base. `npm run test:e2e -- tests/promotions.spec.ts` recorre creación, imagen, vista previa, cola local, historial, baja, programación, pausa, cancelación de la confirmación y eliminación en escritorio y móvil.

La pantalla principal utiliza el contexto de Figma y sus iconos locales. Figma alcanzó el límite de consultas del plan al solicitar el formulario; su comparación exacta con el mockup queda pendiente. Se conservan los estilos del panel y las reglas funcionales acordadas.

Validación del 2026-10-02: TypeScript y compilación aprobados; 29 pruebas backend aprobadas, incluyendo adaptadores SMTP contra un receptor local; recorridos de acceso (2), clientes (2) y promociones (2) aprobados en Edge para escritorio y móvil. Se revisaron capturas del panel de promociones y la vista previa. No se enviaron correos a clientes reales.

Validación del 2026-10-03: compilación y TypeScript aprobados; 32 pruebas backend y 2 recorridos de promociones (escritorio/móvil) aprobados. Se verifican permisos, revisión desactualizada, eliminación repetida, preservación del historial y cancelación durante un intento SMTP simulado. Migración de eliminación aplicada a la base local; no se eliminaron promociones reales ni se enviaron correos externos.

## Límite opcional y avisos toast

El límite total cuenta todos los canjes históricos de la promoción. Puede aumentarse o desactivarse sin reiniciar los usos, pero no reducirse por debajo de los ya realizados. Los cupos se validan dentro de la misma transacción que registra el canje, incluso si varios clientes intentan tomar el último. Reimprimir, descargar o repetir la misma solicitud no consume otro cupo. Las promociones existentes conservan el valor sin límite tras la migración `202610040001_redemption_limit`.

Las tarjetas muestran usados y disponibles. El panel de canjes muestra cuando se agota el cupo y permite recuperar tickets existentes. Las nuevas campañas incluyen el límite en su copia de contenido; los correos de campañas anteriores no se reescriben.

Los mensajes de éxito al crear, editar, pausar, eliminar o preparar campañas, registrar clientes y confirmar canjes aparecen como toast. Se cierran manualmente o tras siete segundos, con pausa al mantener el cursor o el foco en su botón de cierre. El cuerpo del aviso no bloquea los clics de la página. Los errores y las confirmaciones previas permanecen en su contexto.

Verificación de esta ampliación (2026-10-04): compilación y 43 pruebas backend aprobadas, incluyendo competencia por los últimos cupos, aumento/desactivación y preservación del historial. Recorridos de promociones, clientes y canjes aprobados en escritorio y móvil. Los toast permiten cerrar el aviso y no bloquean los botones de la página.


## CMS: contenido del sitio

En **http://localhost:5173/admin/contenido** puedes editar Inicio/Hero, Nosotros, carta, promociones web, galería, opiniones, contacto, horarios, redes sociales, títulos y textos legales.

1. En Carta, selecciona una categoría y pulsa **Añadir plato**. Completa nombre, precio, descripción e imagen; puedes cambiar su categoría y visibilidad. Los controles ↑/↓ cambian el orden general de los elementos.
2. En Promociones web, Galería u Opiniones, añade elementos y edita sus detalles. Los banners son imágenes de la web, independientes de códigos, campañas y canjes.
3. **Guardar borrador** conserva los cambios en MySQL sin cambiar la página pública. **Vista previa** guarda primero si hay cambios y abre una vista privada; el registro está deshabilitado allí.
4. **Publicar cambios → Confirmar publicación** reemplaza todas las secciones públicas juntas. El visitante verá la versión nueva al cargar la página. **Descartar borrador** recupera la versión publicada.

Las tablas MySQL son `SiteContent` (borrador y publicación actual), `SitePublication` (copias publicadas) y `SiteAsset` (acceso a imágenes). Una revisión evita sobrescribir cambios hechos en otra ventana: ante un conflicto, recarga el contenido antes de continuar. No hay restauración de publicaciones históricas en el panel.

Las imágenes se guardan en `UPLOAD_DIR/cms` (por defecto `backend/.local/uploads/cms`). Se aceptan PNG/JPG/WebP de hasta 5 MB y 25 megapíxeles, sin animación; se convierten a WebP, se eliminan metadatos y se ajustan a un máximo de 2400 px. Las nuevas imágenes del borrador requieren sesión; se vuelven públicas cuando se publica un elemento visible que las utiliza. Imágenes ya publicadas y archivos retirados se conservan: quitar un elemento no es una limpieza física del almacenamiento. Incluye esta carpeta y MySQL en los respaldos.

El contenido inicial se carga desde `backend/assets/site-default.json` solo cuando aún no existe el documento en MySQL. Conserva `backend/assets` al desplegar. Los textos, platos, precios y opiniones iniciales siguen siendo referencias: reemplázalos con datos reales desde el panel. Las categorías vacías mantendrán su aviso hasta que agregues y publiques platos visibles.

Verificación (2026-10-05): 48 pruebas backend aprobadas, incluyendo privacidad de borradores e imágenes, publicación coherente, revisiones concurrentes, validación y descarte. Compilación y TypeScript aprobados. Comparación exacta del editor con Figma pendiente: la consulta de diseño no devolvió la pantalla; se conservaron los componentes y estilos del panel existente.
Navegador: 4 recorridos CMS y 2 recorridos públicos aprobados en escritorio/móvil; incluyen imágenes, carta, vista previa, publicación, orden, visibilidad, eliminación, descarte y registro público.


## Dashboard, Estadísticas y reportes

- **http://localhost:5173/admin/dashboard**: resumen de clientes, registros, canjes y promociones; gráficos, resultados de correo, canjes recientes y accesos a los módulos.
- **http://localhost:5173/admin/estadisticas**: indicadores del período, actividad por fecha, distribución actual de segmentos, promociones con más canjes y tabla paginada de rendimiento.
- Selecciona **Desde/Hasta → Aplicar filtros** y luego **Descargar PDF** o **Descargar Excel**. El rango se conserva en la URL y al exportar. Los botones de descarga se deshabilitan mientras hay fechas sin aplicar o datos sin cargar.

Fechas inclusivas de Lima; por defecto últimos 30 días, máximo 366 días y sin fechas futuras. Se cuentan registros por alta, canjes por emisión y resultados de correo por fecha de procesamiento. Los segmentos, suscripciones, estados y pendientes son actuales y se identifican como tales.

Conversión: pares únicos cliente/promoción con aceptación SMTP **dentro del rango**, cuyo canje ocurrió después de la primera aceptación de ese rango y antes de su cierre. Reenviar no duplica receptores; un cliente en dos promociones representa dos pares. Simulaciones y resultados inciertos no se consideran aceptaciones. Sin receptores se muestra «—», no un porcentaje ficticio. Los canjes sin atribución pueden provenir de correos anteriores al rango o de personas que conocían el código por otro medio; no se supone que nunca recibieron correo.

El Excel (`.xlsx`) contiene seis hojas: resumen, actividad diaria, segmentos actuales, clientes dados de alta en el período, promociones y canjes del período. Las promociones se seleccionan por vigencia que cruza el período o por actividad de correo/canje; las eliminadas solo aparecen con actividad histórica y no se suman al contador principal. Incluye todos los registros seleccionados, no solo la página visible. Teléfonos y textos se conservan como texto, sin ejecutar fórmulas.

El PDF es **A4** (los tickets de canje conservan sus 80 mm). Incluye indicadores, criterios, actividad mensual y hasta 20 promociones con más canjes; señala cuando existe un listado mayor en Excel. El reporte incorpora fechas aplicadas, fecha de generación y numeración de páginas. Las exportaciones consultan los datos al generarse, por lo que un nuevo registro entre la consulta y la descarga puede aparecer en el archivo.

La API `/api/v1/admin/statistics` y `/export/pdf` o `/export/xlsx` requiere sesión administrativa. La consulta usa una transacción consistente; si un rango supera 100 000 registros de cualquiera de las colecciones consultadas, solicita reducirlo sin truncar los indicadores. No se requieren nuevas tablas ni migraciones para esta etapa. ExcelJS usa una versión corregida de su dependencia uuid mediante override del proyecto.

Verificación (2026-10-06): 54 pruebas backend aprobadas, incluidas fronteras de fecha Lima, reenvíos, simulaciones, canjes previos al envío, eliminadas con historial, conjuntos vacíos, autorización y exportaciones. Recorridos de Dashboard/Estadísticas, filtros, descargas y recuperación de errores aprobados en escritorio y móvil. PDF A4 revisado en dos y varias páginas. Se consultó el diseño de Estadísticas; la comprobación visual exacta con Figma sigue pendiente por límite de consultas.

## Buscador, enlaces y animación

El buscador de la cabecera funciona desde Dashboard, Clientes, Promociones, Canjes, CMS y Estadísticas, también en móvil. Escribe un nombre, correo, celular o código y pulsa Enter o la lupa. Los resultados se agrupan en clientes, promociones y canjes; abre una coincidencia para acceder al módulo con su filtro aplicado. «Ver resultados» muestra el listado completo de ese módulo. Los filtros anteriores se restablecen al navegar desde la búsqueda global.

Los enlaces de ambas interfaces no tienen subrayado y mantienen foco visible. Inicio, cierre y comprobación de sesión muestran un indicador de carga; la página pública anima suavemente la portada y las secciones al aparecer. La preferencia de movimiento reducido desactiva las animaciones.

## Promociones con Resend

El proveedor elegido para enviar promociones es **Resend**, integrado mediante su API HTTPS. Los clientes, segmentos, consentimiento, bajas y campañas permanecen en MySQL. No es necesario copiar la lista a Resend: el worker envía individualmente a los suscritos seleccionados y guarda el ID devuelto por el proveedor. El panel y los reportes cuentan estos resultados junto con SMTP, separando las pruebas locales.

### Activación

1. Añadir un dominio propio en Resend y publicar los registros DNS indicados por el proveedor. Esperar a que figure verificado. La cuenta conectada consultada el 2026-10-07 no tenía dominios.
2. Elegir una dirección de ese dominio como remitente. Crear una API key con permiso de envío, restringida al dominio cuando sea posible. Guardarla directamente en `backend/.env`, nunca en el frontend, Git ni el chat. La conexión de la herramienta Resend no proporciona automáticamente una clave al proceso Node.js.
3. Publicar el CRM con HTTPS y acceso público a `/api/v1/public/media/` y `/baja`. `localhost` no sirve a los destinatarios para ver imágenes ni darse de baja. Configurar el proxy y `APP_ORIGIN` con el origen público, sin barra final.
4. Completar estas variables en `backend/.env` (los siguientes valores son ilustrativos; reemplazar el dominio y guardar la clave real solo localmente):

```dotenv
CAMPAIGN_MAIL_MODE=resend
RESEND_API_KEY=
RESEND_FROM=El Tumi <promociones@tu-dominio.com>
RESEND_REPLY_TO=contacto@tu-dominio.com
APP_ORIGIN=https://tu-dominio.com
```

`RESEND_REPLY_TO` es opcional. El arranque rechaza el modo Resend si falta la clave o el remitente es de pruebas. En producción también rechaza un origen local/sin HTTPS; en desarrollo permite localhost; la limitación se documenta aquí. No verifica DNS ni disponibilidad pública en el arranque: comprobar ambos antes de confirmar la primera campaña. Sin clave/remitente conservar `CAMPAIGN_MAIL_MODE=preview`. Con ambos configurados, desarrollo permite `resend` antes de contratar hosting.

5. Reiniciar API y worker con `npm run dev` en desarrollo, o reiniciar ambos procesos del despliegue. En Promociones debe aparecer **Modo Resend**. Abrir una promoción, revisar destinatarios y correo, y pulsar **Confirmar envío real** o programarlo. Las campañas anteriores conservan su modo; las pruebas locales nunca se convierten en envíos reales automáticamente.

### Resultados y límites

- El historial muestra aceptación o fallo. Aceptado significa que Resend recibió el mensaje, no que llegó a la bandeja. Consultar el panel de Resend para entrega, rebotes y quejas; no hay webhooks de entrega implementados. Dar de baja en el CRM a direcciones que reporten quejas o rebotes permanentes.
- Se envía HTML y texto, con el enlace de baja existente. Se respeta la baja antes de cada intento y se mantiene la programación de la cola local, sin otra programación duplicada en Resend.
- Cada petición lleva una clave idempotente estable. Hay una pausa de 600 ms entre envíos; un límite 429 se reintenta hasta tres intentos con espera creciente. Si la cuota se agotó, revisar el plan en Resend antes de crear otro envío.
- Un timeout, error de red, 5xx, conflicto 409, 408 o respuesta sin identificador queda **Por verificar**, sin reintento automático. Resend conserva las claves idempotentes 24 horas; no se asume deduplicación ilimitada tras una interrupción. Un reenvío manual crea una campaña nueva y requiere revisar previamente los resultados ambiguos.
- La recuperación de contraseña administrativa conserva el adaptador SMTP y sus variables `SMTP_*`; este cambio conecta las campañas promocionales.

Referencia: [dominios de Resend](https://resend.com/docs/dashboard/domains/introduction), [API de envío](https://resend.com/docs/api-reference/emails/send-email) e [idempotencia](https://resend.com/docs/dashboard/emails/idempotency-keys).

Verificación del código (2026-10-07): TypeScript, compilación y 58 pruebas backend aprobadas. Incluyen contrato HTTP con Resend simulado, idempotencia, errores, validación de configuración, cola con bajas, separación de modos y conversión con SMTP/Resend. No se realizaron envíos externos ni se modificaron secretos locales. Activación y recepción real pendientes de dominio, remitente, clave y URL pública.
Verificación en navegador: cuatro recorridos de promociones y estadísticas aprobados en escritorio/móvil, con campañas locales y descarga de reportes.
`restauranteeltumi.space` es el dominio confirmado posteriormente por el usuario. Ya aparece en Resend, pendiente de verificar; consultar [registros DNS exactos](docs/resend-dns.md). El remitente local está preparado y el modo continúa en preview hasta completar los requisitos.
Actualización: Resend confirma el dominio restauranteeltumi.space y sus tres registros DNS como verificados. GoDaddy es el proveedor confirmado. Continúan pendientes la API key privada y el origen público HTTPS para activar campañas reales.

### Envío desde localhost (2026-10-07)

El usuario autorizó probar el correo antes de contratar hosting. La clave local está configurada, el modo es `resend` y un correo de prueba externo figura entregado en Resend. No se ejecutó una campaña masiva. Reiniciar API y worker con `npm run dev` para cargar las variables actualizadas. Los envíos nuevos se confirman desde Promociones; las campañas preview antiguas no se convierten.

Las imágenes y enlaces de baja locales no son accesibles desde fuera. Los avisos persistentes se retiraron del panel por solicitud del usuario. Usar el entorno local para pruebas; publicar el CRM antes de difundir campañas a clientes. La limitación es el acceso a esos recursos, no la conexión saliente con Resend.

Prueba aislada: `npm run mail:test -w @tumi/api -- correo-propio@ejemplo.com`. No consulta clientes ni procesa la cola; cada ejecución envía un mensaje nuevo. Sin destinatario usa `delivered@resend.dev`, el destino de simulación oficial de Resend, que no confirma recepción en una bandeja personal. Las claves nunca se imprimen. TypeScript, compilación y tres pruebas de adaptador/configuración aprobados.

## Editar y eliminar clientes

En Clientes, la columna Acciones ofrece un lápiz para editar nombre, correo y celular y una papelera para eliminar con confirmación. El formulario mantiene validaciones y rechaza duplicados. Si cambia el correo, se omiten los envíos pendientes a la dirección anterior; sin marcar una nueva autorización, la nueva dirección queda sin suscripción. Los cambios no alteran tickets emitidos.

Eliminar oculta al cliente y lo excluye de segmentos/contadores actuales y nuevos canjes/envíos. Es eliminación lógica: historial, correo y celular permanecen reservados; no hay restauración desde el panel. Un envío ya en curso puede terminar. Los reportes históricos conservan registros y actividad anterior. Un conflicto de revisión pide cerrar la ventana y recargar el listado.

2026-10-08: retirados los avisos persistentes de Promociones solicitados; las barras de desplazamiento de la carta y modales usan verdes y fondos claros, manteniendo su funcionamiento.
Verificación final: recorridos de clientes, promociones y página pública aprobados en escritorio y móvil (seis casos). Se revisaron las capturas del formulario de promociones. TypeScript y compilación aprobados.
