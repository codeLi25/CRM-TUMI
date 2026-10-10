# CRM-TUMI — Plan e instrucciones del proyecto

Última actualización: 2026-10-10 (America/Lima).

## 1. Cómo trabajar con este documento

- Leer este archivo antes de planificar o implementar cambios en el repositorio.
- Este documento es la referencia viva del proyecto. Respetar las decisiones vigentes y las instrucciones más recientes del usuario.
- Actualizarlo cuando se acuerden cambios de alcance, comportamiento, arquitectura o criterios de aceptación.
- Reemplazar las decisiones anteriores en el contenido principal; no acumular requisitos contradictorios. Registrar un resumen del cambio en el historial.
- Distinguir acuerdos explícitos del usuario, valores predeterminados del plan y cuestiones pendientes. No presentar propuestas nuevas como decisiones confirmadas.
- Consultar al usuario cuando una decisión de producto cambie materialmente el alcance; resolver detalles rutinarios de implementación siguiendo este plan.
- Mantener sincronizados el comportamiento implementado y esta documentación. No marcar una funcionalidad como terminada sin verificarla.
- No almacenar credenciales, tokens, contraseñas ni datos personales de las cuentas conectadas en este archivo o en el repositorio.
- No implementar funciones adicionales solo porque aparezcan en el mockup: prevalecen las reglas funcionales de este documento.

## 2. Objetivo y estado actual

Construir un MVP funcional de CRM para el Restaurante El Tumi que permita captar clientes, comunicar promociones por correo y registrar sus canjes en el local.

Estado actual: página pública, registro y acceso administrativo implementados. Clientes dispone de listado, búsqueda, filtros, paginación, alta manual y edición/eliminación mediante iconos; el historial y los segmentos ya utilizan canjes reales. Canjes permite validar, confirmar, consultar el historial e imprimir o descargar tickets PDF de 80 mm. Promociones y campañas incorporan límite total opcional de canjes, creación/edición/pausa/eliminación, imágenes, previsualización, envíos inmediatos/programados, resultados por destinatario y baja de correos. El modo predeterminado guarda correos de prueba en MySQL sin envío externo; los adaptadores SMTP y Resend están implementados. Resend es el proveedor elegido para promociones; el dominio restauranteeltumi.space ya está verificado en Resend y el remitente está preparado; el modo Resend está activo en desarrollo y una prueba externa figura entregada. El hosting/URL pública sigue pendiente para que imágenes y bajas funcionen para destinatarios externos. CMS implementado con edición de secciones, platos, banners, galería y opiniones, borrador privado y publicación transaccional. Dashboard y Estadísticas implementados con indicadores reales, filtros y reportes PDF/Excel. Verificados TypeScript, compilación, 58 pruebas del backend y recorridos de acceso, clientes y promociones en escritorio/móvil. SMTP validado contra un receptor local; entrega a bandejas reales y comparación exacta del formulario de promociones y del panel de canjes con Figma pendientes. Consultar README.md para ejecución, límites y pruebas.

### Actores

1. **Cliente:** navega por la página pública y registra nombre, correo y teléfono para recibir promociones. No necesita una cuenta ni inicia sesión.
2. **Administrador:** gestiona clientes, promociones, correos, canjes, contenido público, estadísticas y reportes.

### Límites del MVP

- Una sede y un administrador inicial, sin introducir nuevos roles.
- No incluye caja, facturación, inventario, pedidos, pagos en línea, sistema de reservas ni programa de puntos.
- El descuento se aplica al cobrar fuera del CRM. El ticket expresa el beneficio, sin calcular importes finales.
- El contacto público por WhatsApp es un enlace; no constituye un sistema de reservas.

## 3. Referencia visual

- Solicitud del usuario (2026-10-08): retirar los avisos persistentes de modo de envío/localhost de Promociones y el aviso largo de localhost en la vista previa. Conservar la confirmación explícita de envío real/prueba. Barras de desplazamiento delgadas verdes con fondo claro para carta, tablas y modales, sin bloquear desplazamiento ni colores de alto contraste del sistema.

- Archivo Figma: https://www.figma.com/design/Oj5aaXuRKOWHBxN0qdF9Vh/Integrador-TUMI?node-id=0-1
- Pantalla de estadísticas originalmente compartida: https://www.figma.com/design/Oj5aaXuRKOWHBxN0qdF9Vh/Integrador-TUMI?node-id=5-2745
- Se revisaron visualmente la página pública, dashboard, clientes, promociones, formulario de promoción, canjes, editores CMS de inicio/platos/banners y estadísticas. También se identificaron en la estructura el inicio de sesión y los modales de clientes.
- Conservar la identidad visual: verdes oscuros, fondos claros, acentos dorados, tipografías, imágenes, distribución, tarjetas, tablas y formularios del mockup.
- Adaptar las pantallas a móviles y añadir estados de carga, errores y listas vacías coherentes con el diseño.
- Solicitud del usuario (2026-10-06): buscador global «Buscar por cliente o código» disponible en los seis módulos administrativos y en móvil. Consulta clientes (nombre/correo/teléfono), promociones y canjes mediante sus API protegidas; muestra hasta cinco coincidencias por sección y abre el módulo con el filtro aplicado, restableciendo filtros previos.
- Enlaces sin subrayado en web pública y panel, conservando foco visible. Loaders accesibles para inicio/cierre y comprobación de sesión, carga pública y búsqueda. Animación suave de portada y secciones al entrar en pantalla; respetar prefers-reduced-motion y no esconder contenido si falta soporte.
- Solicitud del usuario (2026-10-04): usar toast para algunos mensajes de confirmación. Los éxitos de promociones, registro administrativo de clientes y canjes usan avisos accesibles, cerrables y temporales; los errores permanecen junto a la operación y las confirmaciones de eliminación/canje siguen siendo explícitas.
- Durante la implementación, obtener contexto detallado de cada pantalla y conservar los recursos originales como archivos locales. No depender de URLs temporales de recursos de Figma ni usar una captura completa como interfaz.
- Los números, fechas, precios y datos empresariales ilustrativos del mockup no son datos reales confirmados.
- Diferencias acordadas respecto al mockup: exportaciones Excel y PDF; omitir envío de tickets por WhatsApp; no mostrar aperturas de correo, aforo ni montos descontados que el CRM no registra.

## 4. Decisiones explícitamente confirmadas

- MVP funcional con **React en frontend, Node.js en backend y MySQL**.
- Código compartido por promoción; teléfono registrado para identificar al cliente.
- Un solo canje por cliente para cada promoción durante su vigencia.
- El canje se consume al confirmar la emisión del ticket; reimprimir reutiliza el mismo canje.
- Ticket con beneficio, impreso desde el navegador en formato térmico de 80 mm y con posibilidad de guardar como PDF.
- Registro inmediato, con consentimiento para recibir promociones y sin confirmación por correo.
- CMS de secciones fijas con contenido editable, conservando la estructura del mockup.
- Correos con envío manual y programado; segmentación de destinatarios.
- Descarga de reportes Excel y PDF.
- Estadísticas de envíos y canjes, sin seguimiento de aperturas en el MVP.
- Los segmentos deciden quién recibe el correo, no quién puede canjear: cualquier cliente registrado que conozca un código vigente puede utilizarlo una vez.
- La raíz `/` es la página pública, independiente de las sesiones y disponibilidad del acceso administrativo; `/admin` es exclusivamente el acceso y panel del administrador.
- Contacto confirmado por el usuario: WhatsApp +51 902 356 348 y atención de lunes a domingo, 11:00 a 17:00.

## 5. Módulos y reglas funcionales

### 5.1 Página pública y registro

- Secciones: inicio, nosotros, carta por categorías, galería, testimonios, ubicación, contacto, registro y carrusel de promociones.
- Formulario con nombre, correo, teléfono y aceptación explícita de comunicaciones promocionales.
- Correo y teléfono únicos; normalizar teléfonos peruanos con prefijo +51.
- Un registro repetido no debe sobrescribir datos existentes.
- Incorporar al cliente a futuros envíos tras registrarse; no enviar automáticamente todas las promociones vigentes como bienvenida.
- Ofrecer un enlace para dejar de recibir promociones. La baja no elimina su historial ni impide canjear un código vigente.

### 5.2 Acceso administrativo

- Inicio de sesión con correo y contraseña, cierre de sesión y recuperación por correo.
- Sin registro público de administradores.
- Proteger el panel y todas sus operaciones en el servidor, no solo en la interfaz.

### 5.3 Clientes

- Solicitud del usuario (2026-10-07): iconos accesibles para editar nombre, correo y celular y eliminar con confirmación. Validar duplicados y revisión para evitar sobrescribir cambios de otra ventana. La eliminación lógica conserva los tickets y resultados históricos, oculta el cliente de listados/segmentos actuales, impide nuevos canjes y cancela destinatarios pendientes; un correo ya en curso puede terminar. Correo y celular quedan reservados, sin restauración en el panel. Los reportes históricos de registros conservan al cliente; los contadores actuales lo excluyen.
- Cambiar el correo cancela los pendientes para el correo anterior; la nueva dirección queda sin suscripción salvo confirmación explícita de nueva autorización. Editar nombre o celular conserva la suscripción; no modifica tickets ni correos históricos.

- Listado con búsqueda por nombre, correo o teléfono, filtros y paginación.
- Registro manual por el administrador con las mismas validaciones y registro de consentimiento; no asumir consentimiento por el solo hecho de añadir al cliente.
- Mostrar fecha de registro, número de canjes, última actividad e historial de canjes.
- Clasificación automática excluyente, evaluada en este orden:
  1. **Inactivo:** más de 45 días desde su último canje o desde su registro si nunca canjeó.
  2. **Frecuente:** cuatro o más canjes, siempre que no sea inactivo.
  3. **Activo:** de uno a tres canjes, siempre que no sea inactivo.
  4. **Nuevo:** ningún canje, siempre que no sea inactivo.
- La actividad para clasificar clientes se basa en registro y canjes, no en supuestas visitas físicas o aperturas de correo.

### 5.4 Promociones y campañas de correo

- Solicitud del usuario (2026-10-07): conectar promociones a Resend. Modo `resend` mediante API HTTPS con secreto solo en backend; API y worker comparten configuración. Conserva destinatarios, consentimiento, bajas, programación y contenido persistidos en MySQL; no requiere importar contactos a Resend. El modo `resend` puede utilizarse en desarrollo desde localhost por solicitud del usuario; la limitación de imágenes y bajas locales se documenta, sin avisos persistentes en Promociones por solicitud del 2026-10-08. Producción exige origen público HTTPS. No convertir campañas anteriores de preview en envíos reales.
- Resend devuelve un identificador guardado en `CampaignRecipient.messageId`; `accepted` significa aceptación del proveedor, no entrega en bandeja. Estadísticas y reportes incluyen SMTP y Resend, excluyendo simulaciones. Una clave idempotente estable acompaña cada petición; reintentar límites 429 hasta tres intentos, con espera entre envíos. Errores ambiguos de red, 5xx, 408/409 o respuesta sin ID quedan por verificar, sin reenvío automático; las claves del proveedor expiran en 24 horas. No se incorporan webhooks ni seguimiento de aperturas en esta etapa; revisar entrega, rebotes y quejas en Resend.

- Solicitud del usuario (2026-10-02): implementar el módulo sin contar todavía con proveedor/API de correo. Valor predeterminado: `CAMPAIGN_MAIL_MODE=preview`, bandeja de mensajes de prueba protegida dentro del historial y conexión SMTP configurable para cuando existan credenciales. Los mensajes simulados se distinguen de los aceptados por SMTP o Resend.
- Cada campaña conserva su modo y una copia del contenido confirmado. Cambiar el modo no transforma pruebas en envíos reales. Una nueva campaña requiere confirmación explícita con vista previa; las solicitudes repetidas conservan un identificador para evitar campañas duplicadas.
- Pausar una promoción suspende sus pendientes; cancelar una campaña los omite. Un mensaje que ya está en curso puede terminar. El código no se modifica una vez asociado a campañas o canjes.

- Solicitud del usuario (2026-10-03): añadir eliminación con confirmación. Criterio de implementación: eliminación lógica mediante `deletedAt`; ocultar del listado y sus contadores, impedir edición/reactivación/nuevas campañas y cancelar los pendientes en una transacción. Conservar campañas, resultados, imágenes y códigos para mantener el historial; el código no se reutiliza. Un envío en curso puede terminar, pero no se reintenta después de cancelar. No se incorpora restauración en el panel.

- Promoción con nombre, beneficio, condiciones, imagen, código compartido único, vigencia y estado.
- Permitir crear, editar, pausar y eliminar promociones; distinguir futuras, vigentes y finalizadas según su vigencia y estado.
- Separar vigencia de la promoción de fecha y hora de envío de la campaña.
- Enviar a todos los suscritos o a un segmento de clientes. Incluir previsualización del correo y cantidad de destinatarios antes de confirmar.
- Envío inmediato, programado y reenvío manual explícito. Un reenvío no concede otro canje.
- Para campañas programadas, calcular destinatarios al iniciar el envío; la cantidad mostrada al programar es una estimación.
- Respetar las bajas antes de cada envío, incluso si el destinatario había sido seleccionado previamente.
- Registrar los destinatarios y resultados de cada campaña para historial, seguimiento de errores y métricas.
- Usar una plantilla de correo coherente con la marca, incluyendo asunto, texto de vista previa, beneficio, código, condiciones, vigencia y enlace de baja.
- Registrar aceptación o fallo del servidor de correo. No confundir aceptación del proveedor (SMTP o Resend) con entrega confirmada en la bandeja del cliente.

### 5.5 Canjes y tickets

Flujo: **ingresar código → validar promoción → buscar teléfono → mostrar cliente y beneficio → confirmar y emitir ticket**.

- Rechazar códigos inexistentes, promociones futuras, vencidas, pausadas o eliminadas, clientes inexistentes y promociones ya canjeadas por ese cliente.
- Un cliente registrado puede canjear aunque no sea destinatario de la campaña o se haya dado de baja de correos.
- Guardar el canje antes de abrir el diálogo de impresión.
- Proteger la unicidad cliente/promoción también en MySQL y utilizar una operación transaccional para evitar canjes duplicados por doble clic o concurrencia.
- Cancelar la impresión o fallar la impresora no elimina el canje. Permitir reimprimir el mismo ticket.
- Ticket de 80 mm con identificador único, fecha, cliente, teléfono, código de promoción, beneficio y condiciones. Descarga directa como PDF, con ancho de página de 80 mm y altura ajustada al contenido, además de impresión desde el navegador.
- Límite total opcional por promoción, activable al crear o editar. Desactivado (`redemptionLimit = null`) permite canjes por distintos clientes durante la vigencia; activado exige un entero positivo y bloquea nuevos canjes al agotar el cupo o vencer, lo que ocurra primero. Se mantiene un canje por cliente/promoción, sin límite diario ni reinicio de usos al editar fechas.
- El cupo se comprueba contando canjes persistidos dentro de la transacción que bloquea la promoción; dos clientes no pueden consumir el último cupo. Se puede aumentar o desactivar el límite; no reducirlo por debajo de los canjes existentes. Reimpresiones y reintentos de la misma solicitud no consumen cupos adicionales.
- Mostrar canjes usados/disponibles y cupo agotado en promociones y canjes. Los nuevos correos reflejan el límite confirmado; las campañas existentes conservan su copia histórica.
- Historial paginado con búsqueda y filtros de fechas de Lima; reimpresión también desde Clientes. Guardar una clave de solicitud para reutilizar el mismo ticket al repetir una confirmación por fallo de conexión.
- Implementación: tabla Redemption con unicidad cliente/promoción y copia histórica del ticket. Los contadores y fecha de último canje de Customer se actualizan en la misma transacción y alimentan clientes y campañas. Conservar backend/assets, incluidas fuentes y licencia, al desplegar el generador PDF.
- Conservar una copia de los datos del beneficio al canjear para que futuras ediciones no alteren tickets anteriores.
- Mostrar canjes recientes e historial consultable.
- No enviar el ticket por WhatsApp, calcular descuentos monetarios ni confirmar pagos en este MVP.

### 5.6 Contenido del sitio (CMS)

- Estructura pública fija según Figma; no construir un editor libre de páginas.
- Editar textos, imágenes, datos de contacto, horarios y testimonios.
- Gestionar platos con nombre, descripción, precio, categoría, imagen y visibilidad; permitir añadir nuevos platos.
- Gestionar galería y banners, incluyendo orden y visibilidad.
- Guardar borradores, previsualizar y publicar cambios. La web pública solo consulta la versión publicada.
- Publicar una versión coherente del contenido; un borrador nunca debe filtrarse al sitio público.
- Solicitud del usuario (2026-10-04, continuada 2026-10-05): editor completo para Hero estacional, Nosotros, carta en las cinco categorías existentes, carrusel de promociones web, galería, opiniones, contacto/pie, títulos y textos legales. Permitir añadir, editar, ordenar, ocultar y eliminar elementos del borrador con confirmación de eliminación.
- Los banners del CMS son contenido visual; no crean promociones canjeables ni envían correos. Los platos nuevos aparecen en su categoría después de publicar; conservar el estado vacío si realmente no hay platos visibles.
- Persistencia: SiteContent guarda borrador y publicación, SitePublication conserva copias publicadas y SiteAsset controla acceso a imágenes. Control de revisiones para impedir sobrescrituras desde otra ventana. Descartar recupera la versión publicada; no hay restauración de versiones antiguas en el panel.
- Imágenes PNG/JPG/WebP de hasta 5 MB y 25 megapíxeles, sin animación, convertidas a WebP de hasta 2400 px. Nuevas imágenes privadas hasta su primera publicación visible. Conservar archivos ya publicados para mantener referencias históricas; retirar un elemento no elimina físicamente sus archivos.
- Vista previa autenticada en /admin/contenido/vista-previa, sin registrar clientes. Guardar no publica; publicar requiere confirmar el borrador guardado completo. Confirmaciones de éxito mediante toast.

### 5.7 Dashboard, estadísticas y reportes

- Mostrar registros, segmentos, promociones, envíos aceptados/fallidos y canjes.
- Gráficos de registros y canjes por fecha, distribución por segmento y rendimiento de promociones.
- Ofrecer filtros de fechas y mantenerlos al exportar.
- Implementación (2026-10-06): período inclusivo en America/Lima, últimos 30 días por defecto, accesos de 30/90 días y año actual, máximo 366 días sin fechas futuras. Registros por fecha de alta, canjes por emisión y correos por processedAt. Las exportaciones consultan datos actualizados al generarse, manteniendo el rango aplicado.
- La conversión utiliza la cohorte de pares cliente/promoción con al menos una aceptación del proveedor (SMTP o Resend) dentro del período. Cuenta el canje posterior a la primera aceptación del período y antes de su cierre; un cliente en dos promociones cuenta dos pares. Los correos anteriores al período y simulaciones no se atribuyen a esta cohorte. Mostrar sin porcentaje si no hay receptores con envío real.
- Clientes totales, suscritos, segmentos, destinatarios pendientes/en proceso y estados de promociones son actuales, claramente identificados; no se presentan como una reconstrucción histórica. Los listados de clientes se filtran por fecha de registro. Promociones incluyen vigencia que cruza el período o actividad de correo/canje; eliminadas solo con actividad histórica. Excluir eliminadas del contador principal.
- Excel incluye Resumen, Actividad diaria, Segmentos actuales, Clientes, Promociones y Canjes; campos de usuario se escriben como texto, sin fórmulas. PDF A4 resume indicadores, criterios, actividad mensual y hasta 20 promociones con más canjes, indicando el recorte; Excel conserva todas las filas del período.
- Consultas consistentes con transacción RepeatableRead. Límite operativo: más de 100 000 clientes, canjes, resultados o promociones en un rango solicita reducir fechas; nunca truncar silenciosamente métricas. Reportes y datos solo para administrador.
- Conversión de correo: destinatarios únicos con envío aceptado que posteriormente canjearon, divididos entre destinatarios únicos con envío aceptado para la promoción. Los reenvíos no duplican destinatarios en esta métrica.
- Mostrar aparte todos los canjes, incluidos los de clientes que no recibieron correo. No atribuir estos últimos al correo.
- Manejar denominadores vacíos sin división por cero ni porcentajes ficticios.
- Excel para listados filtrados de clientes, promociones y canjes; PDF para resúmenes estadísticos.
- No mostrar métricas de apertura, aforo, ventas, importes descontados o visitas físicas sin una fuente de datos real.

## 6. Arquitectura y valores predeterminados del plan

Las siguientes elecciones desarrollan el plan acordado; pueden revisarse con el usuario sin alterar las tecnologías obligatorias React, Node.js y MySQL.

- **Organización:** `frontend/` para React y `backend/` para la API, Prisma y pruebas del servidor; `tests/` conserva las pruebas del sistema completo. Archivos generados (`dist/`, resultados de pruebas) se pueden regenerar; conservar datos locales y credenciales fuera de Git.
- **Frontend:** React con Vite y TypeScript, React Router, CSS Modules y componentes reutilizables basados en Figma.
- **Backend:** Node.js con Express y TypeScript; API REST bajo /api/v1.
- **Persistencia:** MySQL con Prisma y migraciones versionadas.
- **Entidades:** administradores, clientes, promociones, campañas, destinatarios/resultados de envío, canjes, archivos y versiones de contenido.
- **Interfaces públicas:** consulta de contenido publicado, registro y baja de correos.
- **Interfaces protegidas:** autenticación administrativa, clientes, promociones, campañas, canjes, CMS, estadísticas y exportaciones.
- **Sesiones:** cookies HTTP-only; contraseñas protegidas con hash, validación en servidor y límites de solicitudes en acceso y registro.
- **Correo:** API de Resend para promociones y adaptador SMTP configurable y proceso independiente con trabajos persistidos en MySQL, recuperación tras reinicios y reintentos de errores transitorios. No prometer entrega exactamente una vez si el proveedor no permite resolver resultados ambiguos.
- **Tiempo:** almacenar fechas en UTC y presentar/programar en America/Lima.
- **Archivos:** almacenamiento persistente de imágenes con validación de formato y tamaño; recursos originales de Figma guardados localmente durante el desarrollo.
- **Entorno local:** Docker Compose para MySQL y un servicio de correo de pruebas.
- **Campañas locales:** modo preview sin servicio externo, mensajes persistidos en MySQL y consultables por el administrador. `npm run dev` inicia también el procesador independiente. Las imágenes se guardan en `backend/.local/uploads` por defecto; preservar esa carpeta junto con los datos locales.
- **Despliegue inicial:** un servidor con HTTPS, procesos de aplicación y envíos, almacenamiento persistente y respaldos diarios.
- Configurar secretos por variables de entorno fuera del control de versiones; documentar únicamente nombres y ejemplos ficticios.

## 7. Secuencia de implementación

1. Base del proyecto, base de datos y acceso administrativo (implementada).
2. Página pública y registro de clientes (implementada; revisión visual de navegador pendiente).
3. Registro y gestión de clientes (implementados, con historial y segmentos por canjes).
4. Promociones, campañas y correos inmediatos/programados (implementados y verificados localmente; Resend probado desde localhost; URL pública pendiente para imágenes y bajas).
5. Validación de canjes, emisión, reimpresión y descarga de tickets PDF de 80 mm (implementada y verificada localmente; impresión física y comparación exacta con Figma pendientes).
6. CMS con borradores, previsualización y publicación del contenido público (implementado y verificado localmente; comparación exacta del editor con Figma pendiente).
7. Dashboard, estadísticas y exportaciones con datos reales (implementados y verificados; ajuste visual exacto con Figma pendiente).
8. Validación integral y preparación del despliegue.

Se prioriza completar el recorrido registro → promoción → canje antes del editor CMS. El acceso usa sesiones MySQL con cookie HTTP-only: 8 horas normales, 30 días al recordar sesión; recuperación de 30 minutos y un uso. El administrador inicial se crea con un comando interactivo sin contraseña predeterminada. La configuración local aislada no sustituye el despliegue de producción.

Cada etapa debe respetar la referencia visual y las reglas funcionales, con verificación de los flujos relevantes antes de considerarse terminada.

## 8. Validación y criterios de aceptación

- Registro correcto, campos inválidos, normalización, duplicados y consentimiento; no sobrescribir clientes existentes.
- Baja de correos efectiva antes de enviar, sin perder historial ni bloquear canjes válidos.
- Segmentación con casos de cero, uno, tres y cuatro canjes; probar exactamente 45 días, más de 45 días y prioridad de inactivo.
- Autenticación y protección de operaciones administrativas; recuperación y cierre de sesión.
- Campañas inmediatas y programadas, selección de segmentos al ejecutar, pausas, fallos de correo, reintentos y recuperación tras reinicios.
- Canje con código vigente y cliente registrado, incluidos no destinatarios; rechazo de promociones inválidas y uso repetido.
- Doble clic y solicitudes simultáneas producen un único canje y ticket.
- Cancelación o fallo de impresión permite reimprimir sin otro canje; ediciones posteriores no cambian el beneficio histórico.
- Borradores invisibles públicamente y publicación coherente de secciones, platos, imágenes y banners.
- Comparación visual con Figma, navegación móvil, formularios y estados vacíos/de error.
- Impresión real o vista previa a 80 mm; exportaciones Excel y PDF con filtros correctos.
- Estadísticas y reportes contrastados con un conjunto conocido de datos, incluyendo reenvíos y ausencia de destinatarios.
- Ejecutar comprobaciones proporcionales a cada cambio. Para cambios solo documentales, revisar contenido y diff; no crear pruebas de aplicación innecesarias.

## 9. Pendientes y datos por proporcionar

Estos puntos no invalidan los acuerdos anteriores ni autorizan ampliar el MVP:

- Dominio y remitente verificados en Resend, RESEND_API_KEY en backend/.env, URL pública HTTPS y servidor de despliegue. Dominio confirmado por el usuario: restauranteeltumi.space. Resend lo tiene verificado en sa-east-1; sus tres registros DNS están verificados. El usuario administra el dominio en GoDaddy. Registros públicos en docs/resend-dns.md. Remitente predeterminado preparado: promociones@restauranteeltumi.space; API key presente únicamente en la configuración privada y el CRM sigue en localhost con modo resend activo. Prueba externa confirmada como entregada; no se envió una campaña a clientes. La recuperación administrativa sigue usando SMTP.
- Datos definitivos restantes del restaurante: razón o nombre comercial, datos del ticket, dirección exacta y enlaces de redes sociales. El teléfono y horario ya fueron confirmados en la sección 4.
- Contenido definitivo, precios, fotografías y textos de consentimiento/privacidad. No convertir ejemplos del mockup en datos reales sin confirmación.
- Credenciales del administrador inicial, suministradas por un mecanismo seguro y nunca escritas aquí.
- Revisar en detalle durante la implementación las pantallas y estados que solo se identificaron estructuralmente, así como los comportamientos móviles no especificados en Figma.
- Confirmar la impresión con el equipo físico del restaurante; el mecanismo acordado sigue siendo el diálogo del navegador en 80 mm.
- Versiones iniciales fijadas en package-lock.json; revisar compatibilidad y seguridad cuando se actualicen.

## 10. Historial de cambios

| Fecha | Cambio |
| --- | --- |
| 2026-10-01 | Creación de AGENTS.md con el plan del MVP, decisiones confirmadas, referencia Figma revisada, reglas de negocio, arquitectura propuesta, validación y pendientes. Sin implementación de la aplicación. |
| 2026-10-01 | Implementación de la etapa 1 autorizada por el usuario: base React/Express/MySQL, sesiones, recuperación y panel según Figma. Actualización del orden para completar el flujo principal antes del CMS; configuración y pruebas documentadas en README.md. |
| 2026-10-01 | Etapa 2: página pública según Figma en `/`, formulario conectado a la tabla Customer en MySQL, consentimiento y prevención de duplicados. Confirmación del teléfono y horario. Compilación y 15 pruebas API aprobadas; revisión de navegador pendiente por permiso rechazado. |

| 2026-10-01 | Reorganización solicitada: frontend/ y backend/ en la raíz, rutas de workspaces y pruebas actualizadas, limpieza de compilaciones y resultados generados. TypeScript, compilación y 16 pruebas del backend aprobadas. |
| 2026-10-02 | Continuación solicitada: módulo de promociones/campañas con cola MySQL, procesador independiente, modo local sin proveedor, adaptador SMTP, imágenes, programación, bajas y resultados. Se documenta el alcance real de clientes y la dependencia de canjes. Compilación, TypeScript y 29 pruebas backend aprobadas; recorridos de acceso, clientes y promociones aprobados en escritorio/móvil. Figma limitó la consulta detallada del formulario; comparación exacta pendiente. Sin envíos a destinatarios reales. |

| 2026-10-03 | Eliminación de promociones solicitada por el usuario: confirmación, eliminación lógica y cancelación de pendientes sin perder historial. Migración aplicada; TypeScript, compilación, 32 pruebas backend y recorrido de promociones con eliminación en escritorio/móvil aprobados. |

| 2026-10-04 | Módulo de canjes completo: validación, confirmación transaccional, historial, reimpresión y PDF de 80 mm. Integración con clientes y segmentación de campañas. Migración aplicada; compilación, 41 pruebas backend y 4 recorridos de clientes/canjes en escritorio/móvil aprobados. PDF medido y revisado; impresión física y comparación exacta con Figma pendientes por límite de consultas. Se aclara que no hay cupo global, manteniendo un canje por cliente/promoción. |
| 2026-10-04 | Límite total de canjes opcional solicitado: se activa al crear/editar, protege el último cupo en transacción y muestra usados/disponibles. Permite aumentar o desactivar sin reiniciar canjes; nuevos correos incluyen el cupo. Toast accesibles para éxitos en promociones, clientes y canjes. Migración aplicada; compilación, 43 pruebas backend y recorridos de promociones/clientes/canjes aprobados en escritorio/móvil. |

| 2026-10-05 | CMS completo: edición de secciones y colecciones, imágenes privadas, borradores en MySQL, vista previa autenticada, publicación transaccional y descarte con control de revisiones. Migración aplicada; compilación, TypeScript, 48 pruebas backend y 6 recorridos de CMS/página pública en escritorio y móvil aprobados. Comparación exacta del editor con Figma pendiente. |

| 2026-10-06 | Dashboard General y Estadísticas con datos MySQL, gráficos, segmentos actuales, filtros Lima y conversión SMTP por pares únicos sin simulaciones. Reportes Excel de seis hojas y PDF A4 con paginación. TypeScript, compilación, 54 pruebas backend y recorridos de filtros/descargas/error en escritorio y móvil aprobados; PDF revisado visualmente. Referencia de Estadísticas consultada; comparación visual exacta pendiente por límite de Figma. |

| 2026-10-07 | Integración solicitada de Resend para promociones: API HTTPS, configuración privada, identificador del proveedor, idempotencia, límites y errores; panel, estadísticas y exportaciones incluyen aceptación SMTP/Resend. TypeScript, compilación y 58 pruebas backend y cuatro recorridos de promociones/estadísticas en escritorio/móvil aprobados con proveedor simulado. Cuenta consultada sin dominios; activación y prueba externa pendientes de dominio, remitente, secreto y origen público HTTPS. Sin envíos a clientes. |
| 2026-10-07 | Usuario confirma restauranteeltumi.space. Se consultó el dominio existente en Resend (pendiente), se documentaron sus tres registros DNS y se preparó el remitente en la configuración local. No se activó el envío: pendientes DNS, API key y URL pública. |
| 2026-10-07 | Consulta a Resend confirma restauranteeltumi.space y sus tres registros DNS verificados. GoDaddy confirmado como proveedor. Pendientes API key privada y URL pública HTTPS; sin envíos a clientes. |

| 2026-10-07 | Usuario solicita probar Resend sin hosting. Se permite envío real en desarrollo con aviso en listado/vista previa; producción mantiene HTTPS público obligatorio. API key local comprobada sin exponerla y modo resend activado. Un correo de prueba autorizado figura entregado en Resend. TypeScript, compilación y tres pruebas del adaptador/configuración aprobados. |

| 2026-10-08 | Edición y eliminación lógica de clientes mediante iconos, revisión, consentimiento y conservación de historial. Migración aplicada en la base local y de pruebas; 59 pruebas backend aprobadas y recorrido de clientes en escritorio/móvil aprobado. |
| 2026-10-08 | Retirada de avisos persistentes de Promociones y estilos compartidos de scroll para carta y modales según solicitud. Compilación y recorrido público en escritorio/móvil aprobados. |
| 2026-10-08 | Verificación visual y funcional final: recorridos de clientes, promociones y página pública aprobados en escritorio/móvil (seis casos); capturas del modal de promociones revisadas. |

| 2026-10-10 | Usuario autoriza subir el proyecto a codeLi25/CRM-TUMI y cambiar su visibilidad a pública. Publicar solo código, recursos y documentación; excluir secretos, datos MySQL, cargas locales y resultados de pruebas mediante .gitignore. |
