const fs = require('fs');
const path = require('path');

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDirSync(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolvePlatformArg() {
  const platformArg = process.argv.find((arg) => arg.startsWith('--platform='));
  if (platformArg) return platformArg.split('=')[1];
  return process.platform;
}

function getBinaryName(platform) {
  return platform === 'win32' ? 'DummyGame.exe' : 'DummyGame';
}

function getPreferredTfms(platform) {
  if (platform === 'win32') return ['net8.0-windows', 'net8.0'];
  return ['net8.0', 'net8.0-windows'];
}

function getCandidateSourceDirs(dummyBinRoot, tfms, platform) {
  const dirs = [];

  if (platform === 'linux') {
    for (const tfm of tfms) {
      dirs.push(path.join(dummyBinRoot, tfm, 'linux-x64', 'publish'));
      dirs.push(path.join(dummyBinRoot, tfm, 'linux-x64'));
      dirs.push(path.join(dummyBinRoot, tfm));
    }
    return dirs;
  }

  for (const tfm of tfms) {
    dirs.push(path.join(dummyBinRoot, tfm));
  }

  return dirs;
}

function main() {
  const platform = resolvePlatformArg();
  const repoRoot = path.resolve(__dirname, '..', '..');

  const dummyBinRoot = path.join(repoRoot, 'src', 'DummyGame', 'bin', 'Release');
  const resourceDir = path.join(repoRoot, 'electron', 'build-resources', 'dummygame');

  ensureDirSync(path.dirname(resourceDir));
  cleanDirSync(resourceDir);

  const binaryName = getBinaryName(platform);
  const tfms = getPreferredTfms(platform);

  let sourceDir = null;
  const sourceCandidates = getCandidateSourceDirs(dummyBinRoot, tfms, platform);
  for (const candidate of sourceCandidates) {
    if (fs.existsSync(path.join(candidate, binaryName))) {
      sourceDir = candidate;
      break;
    }
  }

  if (!sourceDir) {
    throw new Error(
      `Could not find ${binaryName} under ${dummyBinRoot}. Build DummyGame first for ${tfms.join(' or ')}.`
    );
  }

  const files = fs.readdirSync(sourceDir);
  for (const fileName of files) {
    if (fileName === 'ref' || fileName === 'refint') continue;

    const src = path.join(sourceDir, fileName);
    if (!fs.statSync(src).isFile()) continue;

    if (fileName === binaryName || fileName.startsWith('DummyGame.')) {
      const dest = path.join(resourceDir, fileName);
      fs.copyFileSync(src, dest);
    }
  }

  if (!fs.existsSync(path.join(resourceDir, binaryName))) {
    throw new Error(`Failed to stage ${binaryName} into ${resourceDir}.`);
  }

  console.log(`Staged DummyGame resources from ${sourceDir} to ${resourceDir}`);
}

main();