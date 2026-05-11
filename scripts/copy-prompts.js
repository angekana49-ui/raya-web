const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
  return true;
}

const projectRoot = process.cwd();
const src = path.join(projectRoot, 'prompts');
let dest;

// Prefer .next/server (server build output) then .vercel_build_output or dist
if (fs.existsSync(path.join(projectRoot, '.next'))) {
  dest = path.join(projectRoot, '.next', 'server', 'prompts');
} else if (fs.existsSync(path.join(projectRoot, '.vercel_build_output'))) {
  dest = path.join(projectRoot, '.vercel_build_output', 'prompts');
} else {
  dest = path.join(projectRoot, 'dist', 'prompts');
}

const ok = copyDir(src, dest);
if (ok) console.log('Prompts copied to', dest);
else console.warn('No prompts folder found at', src);
