import FormData from '../../form-data/FormData';
import Stream from 'stream';
import MultipartParser from './MultipartParser';
import DOMException from '../../exception/DOMException';
import DOMExceptionNameEnum from '../../exception/DOMExceptionNameEnum';

/**
 * Multipart form data factory.
 *
 * Based on:
 * https://github.com/node-fetch/node-fetch/blob/main/src/utils/multipart-parser.js (MIT)
 */
export default class MultipartFormDataParser {
	/**
	 * Returns form data.
	 *
	 * @param body Body.
	 * @param contentType Content type header value.
	 * @returns Form data.
	 */
	public static async streamToFormData(
		body: Stream.Readable,
		contentType: string
	): Promise<FormData> {
		if (!/multipart/i.test(contentType)) {
			throw new DOMException(
				`Failed to build FormData object: The "content-type" header isn't of type "multipart/form-data".`,
				DOMExceptionNameEnum.invalidStateError
			);
		}

		const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

		if (!match) {
			throw new DOMException(
				`Failed to build FormData object: The "content-type" header doesn't contain any multipart boundary.`,
				DOMExceptionNameEnum.invalidStateError
			);
		}

		const formData = new FormData();
		const multipartParser = new MultipartParser(formData, match[1] || match[2]);

		for await (const chunk of body) {
			multipartParser.append(chunk);
		}

		return formData;
	}
	/**
	 * Converts a FormData object to a ReadableStream.
	 *
	 * @param formData FormData.
	 * @returns Stream and type.
	 */
	public static formDataToStream(formData: FormData): {
		contentType: string;
		contentLength: number;
		buffer: Buffer;
		stream: Stream.Readable;
	} {
		const boundary = '----HappyDOMFormDataBoundary' + Math.random().toString(36);
		const chunks: Buffer[] = [];
		const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="`;

		for (const [name, value] of formData) {
			if (typeof value === 'string') {
				chunks.push(
					Buffer.from(
						`${prefix}${this.escapeName(name)}"\r\n\r\n${value.replace(
							/\r(?!\n)|(?<!\r)\n/g,
							'\r\n'
						)}\r\n`
					)
				);
			} else {
				chunks.push(
					Buffer.from(
						`${prefix}${this.escapeName(name)}"; filename="${this.escapeName(
							value.name,
							true
						)}"\r\nContent-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`
					)
				);
				chunks.push(value._buffer);
				chunks.push(Buffer.from('\r\n'));
			}
		}

		const buffer = Buffer.concat(chunks);

		return {
			contentType: `multipart/form-data; boundary=${boundary}`,
			contentLength: buffer.length,
			buffer,
			stream: Stream.Readable.from(buffer)
		};
	}

	/**
	 * Escapes a form data entry name.
	 *
	 * @param name Name.
	 * @param filename Whether it is a filename.
	 * @returns Escaped name.
	 */
	private static escapeName(name: string, filename = false): string {
		return (filename ? name : name.replace(/\r?\n|\r/g, '\r\n'))
			.replace(/\n/g, '%0A')
			.replace(/\r/g, '%0D')
			.replace(/"/g, '%22');
	}

	/**
	 * Returns file name.
	 *
	 * @param headerValue Header value.
	 * @returns File name.
	 */
	private static getFileName(headerValue): string | null {
		// Matches either a quoted-string or a token (RFC 2616 section 19.5.1)

		const filenameMatch = headerValue.match(
			/\bfilename=("(.*?)"|([^()<>@,;:\\"/[\]?={}\s\t]+))($|;\s)/i
		);

		if (!filenameMatch) {
			return null;
		}

		const filename = filenameMatch[2] || filenameMatch[3] || '';

		return filename
			.slice(filename.lastIndexOf('\\') + 1)
			.replace(/%22/g, '"')
			.replace(/&#(\d{4});/g, (_match, code) => String.fromCharCode(code));
	}
}
