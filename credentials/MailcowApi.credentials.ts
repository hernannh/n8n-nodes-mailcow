import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * mailcow API key.
 *
 * The key is created in the mailcow admin UI (System > Configuration > Access > API) and is
 * sent as the `X-API-Key` header. mailcow only accepts it from the IPs listed in "Allow API
 * access from", so the IP n8n leaves from has to be there.
 *
 * Two details that cost time when they go wrong:
 * - The API only answers over HTTPS. Over plain HTTP nginx returns a redirect whose body is
 *   HTML, not JSON, and there is no clear error.
 * - A read-only key answers `403 API read/write access denied` to every write call.
 */
export class MailcowApi implements ICredentialType {
	name = 'mailcowApi';

	displayName = 'Mailcow API';

	documentationUrl = 'https://docs.mailcow.email/third_party/mailcow-api/';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			placeholder: 'https://mail.example.com',
			required: true,
			description:
				'URL of the mailcow web UI, without a path. It has to be HTTPS: the API does not answer over plain HTTP.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Read-only or read/write key from System > Configuration > Access > API. Add the IP n8n connects from to "Allow API access from".',
		},
		{
			displayName: 'Ignore SSL Certificate Errors',
			name: 'allowUnauthorizedCerts',
			type: 'boolean',
			default: false,
			description:
				'Whether to accept an invalid or self-signed certificate. Only useful for test servers: mailcow normally runs with a Let\'s Encrypt certificate.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/api/v1/get/status/version',
			method: 'GET',
			skipSslCertificateValidation: '={{$credentials.allowUnauthorizedCerts}}',
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'type',
					value: 'error',
					message: 'mailcow rejected the API key (check the key and the allowed IPs)',
				},
			},
		],
	};
}
