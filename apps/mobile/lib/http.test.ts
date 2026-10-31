import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildApiHeaders } from './http.ts';

describe('phone API headers', () => {
  it('sends the session token and client tag on every call', () => {
    const headers = buildApiHeaders({ method: 'DELETE', token: 'tok' });
    assert.equal(headers.Authorization, 'Bearer tok');
    assert.equal(headers['X-Cyprus-Client'], 'ios');
    assert.equal(headers.Accept, 'application/json');
    assert.equal(headers['Content-Type'], 'application/json');
  });

  it('drops Content-Type from GET and HEAD, even when the caller set it', () => {
    for (const method of ['get', 'HEAD']) {
      const headers = buildApiHeaders({ method, token: null, headers: { 'content-type': 'application/json' } });
      assert.equal(headers['Content-Type'], undefined);
      assert.equal(headers['content-type'], undefined);
    }
  });

  it('defaults to GET when no method is given', () => {
    assert.equal(buildApiHeaders({ token: 't' })['Content-Type'], undefined);
  });

  it('leaves out the token for public calls, including one the caller passed', () => {
    const headers = buildApiHeaders({ method: 'POST', token: 'tok', auth: false, headers: { Authorization: 'Bearer old' } });
    assert.equal(headers.Authorization, undefined);
  });

  it('keeps caller headers, whether given as an object, a Headers or pairs', () => {
    assert.equal(buildApiHeaders({ headers: { 'X-Test': '1' } })['X-Test'], '1');
    assert.equal(buildApiHeaders({ headers: [['X-Test', '2']] })['X-Test'], '2');
    assert.equal(buildApiHeaders({ headers: new Headers({ 'X-Test': '3' }) })['x-test'], '3');
  });

  it("doesn't override a caller's own client tag or Accept", () => {
    const headers = buildApiHeaders({ headers: { 'x-cyprus-client': 'ios-qa', accept: 'text/plain' } });
    assert.equal(headers['X-Cyprus-Client'], undefined);
    assert.equal(headers['x-cyprus-client'], 'ios-qa');
    assert.equal(headers.Accept, undefined);
  });

  it('sends no Authorization at all when signed out', () => {
    assert.equal(buildApiHeaders({ method: 'POST', token: null }).Authorization, undefined);
  });
});
