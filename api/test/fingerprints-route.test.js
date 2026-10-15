const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/index');

test('GET /v1/fingerprints/summary trả về đúng thống kê', async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/fingerprints/summary`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.ok(data.distinct_gpus > 500, 'Số GPU phải lớn hơn 500');
    assert.ok(data.user_agents > 50, 'Số User-Agents phải lớn hơn 50');
  } finally {
    server.close();
  }
});

test('GET /v1/fingerprints/webgl.json trả về file hợp lệ', async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/fingerprints/webgl.json`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type').includes('application/json'), true);
    const data = await res.json();
    assert.ok(Array.isArray(data));
    assert.ok(data.length > 500);
    assert.ok(data[0].UnmaskedRenderer, 'Mẫu đầu tiên phải có UnmaskedRenderer');
  } finally {
    server.close();
  }
});
