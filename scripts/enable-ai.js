const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const localAiDir = path.join(rootDir, '.local-ai');

if (!fs.existsSync(localAiDir)) {
  console.error("Erro: Pasta .local-ai não encontrada.");
  process.exit(1);
}

const filesToPatch = [
  { src: path.join(localAiDir, 'ai.rs'), dest: path.join(rootDir, 'src-tauri/src/commands/ai.rs') },
  { src: path.join(localAiDir, 'aiStore.ts'), dest: path.join(rootDir, 'src/stores/aiStore.ts') },
  { src: path.join(localAiDir, 'aiConversationStore.ts'), dest: path.join(rootDir, 'src/stores/aiConversationStore.ts') },
];

function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  const files = fs.readdirSync(source);
  for (const file of files) {
    const curSource = path.join(source, file);
    const curTarget = path.join(target, file);
    if (fs.lstatSync(curSource).isDirectory()) {
      copyFolderRecursiveSync(curSource, curTarget);
    } else {
      fs.copyFileSync(curSource, curTarget);
      execSync(`git update-index --skip-worktree "${curTarget}"`);
    }
  }
}

try {
  // Copiar arquivos individuais
  for (const file of filesToPatch) {
    fs.copyFileSync(file.src, file.dest);
    // Diz para o git ignorar as mudanças no arquivo dummy para a versão real
    execSync(`git update-index --skip-worktree "${file.dest}"`);
  }

  // Copiar pasta ai/ (tipos e lógica)
  copyFolderRecursiveSync(
    path.join(localAiDir, 'ai'),
    path.join(rootDir, 'src/stores/ai')
  );

  console.log("✅ Funcionalidades de IA injetadas localmente e escondidas do Git com sucesso.");
} catch (e) {
  console.error("Erro ao injetar IA:", e);
  process.exit(1);
}
