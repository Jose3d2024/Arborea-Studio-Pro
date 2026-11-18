import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Resolves the git executable path on Windows even if PATH has not refreshed after install.
 */
function findGitExecutable() {
  const candidates = [
    'git',
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'cmd', 'git.exe'),
  ];

  for (const candidate of candidates) {
    try {
      if (candidate !== 'git' && !fs.existsSync(candidate)) continue;
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function runGit(gitExe, args, capture = false) {
  return execFileSync(gitExe, args, {
    cwd: ROOT,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
}

function tryGit(gitExe, args) {
  try {
    return runGit(gitExe, args, true).trim();
  } catch {
    return '';
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const skipCheck = rawArgs.includes('--skip-check');
  const messageArg = rawArgs.filter((a) => a !== '--skip-check' && !a.startsWith('http')).join(' ').trim();
  const urlArg = rawArgs.find((a) => a.startsWith('http') || a.startsWith('git@'));

  const gitExe = findGitExecutable();
  if (!gitExe) {
    console.error('\n❌ Git no está instalado en este PC.');
    console.error('Ejecuta este comando en PowerShell para instalarlo en un paso:');
    console.error('   winget install --id Git.Git -e --source winget\n');
    console.error('Después vuelve a ejecutar: node scripts/sync-github.mjs');
    process.exit(1);
  }

  console.log(`✔ Git detectado: ${gitExe}`);

  // 1. TypeScript validation before pushing
  if (!skipCheck) {
    console.log('1/4 Comprobando tipos TypeScript (tsc --noEmit)...');
    try {
      const tscBin = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
      execFileSync(process.execPath, [tscBin, '--noEmit'], { cwd: ROOT, stdio: 'inherit' });
      console.log('   ✔ TypeScript limpio (0 errores).');
    } catch {
      console.error('\n❌ Hay errores de TypeScript. Corrige los errores antes de subir (o usa --skip-check).');
      process.exit(1);
    }
  }

  // 2. Initialize Git repo if needed
  const hasGitDir = fs.existsSync(path.join(ROOT, '.git'));
  if (!hasGitDir) {
    console.log('2/4 Inicializando repositorio Git local...');
    runGit(gitExe, ['init']);
    runGit(gitExe, ['branch', '-M', 'main']);
  } else {
    console.log('2/4 Repositorio Git local detectado.');
  }

  // Ensure git user.name and user.email exist locally
  const rl = readline.createInterface({ input, output });
  try {
    let userName = tryGit(gitExe, ['config', 'user.name']);
    let userEmail = tryGit(gitExe, ['config', 'user.email']);

    if (!userName) {
      const ansName = (await rl.question('Tu nombre para commits de GitHub (ej. Jose): ')).trim();
      if (!ansName) {
        console.error('❌ Se requiere un nombre para crear commits.');
        process.exit(1);
      }
      runGit(gitExe, ['config', 'user.name', ansName]);
      userName = ansName;
    }

    if (!userEmail) {
      const ansEmail = (await rl.question('Tu email de cuenta GitHub: ')).trim();
      if (!ansEmail) {
        console.error('❌ Se requiere un email de GitHub para crear commits.');
        process.exit(1);
      }
      runGit(gitExe, ['config', 'user.email', ansEmail]);
      userEmail = ansEmail;
    }

    // 3. Check or configure remote origin
    let remoteUrl = tryGit(gitExe, ['remote', 'get-url', 'origin']);
    if (!remoteUrl) {
      const repoUrl =
        urlArg ||
        (
          await rl.question(
            'URL de tu repositorio GitHub (ej. https://github.com/usuario/arborea-studio.git): '
          )
        ).trim();
      if (!repoUrl) {
        console.error('❌ No se indicó la URL del repositorio de GitHub.');
        process.exit(1);
      }
      runGit(gitExe, ['remote', 'add', 'origin', repoUrl]);
      remoteUrl = repoUrl;
    } else if (urlArg && urlArg !== remoteUrl) {
      runGit(gitExe, ['remote', 'set-url', 'origin', urlArg]);
      remoteUrl = urlArg;
    }

    console.log(`3/4 Remoto configurado: ${remoteUrl}`);
  } finally {
    rl.close();
  }

  // 4. Stage, commit & push
  const statusBefore = tryGit(gitExe, ['status', '--short']);
  if (!statusBefore) {
    console.log('ℹ No hay cambios nuevos locales por confirmar.');
  } else {
    console.log('Archivos a sincronizar:\n' + statusBefore);
    runGit(gitExe, ['add', '-A']);

    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const commitMsg = messageArg || `Arborea Studio Pro: actualización ${stamp}`;

    runGit(gitExe, ['commit', '-m', commitMsg]);
  }

  const branch = tryGit(gitExe, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'main';
  console.log(`4/4 Subiendo cambios a GitHub (origin/${branch})...`);
  try {
    runGit(gitExe, ['push', '-u', 'origin', branch]);
    console.log('\n✅ ¡Sincronizado con GitHub correctamente!');
  } catch {
    console.log('\n↻ El repo en GitHub tenía historial previo; integrando automáticamente (conservando tus cambios locales)...');
    try {
      try {
        runGit(gitExe, [
          'pull',
          'origin',
          branch,
          '--allow-unrelated-histories',
          '-X',
          'ours',
          '--no-edit',
        ]);
      } catch {
        // Si hubiera algún archivo en conflicto (add/add), conservar nuestra versión local verificada
        runGit(gitExe, ['checkout', '--ours', '.']);
        runGit(gitExe, ['add', '-A']);
        runGit(gitExe, ['commit', '--no-edit']);
      }
      runGit(gitExe, ['push', '-u', 'origin', branch]);
      console.log('\n✅ ¡Historial integrado y cambios subidos a GitHub correctamente!');
    } catch (pushErr) {
      console.error('\n❌ No se pudo completar la subida automática:', pushErr?.message || pushErr);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('❌ Error inesperado en sincronización:', err?.message || err);
  process.exit(1);
});
