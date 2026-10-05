import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';

import { mailcowApiRequest, toRecords } from '../Mailcow/GenericFunctions';
import { EVENTS, diffRecords } from './poll';

/**
 * Polls mailcow for new records.
 *
 * mailcow has no webhooks, so this compares the list endpoints between polls. A read-only API
 * key is enough.
 */
export class MailcowTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Mailcow Trigger',
		name: 'mailcowTrigger',
		icon: 'file:mailcow.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Start a workflow when mailcow gets a new mailbox, alias, domain or quarantined message',
		defaults: { name: 'Mailcow Trigger' },
		inputs: [],
		outputs: ['main'],
		polling: true,
		credentials: [{ name: 'mailcowApi', required: true }],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				default: 'newQuarantineItem',
				options: [
					{ name: 'New Alias', value: 'newAlias' },
					{ name: 'New Domain', value: 'newDomain' },
					{ name: 'New Mailbox', value: 'newMailbox' },
					{
						name: 'New Quarantined Message',
						value: 'newQuarantineItem',
						description: 'A message was held in quarantine by Rspamd',
					},
				],
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = EVENTS[this.getNodeParameter('event') as string];
		const records = toRecords(await mailcowApiRequest.call(this, 'GET', event.endpoint));

		// "Fetch Test Event": return the most recent record without touching the stored state.
		if (this.getMode() === 'manual') {
			const latest = records[records.length - 1];
			return latest ? [[{ json: latest }]] : null;
		}

		const staticData = this.getWorkflowStaticData('node') as { seen?: string[] };
		const { fresh, seen } = diffRecords(records, event.key, staticData.seen);
		staticData.seen = seen;

		if (!fresh.length) return null;
		return [fresh.map((record: IDataObject) => ({ json: record }))];
	}
}
