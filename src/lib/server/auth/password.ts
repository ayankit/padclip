const encoder = new TextEncoder();

const PASSWORD_VERIFIER_CONTEXT = encoder.encode('clipped-pad-password-verifier-v1');
const SALT_BYTES = 16;

export const PBKDF2_ITERATIONS = 600_000;
export const PASSWORD_MIN_BYTES = 8;
export const PASSWORD_MAX_BYTES = 256;

type ByteSource = Uint8Array<ArrayBufferLike> | ArrayBuffer;

function copyToArrayBuffer(source: ByteSource): ArrayBuffer {
	if (source instanceof ArrayBuffer) return source;

	return new Uint8Array(source).buffer;
}

export function getPasswordValidationError(password: string): string | null {
	const length = encoder.encode(password).byteLength;

	if (length < PASSWORD_MIN_BYTES) {
		return `Password must be at least ${PASSWORD_MIN_BYTES} bytes.`;
	}

	if (length > PASSWORD_MAX_BYTES) {
		return `Password must be at most ${PASSWORD_MAX_BYTES} bytes.`;
	}

	return null;
}

export function generatePasswordSalt(): Uint8Array<ArrayBuffer> {
	return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

async function deriveVerifierKey(password: string, salt: ByteSource): Promise<CryptoKey> {
	const passwordKey = await crypto.subtle.importKey(
		'raw',
		encoder.encode(password),
		'PBKDF2',
		false,
		['deriveKey']
	);

	return crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			hash: 'SHA-256',
			iterations: PBKDF2_ITERATIONS,
			salt: copyToArrayBuffer(salt)
		},
		passwordKey,
		{ name: 'HMAC', hash: 'SHA-256', length: 256 },
		false,
		['sign', 'verify']
	);
}

export async function createPasswordVerifier(
	password: string,
	salt: ByteSource
): Promise<Uint8Array<ArrayBuffer>> {
	const key = await deriveVerifierKey(password, salt);
	const signature = await crypto.subtle.sign('HMAC', key, PASSWORD_VERIFIER_CONTEXT);

	return new Uint8Array(signature);
}

export async function verifyPassword(
	password: string,
	salt: ByteSource,
	verifier: ByteSource
): Promise<boolean> {
	const key = await deriveVerifierKey(password, salt);

	return crypto.subtle.verify('HMAC', key, copyToArrayBuffer(verifier), PASSWORD_VERIFIER_CONTEXT);
}
