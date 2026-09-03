const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const sourcePath = path.join(repoRoot, 'src', 'DummyGame', 'DummyGame_mac.m');
  const targetResourceDir = path.resolve(__dirname, '..', 'build-resources', 'dummygame');
  const targetExe = path.join(targetResourceDir, 'DummyGame.exe');

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  if (!fs.existsSync(targetResourceDir)) {
    fs.mkdirSync(targetResourceDir, { recursive: true });
  }

  console.log(`Compiling macOS DummyGame universal binary from ${sourcePath}...`);

  // Compile universal binary (arm64 + x86_64) using clang with Cocoa framework
  const cmd = `clang -arch arm64 -arch x86_64 -fobjc-arc -framework Cocoa -O2 "${sourcePath}" -o "${targetExe}"`;
  execSync(cmd, { stdio: 'inherit' });

  // Ensure executable permissions
  fs.chmodSync(targetExe, 0o755);

  // Also create extensionless DummyGame for macOS
  const targetBin = path.join(targetResourceDir, 'DummyGame');
  fs.copyFileSync(targetExe, targetBin);
  fs.chmodSync(targetBin, 0o755);

  // Also copy to dev-mode fallback path: src/DummyGame/bin/Release/net8.0-windows/
  const devFallbackDir = path.join(repoRoot, 'src', 'DummyGame', 'bin', 'Release', 'net8.0-windows');
  fs.mkdirSync(devFallbackDir, { recursive: true });
  fs.copyFileSync(targetExe, path.join(devFallbackDir, 'DummyGame.exe'));
  fs.chmodSync(path.join(devFallbackDir, 'DummyGame.exe'), 0o755);
  fs.copyFileSync(targetExe, path.join(devFallbackDir, 'DummyGame'));
  fs.chmodSync(path.join(devFallbackDir, 'DummyGame'), 0o755);

  console.log(`Successfully built DummyGame for macOS at: ${targetBin} and ${targetExe}`);
}

main();
