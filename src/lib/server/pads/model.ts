const encoder = new TextEncoder();
const PAD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const PAD_ID_LENGTH = 6;
const MAX_RANDOM_BYTE = 248;

export const MAX_CONTENT_BYTES = 1_500_000;
export const PAD_LIFETIME_SECONDS = 86_400;

export function getContentByteLength(content: string): number {
	return encoder.encode(content).byteLength;
}

export function isValidPadId(padId: string): boolean {
	return /^[A-Za-z0-9]{6}$/.test(padId);
}

export function generatePadId(): string {
	let id = '';

	while (id.length < PAD_ID_LENGTH) {
		const bytes = crypto.getRandomValues(new Uint8Array(PAD_ID_LENGTH - id.length));

		for (const byte of bytes) {
			if (byte >= MAX_RANDOM_BYTE) continue;

			id += PAD_ALPHABET[byte % PAD_ALPHABET.length];
			if (id.length === PAD_ID_LENGTH) break;
		}
	}

	return id;
}
