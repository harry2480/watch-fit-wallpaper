/** テスト用: 位置情報・機器名・撮影日時を持つ EXIF（APP1）を JPEG に挿入する */

export const EXIF_MAKE = 'WatchFitTestCam';
export const EXIF_DATETIME = '2024:01:02 03:04:05';

function u16(n: number): number[] {
	return [(n >> 8) & 0xff, n & 0xff];
}
function u32(n: number): number[] {
	return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}
function ascii(text: string): number[] {
	return [...text].map((c) => c.charCodeAt(0));
}
function entry(tag: number, type: number, count: number, value: number[]): number[] {
	return [...u16(tag), ...u16(type), ...u32(count), ...value];
}

/** 向き（Orientation）も指定できる。1 は回転なし */
export function buildExifSegment(orientation = 1): Uint8Array {
	const ASCII = 2;
	const SHORT = 3;
	const LONG = 4;
	// TIFF 内のオフセット（ヘッダー 8 バイトの後に IFD0）
	const ifd0 = 8;
	const ifd0Entries = 4;
	const ifd0Size = 2 + ifd0Entries * 12 + 4;
	const makeOffset = ifd0 + ifd0Size;
	const make = [...ascii(EXIF_MAKE), 0];
	const exifIfd = makeOffset + make.length;
	const exifIfdSize = 2 + 12 + 4;
	const dateOffset = exifIfd + exifIfdSize;
	const date = [...ascii(EXIF_DATETIME), 0];
	const gpsIfd = dateOffset + date.length;
	const tiff = [
		...ascii('MM'),
		...u16(42),
		...u32(ifd0),
		...u16(ifd0Entries),
		...entry(0x010f, ASCII, make.length, u32(makeOffset)),
		...entry(0x0112, SHORT, 1, [...u16(orientation), 0, 0]),
		...entry(0x8769, LONG, 1, u32(exifIfd)),
		...entry(0x8825, LONG, 1, u32(gpsIfd)),
		...u32(0),
		...make,
		...u16(1),
		...entry(0x9003, ASCII, date.length, u32(dateOffset)),
		...u32(0),
		...date,
		...u16(1),
		...entry(0x0001, ASCII, 2, [...ascii('N'), 0, 0, 0]),
		...u32(0),
	];
	const payload = [...ascii('Exif'), 0, 0, ...tiff];
	return new Uint8Array([0xff, 0xe1, ...u16(payload.length + 2), ...payload]);
}

/** SOI の直後に APP1 を挿入する */
export function insertExif(jpeg: Uint8Array, segment: Uint8Array): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(jpeg.length + segment.length);
	out.set(jpeg.subarray(0, 2), 0);
	out.set(segment, 2);
	out.set(jpeg.subarray(2), 2 + segment.length);
	return out;
}

export function includesAscii(bytes: Uint8Array, text: string): boolean {
	const pattern = [...text].map((c) => c.charCodeAt(0));
	outer: for (let i = 0; i + pattern.length <= bytes.length; i += 1) {
		for (let j = 0; j < pattern.length; j += 1) {
			if (bytes[i + j] !== pattern[j]) continue outer;
		}
		return true;
	}
	return false;
}
