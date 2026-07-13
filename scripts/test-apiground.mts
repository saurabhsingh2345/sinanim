import { groundDSL } from '../lib/runner';

const mk = (url: string, response: string) => ({
  title: 't', fps: 30, width: 1920, height: 1080, backgroundColor: '#000',
  scenes: [{ type: 'api', method: 'GET', url, status: 999, statusText: 'AUTHORED', response, startTime: 0, duration: 5 }],
} as any);

process.env.LLM_GROUND_API = '1';

// 1) real reachable API → replaced
const real = await groundDSL(mk('https://httpbin.org/json', '{ "authored": true }'));
const rs = real.dsl.scenes[0] as any;
console.log('REAL: grounded=%d failures=%d status=%d', real.grounded, real.failures, rs.status);
console.log('  response starts:', JSON.stringify(rs.response.slice(0, 60)));

// 2) fictional URL → fail-soft, authored kept
const fake = await groundDSL(mk('https://api.acme-fictional-xyz.dev/v1/todos', '{ "authored": true }'));
const fs = fake.dsl.scenes[0] as any;
console.log('FAKE: grounded=%d failures=%d status=%d response=%s', fake.grounded, fake.failures, fs.status, JSON.stringify(fs.response));

// 3) flag OFF → untouched even for real URL
delete process.env.LLM_GROUND_API;
const off = await groundDSL(mk('https://httpbin.org/json', '{ "authored": true }'));
const os = off.dsl.scenes[0] as any;
console.log('OFF:  grounded=%d status=%d (should stay 999)', off.grounded, os.status);
