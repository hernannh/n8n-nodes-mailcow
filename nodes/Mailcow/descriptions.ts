import type { INodeProperties } from 'n8n-workflow';

const show = (resource: string, operation?: string[]) => ({
	displayOptions: {
		show: operation ? { resource: [resource], operation } : { resource: [resource] },
	},
});

const RATE_FRAMES = [
	{ name: 'Per Second', value: 's' },
	{ name: 'Per Minute', value: 'm' },
	{ name: 'Per Hour', value: 'h' },
	{ name: 'Per Day', value: 'd' },
];

const returnAllAndLimit = (resource: string): INodeProperties[] => [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		...show(resource, ['getAll']),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: [resource], operation: ['getAll'], returnAll: [false] } },
	},
];

export const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	default: 'mailbox',
	options: [
		{ name: 'Alias', value: 'alias' },
		{ name: 'App Password', value: 'appPassword' },
		{ name: 'DKIM Key', value: 'dkim' },
		{ name: 'Domain', value: 'domain' },
		{ name: 'Log', value: 'log' },
		{ name: 'Mail Queue', value: 'queue' },
		{ name: 'Mailbox', value: 'mailbox' },
		{ name: 'Quarantine', value: 'quarantine' },
		{ name: 'Status', value: 'status' },
	],
};

const crudOperations = (resource: string, noun: string, defaultOperation = 'getAll'): INodeProperties => ({
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	default: defaultOperation,
	...show(resource),
	options: [
		{ name: 'Create', value: 'create', action: `Create ${noun}` },
		{ name: 'Delete', value: 'delete', action: `Delete ${noun}` },
		{ name: 'Get', value: 'get', action: `Get ${noun}` },
		{ name: 'Get Many', value: 'getAll', action: `Get many ${noun}s` },
		{ name: 'Update', value: 'update', action: `Update ${noun}` },
	],
});

/* ------------------------------------------------------------------ domain */

const domainFields = (target: 'additionalFields' | 'updateFields'): INodeProperties => ({
	displayName: target === 'additionalFields' ? 'Additional Fields' : 'Update Fields',
	name: target,
	type: 'collection',
	placeholder: 'Add Field',
	default: {},
	...show('domain', [target === 'additionalFields' ? 'create' : 'update']),
	options: [
		{ displayName: 'Active', name: 'active', type: 'boolean', default: true, description: 'Whether the domain accepts mail' },
		{ displayName: 'Backup MX', name: 'backupmx', type: 'boolean', default: false, description: 'Whether this server only relays the domain as a backup MX' },
		{ displayName: 'Default Mailbox Quota (MB)', name: 'defquota', type: 'number', default: 3072, description: 'Quota given to new mailboxes when none is set' },
		{ displayName: 'Description', name: 'description', type: 'string', default: '' },
		{ displayName: 'Max Aliases', name: 'aliases', type: 'number', default: 400 },
		{ displayName: 'Max Mailbox Quota (MB)', name: 'maxquota', type: 'number', default: 10240, description: 'Largest quota a single mailbox of the domain can have' },
		{ displayName: 'Max Mailboxes', name: 'mailboxes', type: 'number', default: 10 },
		{ displayName: 'Rate Limit Frame', name: 'rl_frame', type: 'options', default: 'h', options: RATE_FRAMES },
		{ displayName: 'Rate Limit Messages', name: 'rl_value', type: 'number', default: 0, description: 'Messages the whole domain may send per frame. 0 means no limit.' },
		{ displayName: 'Relay All Recipients', name: 'relay_all_recipients', type: 'boolean', default: false },
		{ displayName: 'Tags', name: 'tags', type: 'string', default: '', description: 'Comma-separated list of tags' },
		{ displayName: 'Total Quota (MB)', name: 'quota', type: 'number', default: 10240, description: 'Storage shared by all mailboxes of the domain' },
	],
});

export const domainProperties: INodeProperties[] = [
	crudOperations('domain', 'a domain'),
	{
		displayName: 'Domain',
		name: 'domain',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'example.com',
		...show('domain', ['create', 'delete', 'get', 'update']),
	},
	...returnAllAndLimit('domain'),
	domainFields('additionalFields'),
	domainFields('updateFields'),
];

/* ----------------------------------------------------------------- mailbox */

const mailboxRateLimit: INodeProperties[] = [
	{ displayName: 'Rate Limit Frame', name: 'rl_frame', type: 'options', default: 'h', options: RATE_FRAMES },
	{
		displayName: 'Rate Limit Messages',
		name: 'rl_value',
		type: 'number',
		default: 0,
		description:
			'Messages the mailbox may send per frame. 0 leaves it unlimited. Applied with a second call, because mailcow ignores it on create.',
	},
];

export const mailboxProperties: INodeProperties[] = [
	crudOperations('mailbox', 'a mailbox'),
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'name@example.com',
		description: 'Full address of the mailbox. The domain has to exist in mailcow.',
		...show('mailbox', ['create', 'delete', 'get', 'update']),
	},
	{
		displayName: 'Full Name',
		name: 'name',
		type: 'string',
		default: '',
		...show('mailbox', ['create']),
	},
	{
		displayName: 'Password',
		name: 'password',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		description:
			'Leave empty to generate a random 20 character password. It is returned once in the output as generated_password.',
		...show('mailbox', ['create']),
	},
	{
		displayName: 'Quota (MB)',
		name: 'quota',
		type: 'number',
		default: 3072,
		description: '0 means the domain default',
		...show('mailbox', ['create']),
	},
	{
		displayName: 'Filter by Domain',
		name: 'filterDomain',
		type: 'string',
		default: '',
		placeholder: 'example.com',
		description: 'Only return mailboxes of this domain. Empty returns every mailbox.',
		...show('mailbox', ['getAll']),
	},
	...returnAllAndLimit('mailbox'),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		...show('mailbox', ['create']),
		options: [
			{ displayName: 'Active', name: 'active', type: 'boolean', default: true },
			{ displayName: 'Enforce TLS Incoming', name: 'tls_enforce_in', type: 'boolean', default: false },
			{ displayName: 'Enforce TLS Outgoing', name: 'tls_enforce_out', type: 'boolean', default: false },
			{ displayName: 'Force Password Change', name: 'force_pw_update', type: 'boolean', default: false, description: 'Whether the user has to change the password on the next login' },
			...mailboxRateLimit,
			{ displayName: 'Tags', name: 'tags', type: 'string', default: '', description: 'Comma-separated list of tags' },
		],
	},
	{
		displayName:
			'Send As Addresses replaces the whole list. Include every address the mailbox already sends as, or they are removed.',
		name: 'senderAclNotice',
		type: 'notice',
		default: '',
		...show('mailbox', ['update']),
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		...show('mailbox', ['update']),
		options: [
			{ displayName: 'Active', name: 'active', type: 'boolean', default: true },
			{ displayName: 'Force Password Change', name: 'force_pw_update', type: 'boolean', default: false },
			{ displayName: 'Full Name', name: 'name', type: 'string', default: '' },
			{ displayName: 'Password', name: 'password', type: 'string', typeOptions: { password: true }, default: '' },
			{ displayName: 'Quota (MB)', name: 'quota', type: 'number', default: 3072 },
			...mailboxRateLimit,
			{
				displayName: 'Send As Addresses',
				name: 'sender_acl',
				type: 'string',
				default: '',
				placeholder: 'info@example.com, sales@example.com',
				description:
					'Comma-separated addresses or domains this mailbox may send as. Replaces the current list.',
			},
			{ displayName: 'SOGo Access', name: 'sogo_access', type: 'boolean', default: true, description: 'Whether the user can log in to the SOGo webmail' },
			{ displayName: 'Tags', name: 'tags', type: 'string', default: '', description: 'Comma-separated list of tags' },
		],
	},
];

/* ------------------------------------------------------------------- alias */

const aliasCommonFields: INodeProperties[] = [
	{ displayName: 'Active', name: 'active', type: 'boolean', default: true },
	{ displayName: 'Private Comment', name: 'private_comment', type: 'string', default: '' },
	{ displayName: 'Public Comment', name: 'public_comment', type: 'string', default: '' },
	{ displayName: 'Visible in SOGo', name: 'sogo_visible', type: 'boolean', default: true, description: 'Whether users can pick the alias as sender in SOGo' },
];

export const aliasProperties: INodeProperties[] = [
	crudOperations('alias', 'an alias'),
	{
		displayName: 'Alias ID',
		name: 'aliasId',
		type: 'string',
		required: true,
		default: '',
		description: 'Numeric ID of the alias, as returned by Get Many',
		...show('alias', ['delete', 'get', 'update']),
	},
	{
		displayName: 'Address',
		name: 'address',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'info@example.com',
		description: 'Alias address. Use @example.com for a catch-all.',
		...show('alias', ['create']),
	},
	{
		displayName: 'Destinations',
		name: 'goto',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'ana@example.com, juan@example.com',
		description: 'Comma-separated addresses that receive the mail sent to the alias',
		...show('alias', ['create']),
	},
	...returnAllAndLimit('alias'),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		...show('alias', ['create']),
		options: aliasCommonFields,
	},
	{
		displayName:
			'Changing Destinations also resets who can send as this alias: mailcow rebuilds that list and the mailboxes that could send as the alias lose the permission. Check it afterwards.',
		name: 'gotoNotice',
		type: 'notice',
		default: '',
		...show('alias', ['update']),
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		...show('alias', ['update']),
		options: [
			...aliasCommonFields,
			{ displayName: 'Address', name: 'address', type: 'string', default: '' },
			{ displayName: 'Destinations', name: 'goto', type: 'string', default: '', description: 'Comma-separated addresses' },
		],
	},
];

/* ------------------------------------------------------------ app password */

export const appPasswordProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'getAll',
		...show('appPassword'),
		options: [
			{ name: 'Create', value: 'create', action: 'Create an app password' },
			{ name: 'Delete', value: 'delete', action: 'Delete an app password' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many app passwords' },
		],
	},
	{
		displayName: 'Mailbox',
		name: 'mailbox',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'name@example.com',
		...show('appPassword', ['create', 'getAll']),
	},
	{
		displayName: 'App Password ID',
		name: 'appId',
		type: 'string',
		required: true,
		default: '',
		description: 'Numeric ID, as returned by Get Many',
		...show('appPassword', ['delete']),
	},
	{
		displayName: 'App Name',
		name: 'appName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'n8n-workflows',
		description: 'Label that identifies where the password is used',
		...show('appPassword', ['create']),
	},
	{
		displayName: 'Password',
		name: 'password',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		description:
			'Leave empty to generate a random 32 character password. It is returned once in the output as generated_password.',
		...show('appPassword', ['create']),
	},
	{
		displayName: 'Protocols',
		name: 'protocols',
		type: 'multiOptions',
		default: ['smtp_access'],
		description: 'What the password can be used for. Grant only what the app needs.',
		...show('appPassword', ['create']),
		options: [
			{ name: 'ActiveSync', value: 'eas_access' },
			{ name: 'CalDAV / CardDAV', value: 'dav_access' },
			{ name: 'IMAP', value: 'imap_access' },
			{ name: 'POP3', value: 'pop3_access' },
			{ name: 'Sieve', value: 'sieve_access' },
			{ name: 'SMTP', value: 'smtp_access' },
		],
	},
	...returnAllAndLimit('appPassword'),
];

/* --------------------------------------------------------------- dkim key */

export const dkimProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'get',
		...show('dkim'),
		options: [
			{ name: 'Create', value: 'create', action: 'Create a DKIM key' },
			{ name: 'Delete', value: 'delete', action: 'Delete a DKIM key' },
			{ name: 'Get', value: 'get', action: 'Get a DKIM key' },
		],
	},
	{
		displayName: 'Domain',
		name: 'domain',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'example.com',
		...show('dkim'),
	},
	{
		displayName: 'Selector',
		name: 'selector',
		type: 'string',
		default: 'dkim',
		description: 'The DNS record is published as &lt;selector&gt;._domainkey.&lt;domain&gt;',
		...show('dkim', ['create']),
	},
	{
		displayName: 'Key Size',
		name: 'keySize',
		type: 'options',
		default: 2048,
		...show('dkim', ['create']),
		options: [
			{ name: '1024', value: 1024 },
			{ name: '2048', value: 2048 },
			{ name: '3072', value: 3072 },
			{ name: '4096', value: 4096 },
		],
	},
];

/* ------------------------------------------------------------- quarantine */

export const quarantineProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'getAll',
		...show('quarantine'),
		options: [
			{ name: 'Delete', value: 'delete', action: 'Delete a quarantined message' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many quarantined messages' },
			{
				name: 'Learn as Ham and Release',
				value: 'learnHam',
				action: 'Learn a quarantined message as ham',
				description: 'Teach Rspamd the message is legitimate and deliver it',
			},
			{ name: 'Release', value: 'release', action: 'Release a quarantined message', description: 'Deliver the message to its recipient' },
		],
	},
	{
		displayName: 'Quarantine ID',
		name: 'quarantineId',
		type: 'string',
		required: true,
		default: '',
		description: 'Numeric ID of the quarantined message, as returned by Get Many',
		...show('quarantine', ['delete', 'learnHam', 'release']),
	},
	...returnAllAndLimit('quarantine'),
];

/* ------------------------------------------------------------- mail queue */

export const queueProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'getAll',
		...show('queue'),
		options: [
			{
				name: 'Delete All',
				value: 'deleteAll',
				action: 'Delete every queued message',
				description: 'Drop every message waiting in the Postfix queue. Cannot be undone.',
			},
			{ name: 'Flush', value: 'flush', action: 'Flush the mail queue', description: 'Retry delivery of every queued message now' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many queued messages' },
		],
	},
	...returnAllAndLimit('queue'),
];

/* -------------------------------------------------------------------- log */

export const logProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'get',
		...show('log'),
		options: [{ name: 'Get', value: 'get', action: 'Get log entries' }],
	},
	{
		displayName: 'Log',
		name: 'logType',
		type: 'options',
		default: 'postfix',
		...show('log'),
		options: [
			{ name: 'ACME (Certificates)', value: 'acme' },
			{ name: 'API', value: 'api' },
			{ name: 'Autodiscover', value: 'autodiscover' },
			{ name: 'Dovecot (IMAP/POP3)', value: 'dovecot' },
			{ name: 'Netfilter (Bans)', value: 'netfilter' },
			{ name: 'Postfix (SMTP)', value: 'postfix' },
			{ name: 'Rate Limited', value: 'ratelimited' },
			{ name: 'Rspamd History', value: 'rspamd-history' },
			{ name: 'SOGo', value: 'sogo' },
			{ name: 'Watchdog', value: 'watchdog' },
		],
	},
	{
		displayName: 'Entries',
		name: 'count',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'How many of the most recent entries to return',
		...show('log'),
	},
];

/* ----------------------------------------------------------------- status */

export const statusProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'getVersion',
		...show('status'),
		options: [
			{ name: 'Get Containers', value: 'getContainers', action: 'Get container status', description: 'State and start time of every mailcow container' },
			{ name: 'Get Version', value: 'getVersion', action: 'Get the mailcow version' },
			{ name: 'Get Vmail Disk Usage', value: 'getVmail', action: 'Get the mail storage disk usage' },
		],
	},
];
