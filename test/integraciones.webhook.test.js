import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { verificarSecretoIntegracion } from '../src/controllers/integraciones.controller.js';

describe('verificarSecretoIntegracion', () => {
  const ENV_ANTES = { ...process.env };

  after(() => {
    process.env = { ...ENV_ANTES };
  });

  test('rechaza cuando la plataforma no tiene secreto configurado', () => {
    delete process.env.INTEGRACION_SECRET_RAPPI;
    const req = { headers: { 'x-integration-secret': 'lo-que-sea' } };
    assert.equal(verificarSecretoIntegracion('rappi', req), false);
  });

  test('rechaza cuando el header no coincide', () => {
    process.env.INTEGRACION_SECRET_RAPPI = 'secreto-rappi';
    const req = { headers: { 'x-integration-secret': 'otro-valor' } };
    assert.equal(verificarSecretoIntegracion('rappi', req), false);
  });

  test('rechaza cuando falta el header', () => {
    process.env.INTEGRACION_SECRET_RAPPI = 'secreto-rappi';
    const req = { headers: {} };
    assert.equal(verificarSecretoIntegracion('rappi', req), false);
  });

  test('acepta cuando el secreto coincide', () => {
    process.env.INTEGRACION_SECRET_RAPPI = 'secreto-rappi';
    const req = { headers: { 'x-integration-secret': 'secreto-rappi' } };
    assert.equal(verificarSecretoIntegracion('rappi', req), true);
  });
});
