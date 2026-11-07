// What the office checks before it trusts AWS: that the Odds' role cannot
// read a secret's value (and that a value it could read is dropped unread),
// the access portal URL and Regions the owner types, and how the Odds' AWS
// tool starts, and that no run inherits the owner's own AWS settings. Run
// with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkNoValueRead,
  jsonKeys,
  listProblem,
  proxyArgs,
  regionProblem,
  secretNamesClient,
  startProblem,
  startUrlProblem
} from './aws.ts';
import { cleanEnv } from './claude.ts';

const denied = () => Promise.reject(Object.assign(new Error('denied'), { name: 'AccessDenied' }));

test('a role AWS refuses a value to passes, naming the secret it tried', async () => {
  const tried: string[] = [];
  const r = await checkNoValueRead(
    async () => ['prod/stripe', 'prod/slack'],
    (name) => {
      tried.push(name);
      return denied();
    }
  );
  assert.deepEqual(r, { ok: true, checked: 'prod/stripe' });
  assert.deepEqual(tried, ['prod/stripe']);
});

test('a role that gets a value back fails, and the value goes nowhere', async () => {
  const value = 'sk_live_never_shown';
  const r = await checkNoValueRead(
    async () => ['prod/stripe'],
    async () => ({ SecretString: value })
  );
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes(value), 'the result never carries the value');
});

test('with no secrets, or no listing, the check says it could not run', async () => {
  const none = await checkNoValueRead(async () => [], denied);
  assert.ok(none.ok && 'unchecked' in none && /no secrets yet/.test(none.unchecked));
  const unlisted = await checkNoValueRead(() => Promise.reject(new Error('denied')), denied);
  assert.ok(unlisted.ok && 'unchecked' in unlisted && /cannot list/.test(unlisted.unchecked));
});

test('the portal URL must be https and a Region must look like one', () => {
  assert.equal(startUrlProblem('https://acme.awsapps.com/start'), undefined);
  assert.ok(startUrlProblem('http://acme.awsapps.com/start'));
  assert.ok(startUrlProblem('acme'));
  assert.equal(regionProblem('us-east-1'), undefined);
  assert.equal(regionProblem('ap-southeast-2'), undefined);
  assert.ok(regionProblem('us-east'));
  assert.ok(regionProblem('US-EAST-1'));
});

test("the Odds' tool goes to AWS's MCP Server in the work Region, or us-east-1 where it has none", () => {
  const [proxy, near, , region] = proxyArgs('eu-west-1');
  assert.match(proxy, /^mcp-proxy-for-aws-cli@\d+\.\d+\.\d+$/, 'the proxy is pinned');
  assert.equal(near, 'https://aws-mcp.eu-west-1.api.aws/mcp');
  assert.equal(region, 'AWS_REGION=eu-west-1');
  const [, far, , farRegion] = proxyArgs('ca-central-1');
  assert.equal(far, 'https://aws-mcp.us-east-1.api.aws/mcp');
  assert.equal(farRegion, 'AWS_REGION=ca-central-1');
});

test('AWS Secrets Manager gives an Odd one tool, which lists names and only reads', async () => {
  const client = await secretNamesClient(async () => [
    { name: 'prod/stripe', description: 'Stripe live key' },
    { name: 'prod/slack', description: '' }
  ]);
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name),
      ['list_secret_names']
    );
    assert.equal(tools[0].annotations?.readOnlyHint, true);
    const r = (await client.callTool({ name: 'list_secret_names', arguments: {} })) as {
      content: { text: string }[];
    };
    assert.equal(r.content[0].text, 'prod/stripe: Stripe live key\nprod/slack');
    const other = await client.callTool({ name: 'get_secret_value', arguments: {} });
    assert.equal(other.isError, true, 'there is no tool for a value');
  } finally {
    await client.close();
  }
});

test('a Region the organization blocks says to pick the Region the secrets are in', () => {
  const scp = new Error(
    'User: x is not authorized to perform: secretsmanager:ListSecrets with an explicit deny in a service control policy: p-1'
  );
  assert.match(listProblem(scp, 'us-east-1'), /organization blocks us-east-1\. Pick the Region/);
  const plain = Object.assign(new Error('not authorized'), { name: 'AccessDeniedException' });
  assert.match(listProblem(plain, 'us-east-2'), /cannot list secrets in us-east-2/);
});

test('a key/value secret offers the names that hold text, and a plain one none', () => {
  assert.deepEqual(jsonKeys('{"OPEN_BRAIN_MCP_ACCESS_KEY":"v","port":5}'), [
    'OPEN_BRAIN_MCP_ACCESS_KEY'
  ]);
  assert.deepEqual(jsonKeys('sk-plain-value'), []);
  assert.deepEqual(jsonKeys('["a"]'), []);
  assert.deepEqual(jsonKeys(undefined), []);
});

test("a missing uv says to install it, and any other start failure says what AWS's tool said", () => {
  assert.match(startProblem(new Error('spawn uvx ENOENT')), /Install uv/);
  assert.match(startProblem(new Error('Connection closed')), /did not start: Connection closed/);
});

test("no run or tool server inherits the owner's own AWS settings", () => {
  const before = { profile: process.env.AWS_PROFILE, key: process.env.AWS_ACCESS_KEY_ID };
  process.env.AWS_PROFILE = 'owner-admin';
  process.env.AWS_ACCESS_KEY_ID = 'AKIAOWNERS';
  try {
    const env = cleanEnv();
    assert.ok(!Object.keys(env).some((k) => k.startsWith('AWS_')), Object.keys(env).join(' '));
  } finally {
    if (before.profile === undefined) delete process.env.AWS_PROFILE;
    else process.env.AWS_PROFILE = before.profile;
    if (before.key === undefined) delete process.env.AWS_ACCESS_KEY_ID;
    else process.env.AWS_ACCESS_KEY_ID = before.key;
  }
});
