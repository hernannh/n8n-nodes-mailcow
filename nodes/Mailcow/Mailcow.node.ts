import { randomBytes } from 'crypto';

import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import {
	aliasProperties,
	appPasswordProperties,
	dkimProperties,
	domainProperties,
	logProperties,
	mailboxProperties,
	quarantineProperties,
	queueProperties,
	resourceProperty,
	statusProperties,
} from './descriptions';
import {
	MailcowResponseError,
	mailcowApiRequest,
	splitList,
	stripPrivateKey,
	toFlag,
	toRecords,
} from './GenericFunctions';

const BOOLEAN_FIELDS = new Set([
	'active',
	'backupmx',
	'force_pw_update',
	'relay_all_recipients',
	'sogo_access',
	'sogo_visible',
	'tls_enforce_in',
	'tls_enforce_out',
]);

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Random password from an unambiguous alphabet. Rejection sampling keeps it unbiased. */
export function generatePassword(length: number): string {
	const out: string[] = [];
	const limit = 256 - (256 % PASSWORD_ALPHABET.length);
	while (out.length < length) {
		for (const byte of randomBytes(length * 2)) {
			if (byte < limit && out.length < length) out.push(PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]);
		}
	}
	return out.join('');
}

/**
 * Turn the fields of an n8n collection into mailcow attributes: booleans become "1"/"0",
 * tags become a list, and the rate limit pair is pulled out because mailbox rate limits
 * go through a different endpoint.
 */
export function toAttributes(fields: IDataObject): { attr: IDataObject; rateLimit?: IDataObject } {
	const attr: IDataObject = {};
	let rateLimit: IDataObject | undefined;

	for (const [key, value] of Object.entries(fields)) {
		if (key === 'rl_value' || key === 'rl_frame') continue;
		if (BOOLEAN_FIELDS.has(key)) attr[key] = toFlag(value);
		else if (key === 'tags' || key === 'sender_acl') attr[key] = splitList(value);
		else if (key === 'goto') attr[key] = splitList(value).join(',');
		else attr[key] = value;
	}

	if (fields.rl_value !== undefined) {
		rateLimit = { rl_value: String(fields.rl_value), rl_frame: (fields.rl_frame as string) ?? 'h' };
	}
	return { attr, rateLimit };
}

export class Mailcow implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Mailcow',
		name: 'mailcow',
		icon: 'file:mailcow.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Manage a mailcow mail server: domains, mailboxes, aliases, quarantine and more',
		defaults: { name: 'Mailcow' },
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		credentials: [{ name: 'mailcowApi', required: true }],
		properties: [
			resourceProperty,
			...aliasProperties,
			...appPasswordProperties,
			...dkimProperties,
			...domainProperties,
			...logProperties,
			...mailboxProperties,
			...quarantineProperties,
			...queueProperties,
			...statusProperties,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const records = await runOperation.call(this, resource, operation, i);
				for (const record of records) out.push({ json: record, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof MailcowResponseError) {
					throw new NodeOperationError(this.getNode(), error.message, { itemIndex: i });
				}
				if (error instanceof NodeOperationError) throw error;
				throw new NodeApiError(this.getNode(), error as never, { itemIndex: i });
			}
		}

		return [out];
	}
}

async function limitResults(this: IExecuteFunctions, records: IDataObject[], i: number) {
	if (this.getNodeParameter('returnAll', i, false) as boolean) return records;
	return records.slice(0, this.getNodeParameter('limit', i, 50) as number);
}

function dkimOutput(this: IExecuteFunctions, records: IDataObject[], i: number) {
	return this.getNodeParameter('includePrivateKey', i, false) ? records : stripPrivateKey(records);
}

/** mailcow answers writes with `[{ type, log, msg }]`; that list is the useful output. */
const writeResult = (response: unknown) => toRecords(response);

async function runOperation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	const param = (name: string) => this.getNodeParameter(name, i) as string;
	const enc = encodeURIComponent;

	switch (`${resource}:${operation}`) {
		/* domain */
		case 'domain:getAll':
			return limitResults.call(this, toRecords(await mailcowApiRequest.call(this, 'GET', 'get/domain/all')), i);
		case 'domain:get':
			return toRecords(await mailcowApiRequest.call(this, 'GET', `get/domain/${enc(param('domain'))}`));
		case 'domain:create': {
			const { attr, rateLimit } = toAttributes(this.getNodeParameter('additionalFields', i) as IDataObject);
			await mailcowApiRequest.call(this, 'POST', 'add/domain', { domain: param('domain'), ...attr, ...rateLimit });
			return toRecords(await mailcowApiRequest.call(this, 'GET', `get/domain/${enc(param('domain'))}`));
		}
		case 'domain:update': {
			const { attr, rateLimit } = toAttributes(this.getNodeParameter('updateFields', i) as IDataObject);
			return writeResult(
				await mailcowApiRequest.call(this, 'POST', 'edit/domain', {
					items: [param('domain')],
					attr: { ...attr, ...rateLimit },
				}),
			);
		}
		case 'domain:delete':
			return writeResult(await mailcowApiRequest.call(this, 'POST', 'delete/domain', [param('domain')]));

		/* mailbox */
		case 'mailbox:getAll': {
			const domain = (this.getNodeParameter('filterDomain', i, '') as string).trim();
			const path = domain ? `get/mailbox/all/${enc(domain)}` : 'get/mailbox/all';
			return limitResults.call(this, toRecords(await mailcowApiRequest.call(this, 'GET', path)), i);
		}
		case 'mailbox:get':
			return toRecords(await mailcowApiRequest.call(this, 'GET', `get/mailbox/${enc(param('email'))}`));
		case 'mailbox:create': {
			const email = param('email').trim();
			const at = email.lastIndexOf('@');
			if (at < 1 || at === email.length - 1) {
				throw new NodeOperationError(this.getNode(), `"${email}" is not a valid email address`, { itemIndex: i });
			}
			const given = param('password');
			const password = given || generatePassword(20);
			const { attr, rateLimit } = toAttributes(this.getNodeParameter('additionalFields', i) as IDataObject);

			await mailcowApiRequest.call(this, 'POST', 'add/mailbox', {
				active: '1',
				...attr,
				local_part: email.slice(0, at),
				domain: email.slice(at + 1),
				name: param('name'),
				quota: String(this.getNodeParameter('quota', i)),
				password,
				password2: password,
			});
			// add/mailbox answers "rl_saved" but leaves the mailbox without a rate limit.
			if (rateLimit && Number(rateLimit.rl_value) > 0) {
				await mailcowApiRequest.call(this, 'POST', 'edit/rl-mbox', { items: [email], attr: rateLimit });
			}
			const [created] = toRecords(await mailcowApiRequest.call(this, 'GET', `get/mailbox/${enc(email)}`));
			return [given ? { ...created } : { ...created, generated_password: password }];
		}
		case 'mailbox:update': {
			const { attr, rateLimit } = toAttributes(this.getNodeParameter('updateFields', i) as IDataObject);
			const email = param('email');
			const results: IDataObject[] = [];
			if (attr.password) attr.password2 = attr.password;
			if (Object.keys(attr).length) {
				results.push(...writeResult(await mailcowApiRequest.call(this, 'POST', 'edit/mailbox', { items: [email], attr })));
			}
			if (rateLimit) {
				results.push(
					...writeResult(await mailcowApiRequest.call(this, 'POST', 'edit/rl-mbox', { items: [email], attr: rateLimit })),
				);
			}
			if (!results.length) throw new NodeOperationError(this.getNode(), 'Add at least one field to update', { itemIndex: i });
			return results;
		}
		case 'mailbox:delete':
			return writeResult(await mailcowApiRequest.call(this, 'POST', 'delete/mailbox', [param('email')]));

		/* alias */
		case 'alias:getAll':
			return limitResults.call(this, toRecords(await mailcowApiRequest.call(this, 'GET', 'get/alias/all')), i);
		case 'alias:get':
			return toRecords(await mailcowApiRequest.call(this, 'GET', `get/alias/${enc(param('aliasId'))}`));
		case 'alias:create': {
			const { attr } = toAttributes(this.getNodeParameter('additionalFields', i) as IDataObject);
			return writeResult(
				await mailcowApiRequest.call(this, 'POST', 'add/alias', {
					// mailcow stores a missing sogo_visible as 0, while its UI and this node default to visible.
					active: '1',
					sogo_visible: '1',
					...attr,
					address: param('address').trim(),
					goto: splitList(param('goto')).join(','),
				}),
			);
		}
		case 'alias:update': {
			const { attr } = toAttributes(this.getNodeParameter('updateFields', i) as IDataObject);
			if (!Object.keys(attr).length) throw new NodeOperationError(this.getNode(), 'Add at least one field to update', { itemIndex: i });
			return writeResult(await mailcowApiRequest.call(this, 'POST', 'edit/alias', { items: [param('aliasId')], attr }));
		}
		case 'alias:delete':
			return writeResult(await mailcowApiRequest.call(this, 'POST', 'delete/alias', [param('aliasId')]));

		/* app password */
		case 'appPassword:getAll':
			return limitResults.call(
				this,
				toRecords(await mailcowApiRequest.call(this, 'GET', `get/app-passwd/all/${enc(param('mailbox'))}`)),
				i,
			);
		case 'appPassword:create': {
			const given = param('password');
			const password = given || generatePassword(32);
			const result = writeResult(
				await mailcowApiRequest.call(this, 'POST', 'add/app-passwd', {
					active: '1',
					username: param('mailbox'),
					app_name: param('appName'),
					// The field names are app_passwd/app_passwd2. Any other name is answered with a
					// misleading "password_complexity" error.
					app_passwd: password,
					app_passwd2: password,
					protocols: this.getNodeParameter('protocols', i) as string[],
				}),
			);
			return given ? result : result.map((entry) => ({ ...entry, generated_password: password }));
		}
		case 'appPassword:delete':
			return writeResult(await mailcowApiRequest.call(this, 'POST', 'delete/app-passwd', [param('appId')]));

		/* dkim */
		case 'dkim:get':
			return dkimOutput.call(this, toRecords(await mailcowApiRequest.call(this, 'GET', `get/dkim/${enc(param('domain'))}`)), i);
		case 'dkim:create': {
			const domain = param('domain');
			// add/domain already generates a key, and a second add/dkim is answered with the
			// misleading "dkim_domain_or_sel_invalid".
			const [existing] = toRecords(await mailcowApiRequest.call(this, 'GET', `get/dkim/${enc(domain)}`));
			if (existing?.pubkey) {
				throw new NodeOperationError(
					this.getNode(),
					`${domain} already has a DKIM key (selector "${existing.dkim_selector}"). Delete it first to replace it.`,
					{ itemIndex: i },
				);
			}
			await mailcowApiRequest.call(this, 'POST', 'add/dkim', {
				domains: domain,
				dkim_selector: param('selector'),
				key_size: String(this.getNodeParameter('keySize', i)),
			});
			return dkimOutput.call(this, toRecords(await mailcowApiRequest.call(this, 'GET', `get/dkim/${enc(domain)}`)), i);
		}
		case 'dkim:delete':
			return writeResult(await mailcowApiRequest.call(this, 'POST', 'delete/dkim', [param('domain')]));

		/* quarantine */
		case 'quarantine:getAll':
			return limitResults.call(this, toRecords(await mailcowApiRequest.call(this, 'GET', 'get/quarantine/all')), i);
		case 'quarantine:release':
		case 'quarantine:learnHam':
			return writeResult(
				await mailcowApiRequest.call(this, 'POST', 'edit/qitem', {
					items: [param('quarantineId')],
					attr: { action: operation === 'release' ? 'release' : 'learnham' },
				}),
			);
		case 'quarantine:delete':
			return writeResult(await mailcowApiRequest.call(this, 'POST', 'delete/qitem', [param('quarantineId')]));

		/* mail queue */
		case 'queue:getAll':
			return limitResults.call(this, toRecords(await mailcowApiRequest.call(this, 'GET', 'get/mailq/all')), i);
		case 'queue:flush':
			return writeResult(await mailcowApiRequest.call(this, 'POST', 'edit/mailq', { action: 'flush' }));
		case 'queue:deleteAll':
			return writeResult(await mailcowApiRequest.call(this, 'POST', 'delete/mailq', { action: 'super_delete' }));

		/* log */
		case 'log:get':
			return toRecords(
				await mailcowApiRequest.call(
					this,
					'GET',
					`get/logs/${param('logType')}/${Number(this.getNodeParameter('count', i))}`,
				),
			);

		/* status */
		case 'status:getVersion':
			return toRecords(await mailcowApiRequest.call(this, 'GET', 'get/status/version'));
		case 'status:getContainers': {
			// A map keyed by container name; one item per container is easier to filter on.
			const [byName] = toRecords(await mailcowApiRequest.call(this, 'GET', 'get/status/containers'));
			return Object.entries(byName ?? {}).map(([name, info]) => ({ name, ...(info as IDataObject) }));
		}
		case 'status:getVmail':
			return toRecords(await mailcowApiRequest.call(this, 'GET', 'get/status/vmail'));
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}" for "${resource}"`, {
		itemIndex: i,
	});
}
