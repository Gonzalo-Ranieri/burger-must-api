import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyMpSignature } from '../src/controllers/pagos.controller.js';

function firmar(secret, { dataId, requestId, ts }) {
  const manifest = `id:${dataId};request-id:${requestId ?? ''};ts:${ts};`;
  return crypto.createHmac('sha256', secret).update(manifest).digest('hex');
}

describe('verifyMpSignature', () => {
  const ENV_ANTES = { ...process.env };

  after(() => {
    process.env = { ...ENV_ANTES };
  });

  test('acepta una firma válida', () => {
    process.env.MP_WEBHOOK_SECRET = 'secreto-de-prueba';
    process.env.NODE_ENV = 'production';

    const ts = '1700000000';
    const requestId = 'req-123';
    const dataId = '456';
    const v1 = firmar('secreto-de-prueba', { dataId, requestId, ts });

    const req = { headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId } };
    assert.equal(verifyMpSignature(req, dataId), true);
  });

  test('rechaza una firma con secreto incorrecto', () => {
    process.env.MP_WEBHOOK_SECRET = 'secreto-de-prueba';
    process.env.NODE_ENV = 'production';

    const ts = '1700000000';
    const requestId = 'req-123';
    const dataId = '456';
    const v1 = firmar('otro-secreto', { dataId, requestId, ts });

    const req = { headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId } };
    assert.equal(verifyMpSignature(req, dataId), false);
  });

  test('rechaza cuando no hay header x-signature', () => {
    process.env.MP_WEBHOOK_SECRET = 'secreto-de-prueba';
    process.env.NODE_ENV = 'production';

    const req = { headers: {} };
    assert.equal(verifyMpSignature(req, '456'), false);
  });

  test('en producción rechaza si falta MP_WEBHOOK_SECRET', () => {
    delete process.env.MP_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'production';

    const req = { headers: { 'x-signature': 'ts=1,v1=deadbeef' } };
    assert.equal(verifyMpSignature(req, '456'), false);
  });

  test('fuera de producción permite pasar si falta MP_WEBHOOK_SECRET (dev)', () => {
    delete process.env.MP_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'development';

    const req = { headers: {} };
    assert.equal(verifyMpSignature(req, '456'), true);
  });
});
