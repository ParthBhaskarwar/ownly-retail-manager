const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPngBuffer(width, height, r, g, b) {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 2; // Color type: 2 (Truecolor RGB)
  ihdr[10] = 0; // Compression method: 0
  ihdr[11] = 0; // Filter method: 0
  ihdr[12] = 0; // Interlace method: 0

  function createChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const typeAndData = Buffer.concat([typeBuf, data]);
    const crc = crc32(typeAndData);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeAndData, crcBuf]);
  }

  // IDAT chunk (image data)
  const rawRows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // Filter type: 0 (None)
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = r;
      row[1 + x * 3 + 1] = g;
      row[1 + x * 3 + 2] = b;
    }
    rawRows.push(row);
  }
  const rawData = Buffer.concat(rawRows);
  const compressedData = zlib.deflateSync(rawData);

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

const dir = path.join(__dirname);
fs.writeFileSync(path.join(dir, 'icon-192.png'), createPngBuffer(192, 192, 139, 92, 246));
fs.writeFileSync(path.join(dir, 'icon-512.png'), createPngBuffer(512, 512, 139, 92, 246));
console.log('Successfully created PNG icon files.');
