import type { IDataObject } from 'n8n-workflow';

export interface TriggerEvent {
	endpoint: string;
	/** Field that identifies a record across polls. */
	key: (record: IDataObject) => string | undefined;
}

export const EVENTS: Record<string, TriggerEvent> = {
	newAlias: { endpoint: 'get/alias/all', key: (r) => str(r.id) },
	newDomain: { endpoint: 'get/domain/all', key: (r) => str(r.domain_name ?? r.domain) },
	newMailbox: { endpoint: 'get/mailbox/all', key: (r) => str(r.username) },
	newQuarantineItem: { endpoint: 'get/quarantine/all', key: (r) => str(r.id) },
};

/** Upper bound for the remembered keys, so the workflow static data cannot grow forever. */
export const MAX_SEEN = 10000;

const str = (value: unknown) => (value === undefined || value === null || value === '' ? undefined : String(value));

/**
 * Compare the current records with the keys seen in the previous poll.
 *
 * mailcow has no webhooks and its list endpoints have no "since" filter, so the trigger keeps
 * the keys it has already seen. On the very first poll (`seen` undefined) everything is taken as
 * known and nothing fires, otherwise activating the workflow would replay every existing
 * mailbox or quarantined message.
 *
 * `seen` keeps only the keys that still exist, so deleted records do not pile up.
 */
export function diffRecords(
	records: IDataObject[],
	key: TriggerEvent['key'],
	seen: string[] | undefined,
): { fresh: IDataObject[]; seen: string[] } {
	const current: string[] = [];
	const fresh: IDataObject[] = [];
	const known = new Set(seen ?? []);

	for (const record of records) {
		const id = key(record);
		if (id === undefined) continue;
		current.push(id);
		if (seen !== undefined && !known.has(id)) fresh.push(record);
	}

	return { fresh, seen: current.slice(-MAX_SEEN) };
}
