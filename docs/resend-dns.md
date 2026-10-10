# Configuración de correo de restauranteeltumi.space

Consulta a Resend: 2026-10-07. El dominio ya está registrado en la región sa-east-1 y está verificado; los tres registros DNS figuran verificados. Envío habilitado; recepción y seguimiento de aperturas/clics deshabilitados.

Registros verificados del dominio administrado en GoDaddy. Los nombres son relativos a `restauranteeltumi.space`; TTL automático. Los valores proceden de la consulta del dominio en Resend, no de una plantilla genérica.

| Tipo | Nombre | Valor |
| --- | --- | --- |
| TXT | resend._domainkey | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCm2/m49j5t73bT4pjmHkqOBaOS6UYeGZQIYRa8wAtHCD6TsnL4MBEOaQYM/r0C6tnt3o0X4TrY9GhzXRsAtSSE1JrVBllNbf7kSm1sqGx29Rc/BxFFFwr9RxRCx9sEOdH/qoTHgyI7MkBYH0YwGqlv9Go3RBhvWzF3A5ZwxcU7SwIDAQAB |
| CNAME | rsend | rsend-sae1.forge.rmta.net |
| CNAME | send | send.forge.rmta.net |

El TXT contiene una clave **pública** DKIM, no una API key. Conservarlo como una sola cadena. Si los nombres ya existen, comprobar sus valores antes de editar; no eliminar registros ajenos al envío de Resend. Si el proveedor ofrece proxy para CNAME, utilizar solo DNS.

La consulta a Resend confirma que el dominio permite enviar. Remitente predeterminado propuesto: `El Tumi <promociones@restauranteeltumi.space>`. Esto configura una identidad de envío, no crea un buzón para recibir respuestas.

API key configurada de forma privada y modo Resend activo en desarrollo. La prueba externa autorizada figura entregada. Pendiente: hosting y URL pública HTTPS para imágenes y bajas. Localhost puede enviar por la API de Resend, pero no ofrece enlaces accesibles a los destinatarios; el panel muestra esta limitación. Producción conserva el requisito de origen público HTTPS.
