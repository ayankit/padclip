const encoder = new TextEncoder();
const decoder = new TextDecoder();

const SESSION_VERSION = 1;
const PAD_ID_PATTERN = /^[A-Za-z0-9]{6}$/;
const MINIMUM_SIGNING_KEY_BYTES = 32;

export const SESSION_TTL_SECONDS = 86_400;

interface SessionPayload {
	v: number;
	padId: string;
	iat: number;
	exp: number;
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';

	for (const byte of bytes) binary += String.fromCharCode(byte);

	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

	const padding = '='.repeat((4 - (value.length % 4)) % 4);

	try {
		const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding);
		const bytes = new Uint8Array(binary.length);

		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}

		return bytes;
	} catch {
		return null;
	}
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
	const keyBytes = encoder.encode(secret);

	if (keyBytes.byteLength < MINIMUM_SIGNING_KEY_BYTES) {
		throw new Error(`SESSION_SIGNING_KEY must be at least ${MINIMUM_SIGNING_KEY_BYTES} bytes.`);
	}

	return crypto.subtle.importKey(
		'raw',
		keyBytes,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

function isSessionPayload(value: unknown): value is SessionPayload {
	if (!value || typeof value !== 'object') return false;

	const payload = value as Record<string, unknown>;

	return (
		payload.v === SESSION_VERSION &&
		typeof payload.padId === 'string' &&
		PAD_ID_PATTERN.test(payload.padId) &&
		Number.isInteger(payload.iat) &&
		Number.isInteger(payload.exp)
	);
}

export function getPadSessionCookieName(padId: string): string {
	if (!PAD_ID_PATTERN.test(padId)) throw new Error('Invalid pad ID.');

	return `__Host-clipped-pad-${padId}`;
}

export async function createPadSession(
	padId: string,
	secret: string,
	now = Math.floor(Date.now() / 1000)
): Promise<string> {
	if (!PAD_ID_PATTERN.test(padId)) throw new Error('Invalid pad ID.');

	const payload: SessionPayload = {
		v: SESSION_VERSION,
		padId,
		iat: now,
		exp: now + SESSION_TTL_SECONDS
	};
	const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
	const key = await importSigningKey(secret);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(encodedPayload));

	return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyPadSession(
	token: string,
	expectedPadId: string,
	secret: string,
	now = Math.floor(Date.now() / 1000)
): Promise<boolean> {
	const parts = token.split('.');

	if (parts.length !== 2) return false;

	const [encodedPayload, encodedSignature] = parts;
	const signature = base64UrlToBytes(encodedSignature);

	if (!encodedPayload || !signature) return false;

	const key = await importSigningKey(secret);
	const validSignature = await crypto.subtle.verify(
		'HMAC',
		key,
		signature,
		encoder.encode(encodedPayload)
	);

	if (!validSignature) return false;

	const payloadBytes = base64UrlToBytes(encodedPayload);

	if (!payloadBytes) return false;

	try {
		const payload: unknown = JSON.parse(decoder.decode(payloadBytes));

		return (
			isSessionPayload(payload) &&
			payload.padId === expectedPadId &&
			payload.iat <= now &&
			payload.exp > now &&
			payload.exp - payload.iat === SESSION_TTL_SECONDS
		);
	} catch {
		return false;
	}
}
