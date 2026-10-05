import { describe, expect, it } from 'vitest';

import { EVENTS, MAX_SEEN, diffRecords } from './poll';

const mailboxes = (...names: string[]) => names.map((username) => ({ username }));

describe('diffRecords', () => {
	const key = EVENTS.newMailbox.key;

	it('fires nothing on the first poll and remembers what exists', () => {
		const { fresh, seen } = diffRecords(mailboxes('a@x.com', 'b@x.com'), key, undefined);
		expect(fresh).toEqual([]);
		expect(seen).toEqual(['a@x.com', 'b@x.com']);
	});

	it('fires only the records that were not seen', () => {
		const { fresh, seen } = diffRecords(mailboxes('a@x.com', 'b@x.com', 'c@x.com'), key, ['a@x.com', 'b@x.com']);
		expect(fresh).toEqual(mailboxes('c@x.com'));
		expect(seen).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
	});

	it('forgets deleted records, so a recreated one fires again', () => {
		const afterDelete = diffRecords(mailboxes('a@x.com'), key, ['a@x.com', 'b@x.com']);
		expect(afterDelete.seen).toEqual(['a@x.com']);
		const afterRecreate = diffRecords(mailboxes('a@x.com', 'b@x.com'), key, afterDelete.seen);
		expect(afterRecreate.fresh).toEqual(mailboxes('b@x.com'));
	});

	it('fires everything when the previous poll saw an empty list', () => {
		expect(diffRecords(mailboxes('a@x.com'), key, []).fresh).toEqual(mailboxes('a@x.com'));
	});

	it('skips records without a key', () => {
		expect(diffRecords([{ username: '' }, { other: 1 }], key, []).fresh).toEqual([]);
	});

	it('caps the remembered keys', () => {
		const many = Array.from({ length: MAX_SEEN + 5 }, (_, n) => ({ id: n }));
		expect(diffRecords(many, EVENTS.newAlias.key, undefined).seen).toHaveLength(MAX_SEEN);
	});
});

describe('EVENTS keys', () => {
	it('reads the identifying field of each record type', () => {
		expect(EVENTS.newAlias.key({ id: 12 })).toBe('12');
		expect(EVENTS.newDomain.key({ domain_name: 'x.com' })).toBe('x.com');
		expect(EVENTS.newQuarantineItem.key({ id: 7 })).toBe('7');
	});
});
