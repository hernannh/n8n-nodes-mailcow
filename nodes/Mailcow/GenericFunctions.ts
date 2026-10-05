import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
} from 'n8n-workflow';

export type MailcowContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

/**
 * Raised when mailcow answers HTTP 200 but reports a failure in the body.
 *
 * Write calls return a list of `{ type, log, msg }` entries and the status code stays 200 even
 * when the change was refused (`type: "danger"` or `"error"`). Without this check a failed
 * create looks like a success in n8n.
 */
export class MailcowResponseError extends Error {
	constructor(
		message: string,
		readonly response: unknown,
	) {
		super(message);
		this.name = 'MailcowResponseError';
	}
}

const FAILURE_TYPES = new Set(['danger', 'error']);

/** mailcow puts the reason in `msg`, either a string or `[key, ...arguments]`. */
export function formatMessage(msg: unknown): string {
	if (Array.isArray(msg)) return msg.map((part) => String(part)).join(' ');
	if (msg === undefined || msg === null) return 'unknown error';
	return String(msg);
}

/**
 * Throw a MailcowResponseError when the body is not JSON or reports a failure.
 *
 * A string body almost always means the request reached nginx over plain HTTP and got the
 * redirect page, or hit something that is not the API at all.
 */
export function assertMailcowSuccess(response: unknown): void {
	if (typeof response === 'string') {
		throw new MailcowResponseError(
			'mailcow did not answer with JSON. Check that the Base URL uses https:// and points to the mailcow web UI.',
			response,
		);
	}

	const entries = Array.isArray(response) ? response : [response];
	const failures = entries.filter(
		(entry): entry is IDataObject =>
			typeof entry === 'object' &&
			entry !== null &&
			FAILURE_TYPES.has(String((entry as IDataObject).type)),
	);
	if (failures.length) {
		throw new MailcowResponseError(
			failures.map((failure) => formatMessage(failure.msg)).join('; '),
			response,
		);
	}
}

/**
 * Turn any mailcow read response into a list of records.
 *
 * - `get/<thing>/all` returns an array.
 * - `get/<thing>/<id>` returns the record itself, or `{}` when it does not exist.
 * - Some status endpoints return a map keyed by name (`get/status/containers`); those are kept
 *   as a single record so nothing is lost.
 */
export function toRecords(response: unknown): IDataObject[] {
	if (Array.isArray(response)) {
		return response.filter((entry) => typeof entry === 'object' && entry !== null) as IDataObject[];
	}
	if (typeof response === 'object' && response !== null) {
		return Object.keys(response).length ? [response as IDataObject] : [];
	}
	return [];
}

/** mailcow stores booleans as "1" and "0" and expects them that way in requests. */
export function toFlag(value: unknown): string {
	return value === true || value === '1' || value === 1 ? '1' : '0';
}

/** Split a comma, semicolon or newline separated list and drop empty entries. */
export function splitList(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
	return String(value ?? '')
		.split(/[,;\n]/)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

export async function mailcowApiRequest(
	this: MailcowContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject | IDataObject[] | string[],
): Promise<unknown> {
	const credentials = await this.getCredentials('mailcowApi');
	const baseUrl = String(credentials.baseUrl).replace(/\/+$/, '');

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}/api/v1/${endpoint.replace(/^\/+/, '')}`,
		json: true,
		skipSslCertificateValidation: credentials.allowUnauthorizedCerts as boolean,
	};
	if (body !== undefined) options.body = body;

	const response = await this.helpers.httpRequestWithAuthentication.call(
		this,
		'mailcowApi',
		options,
	);
	assertMailcowSuccess(response);
	return response;
}
