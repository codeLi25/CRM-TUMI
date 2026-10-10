import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resendSender } from '../src/resend-mail.js';
import { mailFailure } from '../src/campaign-mail.js';
import { readConfig, campaignWarning, type Config } from '../src/config.js';

const config = { RESEND_API_KEY: 're_fixture_only', RESEND_FROM: 'El Tumi <promociones@restaurant.example>', RESEND_REPLY_TO: 'contacto@restaurant.example' } as Config;
const message = { to: 'subscriber@example.test', subject: 'Promoción', html: '<p>Oferta con baja</p>', text: 'Oferta con baja', messageId: '<recipient-id@restaurant.example>' };

test('Resend sends a single recipient, both formats and stable idempotency; stores provider ID', async () => {
  const calls: RequestInit[] = [];
  const send = resendSender(config, async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails'); calls.push(options!);
    return new Response(JSON.stringify({ id: 'provider-email-id' }), { status: 200 });
  });
  assert.equal(await send(message), 'provider-email-id'); await send(message);
  const headers = calls[0].headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${config.RESEND_API_KEY}`);
  assert.equal(headers['Idempotency-Key'], (calls[1].headers as Record<string, string>)['Idempotency-Key']);
  assert.equal(calls[0].redirect, 'error'); assert.ok(calls[0].signal);
  assert.deepEqual(JSON.parse(calls[0].body as string), { from: config.RESEND_FROM, to: [message.to], subject: message.subject, html: message.html, text: message.text, reply_to: config.RESEND_REPLY_TO });
});

test('Resend failures preserve ambiguity, retry rate limits and do not expose response secrets', async () => {
  for (const [code, status] of [[429, 'pending'], [401, 'failed'], [403, 'failed'], [422, 'failed'], [409, 'uncertain'], [500, 'uncertain']] as const) {
    const send = resendSender(config, async () => new Response('sensitive provider detail', { status: code }));
    await assert.rejects(send(message), error => { const result = mailFailure(error); assert.equal(result.status, status); assert.ok(!result.detail.includes('sensitive')); return true; });
  }
  for (const request of [async () => { throw new Error('network secret'); }, async () => new Response('{}'), async () => new Response('invalid JSON')]) {
    await assert.rejects(resendSender(config, request)(message), error => { assert.equal(mailFailure(error).status, 'uncertain'); return true; });
  }
});

test('Resend configuration requires secrets, own sender and public HTTPS links without leaking values', () => {
  const old = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: 'production', DATABASE_URL: 'mysql://test:test@localhost/test', CAMPAIGN_MAIL_MODE: 'resend', RESEND_API_KEY: 're_fixture_only', RESEND_FROM: config.RESEND_FROM, RESEND_REPLY_TO: '', APP_ORIGIN: 'https://restaurant.example' });
    assert.equal(readConfig().CAMPAIGN_MAIL_MODE, 'resend');
    for (const [key, value] of [['RESEND_API_KEY', ''], ['RESEND_FROM', 'onboarding@resend.dev'], ['RESEND_FROM', 'bad'], ['RESEND_REPLY_TO', 'bad'], ['APP_ORIGIN', 'http://localhost:5173'], ['APP_ORIGIN', 'https://127.0.0.1'], ['APP_ORIGIN', 'https://10.0.0.1']]) {
      const previous = process.env[key]; process.env[key] = value;
      assert.throws(() => readConfig()); process.env[key] = previous;
    }
    process.env.NODE_ENV = 'development'; process.env.APP_ORIGIN = 'http://localhost:5173';
    assert.match(campaignWarning(readConfig())!, /Envío real.*local/);
    process.env.APP_ORIGIN = 'https://restaurant.example';
    assert.equal(campaignWarning(readConfig()), null);
  } finally { for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key]; Object.assign(process.env, old); }
});
