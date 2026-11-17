import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function runNodeScript(scriptRel, args) {
  execFileSync(process.execPath, [path.join(ROOT, scriptRel), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

function generateBotanicalIco(outPath) {
  const w = 32;
  const h = 32;
  const pixelBytes = w * h * 4;
  const maskBytes = (w / 8) * h; // 4 * 32 = 128 bytes
  const headerSize = 40;
  const imageSize = headerSize + pixelBytes + maskBytes;

  const buf = Buffer.alloc(6 + 16 + imageSize, 0);

  // ICONDIR (6 bytes)
  buf.writeUInt16LE(0, 0); // reserved
  buf.writeUInt16LE(1, 2); // type = 1 (ICO)
  buf.writeUInt16LE(1, 4); // count = 1

  // ICONDIRENTRY (16 bytes)
  buf.writeUInt8(w, 6);
  buf.writeUInt8(h, 7);
  buf.writeUInt8(0, 8);
  buf.writeUInt8(0, 9);
  buf.writeUInt16LE(1, 10); // planes
  buf.writeUInt16LE(32, 12); // bpp
  buf.writeUInt32LE(imageSize, 14);
  buf.writeUInt32LE(22, 18); // offset

  // BITMAPINFOHEADER (40 bytes)
  let o = 22;
  buf.writeUInt32LE(40, o);
  buf.writeInt32LE(w, o + 4);
  buf.writeInt32LE(h * 2, o + 8); // XOR + AND height
  buf.writeUInt16LE(1, o + 12); // planes
  buf.writeUInt16LE(32, o + 14); // bpp
  buf.writeUInt32LE(0, o + 16); // BI_RGB
  buf.writeUInt32LE(pixelBytes + maskBytes, o + 20);

  // Pixel data bottom-up BGRA
  const pixStart = o + 40;
  for (let py = 0; py < h; py++) {
    const y = h - 1 - py; // top-down coordinate 0..31
    for (let x = 0; x < w; x++) {
      const idx = pixStart + (py * w + x) * 4;
      const nx = (x - 15.5) / 14.5;
      const ny = (y - 15.5) / 14.5;
      const dist = Math.hypot(nx, ny);

      // Rounded dark slate badge
      if (Math.abs(nx) > 0.96 || Math.abs(ny) > 0.96 || dist > 1.24) {
        continue; // transparent alpha=0
      }

      let r = 12, g = 21, b = 33, a = 255;

      // Subtle emerald border ring
      if (Math.abs(nx) > 0.84 || Math.abs(ny) > 0.84 || dist > 1.1) {
        r = 16; g = 185; b = 129;
      }

      // Stylized botanical canopy + trunk
      const crownDist = Math.hypot((x - 15.5) / 8.5, (y - 12.5) / 7.8);
      if (crownDist < 1.0) {
        const shade = Math.max(0, 1 - crownDist);
        r = Math.round(16 + shade * 36);
        g = Math.round(150 + shade * 90);
        b = Math.round(92 + shade * 45);
      }

      // Trunk + roots
      if (y >= 17 && y <= 26 && Math.abs(x - 15.5) < 1.6 + Math.max(0, y - 22) * 0.55) {
        r = 120; g = 74; b = 42;
      }

      buf[idx] = b;
      buf[idx + 1] = g;
      buf[idx + 2] = r;
      buf[idx + 3] = a;
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
}

console.log('1/4 Compilando frontend (Vite)...');
runNodeScript('node_modules/vite/bin/vite.js', ['build']);

console.log('2/4 Empaquetando servidor Express (esbuild -> dist-server/server.cjs)...');
fs.mkdirSync(path.join(ROOT, 'dist-server'), { recursive: true });
runNodeScript('node_modules/esbuild/bin/esbuild', [
  'server.ts',
  '--bundle',
  '--platform=node',
  '--format=cjs',
  '--external:vite',
  '--outfile=dist-server/server.cjs',
]);

console.log('3/4 Generando icono de aplicacion Windows (desktop/arborea.ico)...');
const icoPath = path.join(ROOT, 'desktop', 'arborea.ico');
generateBotanicalIco(icoPath);

console.log('4/4 Compilando ejecutable nativo Windows (ArboreaStudioPro.exe)...');
const cscCandidates = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
];
const cscExe = cscCandidates.find((p) => fs.existsSync(p));
if (!cscExe) {
  throw new Error('No se encontro csc.exe (.NET Framework 4.0) para compilar el ejecutable.');
}

const exePath = path.join(ROOT, 'ArboreaStudioPro.exe');
const csPath = path.join(ROOT, 'desktop', 'ArboreaLauncher.cs');

execFileSync(
  cscExe,
  [
    '/nologo',
    '/target:winexe',
    '/optimize+',
    `/win32icon:${icoPath}`,
    `/out:${exePath}`,
    csPath,
  ],
  { cwd: ROOT, stdio: 'inherit' }
);

console.log('\nListo: ' + exePath);
