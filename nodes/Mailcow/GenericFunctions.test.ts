import { describe, expect, it } from 'vitest';

import {
	MailcowResponseError,
	assertHttpSuccess,
	assertMailcowSuccess,
	formatMessage,
	splitList,
	stripPrivateKey,
	toFlag,
	toRecords,
} from './GenericFunctions';
import { generatePassword, toAttributes } from './Mailcow.node';

describe('assertMailcowSuccess', () => {
	it('accepts a success list', () => {
		expect(() =>
			assertMailcowSuccess([{ type: 'success', log: ['mailbox', 'add'], msg: ['mailbox_added', 'a@b.c'] }]),
		).not.toThrow();
	});

	it('accepts read responses (arrays of records, objects, empty object)', () => {
		expect(() => assertMailcowSuccess([{ username: 'a@b.c' }])).not.toThrow();
		expect(() => assertMailcowSuccess({ version: '2026-09' })).not.toThrow();
		expect(() => assertMailcowSuccess({})).not.toThrow();
	});

	it('throws on a "danger" entry even though HTTP was 200', () => {
		const run = () => assertMailcowSuccess([{ type: 'danger', log: [], msg: ['object_exists', 'a@b.c'] }]);
		expect(run).toThrow(MailcowResponseError);
		expect(run).toThrow('object_exists a@b.c');
	});

	it('reports every failure of a mixed response', () => {
		expect(() =>
			assertMailcowSuccess([
				{ type: 'success', msg: 'ok' },
				{ type: 'error', msg: 'first' },
				{ type: 'danger', msg: ['second', 'x'] },
			]),
		).toThrow('first; second x');
	});

	it('throws on the read/write denied answer of a read-only key', () => {
		expect(() => assertMailcowSuccess({ type: 'error', msg: 'API read/write access denied' })).toThrow(
			'API read/write access denied',
		);
	});

	it('explains a non JSON body (plain HTTP redirect page)', () => {
		expect(() => assertMailcowSuccess('<html>301 Moved Permanently</html>')).toThrow(/https:\/\//);
	});
});

describe('formatMessage', () => {
	it('joins the key and its arguments', () => {
		expect(formatMessage(['domain_not_found', 'x.com'])).toBe('domain_not_found x.com');
	});
	it('handles strings and missing messages', () => {
		expect(formatMessage('plain')).toBe('plain');
		expect(formatMessage(undefined)).toBe('unknown error');
	});
});

describe('toRecords', () => {
	it('keeps arrays and drops non objects', () => {
		expect(toRecords([{ a: 1 }, null, 'x', { b: 2 }])).toEqual([{ a: 1 }, { b: 2 }]);
	});
	it('wraps a single record', () => {
		expect(toRecords({ username: 'a@b.c' })).toEqual([{ username: 'a@b.c' }]);
	});
	it('treats {} as not found', () => {
		expect(toRecords({})).toEqual([]);
	});
	it('returns nothing for scalars', () => {
		expect(toRecords('x')).toEqual([]);
		expect(toRecords(null)).toEqual([]);
	});
});

describe('toFlag / splitList', () => {
	it('maps truthy values to "1"', () => {
		expect([true, '1', 1].map(toFlag)).toEqual(['1', '1', '1']);
		expect([false, '0', 0, undefined].map(toFlag)).toEqual(['0', '0', '0', '0']);
	});
	it('splits on commas, semicolons and newlines', () => {
		expect(splitList(' a@b.c, d@e.f;g@h.i\n ,')).toEqual(['a@b.c', 'd@e.f', 'g@h.i']);
		expect(splitList(['x ', ''])).toEqual(['x']);
	});
});

describe('toAttributes', () => {
	it('converts booleans, tags and destinations', () => {
		const { attr, rateLimit } = toAttributes({
			active: false,
			sogo_visible: true,
			tags: 'vip, sales',
			goto: 'a@b.c ; d@e.f',
			quota: 2048,
		});
		expect(attr).toEqual({ active: '0', sogo_visible: '1', tags: ['vip', 'sales'], goto: 'a@b.c,d@e.f', quota: 2048 });
		expect(rateLimit).toBeUndefined();
	});

	it('pulls the rate limit out, defaulting the frame to hours', () => {
		const { attr, rateLimit } = toAttributes({ name: 'Ana', rl_value: 100 });
		expect(attr).toEqual({ name: 'Ana' });
		expect(rateLimit).toEqual({ rl_value: '100', rl_frame: 'h' });
	});

	it('turns the send-as list into an array', () => {
		expect(toAttributes({ sender_acl: 'info@x.com, x.com' }).attr).toEqual({ sender_acl: ['info@x.com', 'x.com'] });
	});
});

describe('generatePassword', () => {
	it('returns the requested length from the unambiguous alphabet', () => {
		const password = generatePassword(32);
		expect(password).toHaveLength(32);
		expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
	});
	it('does not repeat', () => {
		expect(generatePassword(20)).not.toBe(generatePassword(20));
	});
});

describe('assertHttpSuccess', () => {
	it('passes 2xx and 3xx', () => {
		expect(() => assertHttpSuccess(200, [])).not.toThrow();
	});

	it('keeps mailcow\'s message on a 403 from a read-only key', () => {
		const run = () => assertHttpSuccess(403, { type: 'error', msg: 'API read/write access denied' });
		expect(run).toThrow(MailcowResponseError);
		expect(run).toThrow('mailcow answered HTTP 403: API read/write access denied. The key is read-only');
	});

	it('parses a JSON string body and hints at the allowed IPs on 401', () => {
		expect(() => assertHttpSuccess(401, '{"type":"error","msg":"authentication failed"}')).toThrow(
			/HTTP 401: authentication failed\. .*Allow API access from/,
		);
	});

	it('copes with a body that is not JSON', () => {
		expect(() => assertHttpSuccess(502, '<html>Bad Gateway</html>')).toThrow(
			'mailcow answered HTTP 502: no message in the response.',
		);
	});
});

describe('stripPrivateKey', () => {
	it('drops privkey and keeps the public data', () => {
		expect(stripPrivateKey([{ pubkey: 'p', dkim_txt: 'v=DKIM1', privkey: 'SECRET' }])).toEqual([
			{ pubkey: 'p', dkim_txt: 'v=DKIM1' },
		]);
	});
});
