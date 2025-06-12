const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ImageOrganizer {
  constructor() {
    const baseDir = path.resolve(__dirname, '../../');
    this.rulesDir = path.join(baseDir, 'rules');
    this.uploadsDir = path.join(baseDir, 'public/uploads');
    this.changedFiles = new Set();

    // ––– détection de la branche courante –––
    try {
      this.branchName = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch {
      this.branchName = 'main';
    }
    this.isMain = this.branchName === 'main';
  }

  getChangedMDXFiles() {
    try {
      const gitOutput = execSync('git diff --name-only HEAD', { encoding: 'utf8' });
      return gitOutput
        .split('\n')
        .filter(f => f.endsWith('.mdx') && f.startsWith('rules/'))
        .map(f => path.resolve(path.join(__dirname, '../../', f)));
    } catch {
      return this.getAllMDXFiles();
    }
  }

  getAllMDXFiles() {
    const mdxFiles = [];
    const scan = dir => {
      fs.readdirSync(dir).forEach(item => {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) scan(full);
        else if (item.endsWith('.mdx')) mdxFiles.push(full);
      });
    };
    if (fs.existsSync(this.rulesDir)) scan(this.rulesDir);
    return mdxFiles;
  }

  // ––– récupère les <imageEmbed ... src="..." > –––
  extractImageReferences(content) {
    const imageRegex = /<imageEmbed[^>]*src="([^"]+)"[^>]*>/g;
    const images = [];
    let match;
    while ((match = imageRegex.exec(content)) !== null) {
      const src = match[1];
      if (
        !src.includes('/') ||
        src.startsWith('uploads/') ||
        src.startsWith('/uploads/')
      ) {
        images.push({
          filename: src.replace(/^\/?uploads\//, ''),
          originalSrc: src
        });
      }
    }
    return images;
  }

  moveImageToRuleDir(imageName, ruleDir) {
    const source = path.join(this.uploadsDir, imageName.replace(/^\/+/, ''));
    const target = path.join(ruleDir, imageName);
    if (!fs.existsSync(source)) return false;
    if (!fs.existsSync(ruleDir)) fs.mkdirSync(ruleDir, { recursive: true });
    fs.copyFileSync(source, target);
    fs.unlinkSync(source);
    return true;
  }

  // ––– nouvelle logique pour le src –––
  updateImagePaths(content, images, ruleName) {
    const baseURL = this.isMain
      ? 'https://github.com/SSWConsulting/SSW.Rules.Content'
      : `https://github.com/SSWConsulting/SSW.Rules.Content/tree/${this.branchName}`;
    let updated = content;
    images.forEach(img => {
      const newSrc = `${baseURL}/rules/${ruleName}/${img.filename}`;
      updated = updated.replace(new RegExp(`src="${img.originalSrc}"`, 'g'), `src="${newSrc}"`);
    });
    return updated;
  }

  processMDXFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const images = this.extractImageReferences(content);
    if (!images.length) return;

    const ruleDir = path.dirname(filePath);
    const ruleName = path.basename(ruleDir);

    const moved = images.filter(img => this.moveImageToRuleDir(img.filename, ruleDir));
    if (!moved.length) return;

    const newContent = this.updateImagePaths(content, moved, ruleName);
    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  run() {
    if (!fs.existsSync(this.rulesDir) || !fs.existsSync(this.uploadsDir)) return;
    const files = this.getAllMDXFiles(); // ou getChangedMDXFiles()
    files.forEach(f => this.processMDXFile(f));
  }
}

new ImageOrganizer().run();
