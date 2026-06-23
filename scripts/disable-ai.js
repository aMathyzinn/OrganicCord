const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

const filesToRestore = [
  'src-tauri/src/commands/ai.rs',
  'src/stores/aiStore.ts',
  'src/stores/aiConversationStore.ts',
];

function unsetSkipWorktreeRecursive(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const curTarget = path.join(dir, file);
    if (fs.lstatSync(curTarget).isDirectory()) {
      unsetSkipWorktreeRecursive(curTarget);
    } else {
      try {
        execSync(`git update-index --no-skip-worktree "${curTarget}"`, { stdio: 'ignore' });
      } catch (e) {}
    }
  }
}

try {
  for (const file of filesToRestore) {
    const fullPath = path.join(rootDir, file);
    try {
      execSync(`git update-index --no-skip-worktree "${fullPath}"`, { stdio: 'ignore' });
    } catch (e) {}
    try {
      execSync(`git checkout -- "${fullPath}"`, { stdio: 'ignore' });
    } catch (e) {}
  }

  // Restore pasta ai
  const aiDir = path.join(rootDir, 'src/stores/ai');
  unsetSkipWorktreeRecursive(aiDir);
  try {
    execSync(`git checkout -- "${aiDir}"`, { stdio: 'ignore' });
  } catch (e) {}

  console.log("✅ Funcionalidades de IA desativadas. Versão limpa (Dummy) restaurada.");
} catch (e) {
  console.error("Erro ao desativar IA:", e);
  process.exit(1);
}
