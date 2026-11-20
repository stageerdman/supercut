// One-off: writes a 1024x1024 placeholder icon (coral dot on the app's dark bg) as PNG.
// Then: npx tauri icon <png> -o src-tauri/icons. Replace with a real icon in Phase 10.
const fs = require('node:fs');
const zlib = require('node:zlib');

const N = 1024;
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0; // filter: none
  for (let x = 0; x < N; x++) {
    const i = y * (N * 4 + 1) + 1 + x * 4;
    const d = Math.hypot(x - N / 2, y - N / 2);
    const [r, g, b] = d < N * 0.3 ? [0xff, 0x6a, 0x3d] : [0x17, 0x18, 0x1b];
    raw.set([r, g, b, 255], i);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => { let c = ~0; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;

fs.writeFileSync(process.argv[2], Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]));
