const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ImageOrganizer {
  constructor() {
    const baseDir = path.resolve(__dirname, '../../');
    this.rulesDir = path.join(baseDir, 'rules');
    this.uploadsDir = path.join(baseDir, 'public/uploads');
    this.changedFiles = new Set();
  }

  getChangedMDXFiles() {
    try {
      const gitOutput = execSync('git diff --name-only HEAD', { encoding: 'utf8' });
      const changedFiles = gitOutput
        .split('\n')
        .filter(file => file.endsWith('.mdx') && file.startsWith('rules/'))
        .map(file => path.resolve(path.join(__dirname, '../../', file)));

      console.log('Changed MDX files:', changedFiles);
      return changedFiles;
    } catch (error) {
      console.warn('Git not available or no changes detected, processing all MDX files');
      return this.getAllMDXFiles();
    }
  }

  getAllMDXFiles() {
    const mdxFiles = [];
    const scanDirectory = dir => {
      const items = fs.readdirSync(dir);
      items.forEach(item => {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
          scanDirectory(fullPath);
        } else if (item.endsWith('.mdx')) {
          mdxFiles.push(fullPath);
        }
      });
    };

    if (fs.existsSync(this.rulesDir)) {
      scanDirectory(this.rulesDir);
    }
    return mdxFiles;
  }

  // Extract image filenames from MDX content
  extractImageReferences(content) {
    const imageRegex = /<imageEmbed[^>]*src="([^"]+)"[^>]*>/g;
    const images = [];
    let match;

    while ((match = imageRegex.exec(content)) !== null) {
      const srcValue = match[1];
      // Accept plain names, "uploads/...", or "/uploads/..."
      if (
        !srcValue.includes('/') ||
        srcValue.startsWith('uploads/') ||
        srcValue.startsWith('/uploads/')
      ) {
        const filename = srcValue.replace(/^\/?uploads\//, ''); // strip "/uploads/" or "uploads/"
        images.push({
          fullMatch: match[0],
          filename,
          originalSrc: srcValue,
        });
      }
    }
    return images;
  }

  // Move image from uploads to rule directory
  moveImageToRuleDir(imageName, ruleDir) {
    const cleanName = imageName.replace(/^\/+/, '');
    const sourcePath = path.join(this.uploadsDir, cleanName);
    const targetPath = path.join(ruleDir, cleanName);

    if (fs.existsSync(sourcePath)) {
      if (!fs.existsSync(ruleDir)) {
        fs.mkdirSync(ruleDir, { recursive: true });
      }

      fs.copyFileSync(sourcePath, targetPath);
      fs.unlinkSync(sourcePath);
      console.log(`Moved ${cleanName} from uploads to ${ruleDir}`);
      return true;
    } else {
      console.warn(`Image ${cleanName} not found in uploads directory`);
      return false;
    }
  }

  // Update MDX content with new image paths
  updateImagePaths(content, images) {
    let updatedContent = content;
    images.forEach(image => {
      const newSrc = `./${image.filename}`;
      const oldPattern = new RegExp(`src="${image.originalSrc}"`, 'g');
      updatedContent = updatedContent.replace(oldPattern, `src="${newSrc}"`);
    });
    return updatedContent;
  }

  // Process a single MDX file
  processMDXFile(filePath) {
    console.log(`Processing: ${filePath}`);

    const content = fs.readFileSync(filePath, 'utf8');
    const images = this.extractImageReferences(content);

    if (images.length === 0) {
      console.log(`No images found in ${filePath}`);
      return;
    }

    const ruleDir = path.dirname(filePath);
    console.log(`Found ${images.length} images in rule: ${path.basename(ruleDir)}`);

    let contentChanged = false;
    const movedImages = [];

    images.forEach(image => {
      if (this.moveImageToRuleDir(image.filename, ruleDir)) {
        movedImages.push(image);
        contentChanged = true;
      }
    });

    if (contentChanged) {
      const updatedContent = this.updateImagePaths(content, movedImages);
      fs.writeFileSync(filePath, updatedContent, 'utf8');
      console.log(`Updated ${filePath} with new image paths`);
    }
  }

  run() {
    console.log('Starting image organization process...');

    if (!fs.existsSync(this.rulesDir)) {
      console.error('Rules directory not found:', this.rulesDir);
      return;
    }

    if (!fs.existsSync(this.uploadsDir)) {
      console.log('Uploads directory not found, nothing to process');
      return;
    }

    const changedMDXFiles = this.getAllMDXFiles();
    if (changedMDXFiles.length === 0) {
      console.log('No changed MDX files found');
      return;
    }

    changedMDXFiles.forEach(filePath => this.processMDXFile(filePath));
    console.log('Image organization complete!');
  }
}

new ImageOrganizer().run();
