import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type AddressInfo } from 'node:net';
import { createMailer } from '../src/mail.js';
import { campaignSender } from '../src/campaign-mail.js';
import type { Config } from '../src/config.js';

test('recovery adapter delivers a single-use link over SMTP', async () => {
  let message = '';
  const server = createServer(socket => {
    socket.setEncoding('utf8'); socket.write('220 localhost test SMTP\r\n');
    let buffer = '', data = false;
    socket.on('data', chunk => {
      buffer += chunk;
      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n'), line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        if (data) {
          if (line === '.') { data = false; socket.write('250 queued\r\n'); }
          else message += line + '\r\n';
        } else if (/^EHLO/.test(line)) socket.write('250-localhost\r\n250 8BITMIME\r\n');
        else if (/^DATA/.test(line)) { data = true; socket.write('354 send message\r\n'); }
        else if (/^QUIT/.test(line)) socket.end('221 bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const send = createMailer({ SMTP_HOST: '127.0.0.1', SMTP_PORT: (server.address() as AddressInfo).port,
      SMTP_SECURE: 'false', SMTP_FROM: 'El Tumi <test@example.test>', APP_ORIGIN: 'http://localhost:5173' } as Config);
    await send('recipient@example.test', 'a'.repeat(64));
    const decoded = message.replace(/=\r\n/g, '').replace(/=3D/g, '=');
    assert.match(decoded, /To: recipient@example.test/);
    assert.ok(decoded.includes('/admin/restablecer#token=' + 'a'.repeat(64)));
    assert.ok(!decoded.includes('?token='));
    message = '';
    const campaign = campaignSender({ SMTP_HOST: '127.0.0.1', SMTP_PORT: (server.address() as AddressInfo).port,
      SMTP_SECURE: 'false', SMTP_FROM: 'El Tumi <test@example.test>' } as Config);
    const messageId = await campaign({ to: 'recipient@example.test', subject: 'Oferta de prueba', html: '<h1>Oferta Tumi</h1>', text: 'Oferta Tumi', messageId: '<campaign-test@localhost>' });
    assert.equal(messageId, '<campaign-test@localhost>');
    assert.match(message, /multipart\/alternative/);
    assert.match(message, /Oferta Tumi/);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
