import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { readConfig } from './config.js';
import { resendSender } from './resend-mail.js';
import { mailFailure } from './campaign-mail.js';

// Isolated connection test: never reads customers or runs the campaign queue.
try {
  const to = z.string().email().parse(process.argv[2] ?? 'delivered@resend.dev');
  const config = readConfig();
  const text = 'Prueba de conexión de El Tumi con Resend. Este mensaje confirma la prueba de envío desde el CRM local. No contiene una promoción ni registra un canje.';
  const id = await resendSender(config)({ to, subject: 'El Tumi — prueba de correo', text,
    html: `<html lang="es"><body><h1>El Tumi</h1><p>${text}</p></body></html>`, messageId: `<test-${randomUUID()}@restauranteeltumi.space>` });
  console.log(`Resend aceptó el mensaje. ID: ${id}`);
  console.log(to.endsWith('@resend.dev') ? 'Destino de simulación de Resend; no confirma recepción en una bandeja personal.' : 'Revisa la bandeja de entrada y spam del destinatario indicado.');
} catch (error) {
  console.error('No se completó la prueba.', error instanceof z.ZodError ? 'Indica un destinatario válido.' : mailFailure(error).detail);
  process.exitCode = 1;
}
