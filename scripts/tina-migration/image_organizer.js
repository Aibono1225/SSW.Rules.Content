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
    const scanDirectory = (dir) => {
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
      // Only process images that don't already have a full path
      if (!srcValue.includes('/') || srcValue.startsWith('uploads/')) {
        images.push({
          fullMatch: match[0],
          filename: srcValue.replace('uploads/', ''), // Remove uploads/ prefix if present
          originalSrc: srcValue
        });
      }
    }
    
    return images;
  }

  // Move image from uploads to rule directory
  moveImageToRuleDir(imageName, ruleDir) {
    const sourcePath = path.join(this.uploadsDir, imageName);
    const targetPath = path.join(ruleDir, imageName);
    
    if (fs.existsSync(sourcePath)) {
      // Ensure target directory exists
      if (!fs.existsSync(ruleDir)) {
        fs.mkdirSync(ruleDir, { recursive: true });
      }
      
      // Move the file
      fs.copyFileSync(sourcePath, targetPath);
      fs.unlinkSync(sourcePath);
      console.log(`Moved ${imageName} from uploads to ${ruleDir}`);
      return true;
    } else {
      console.warn(`Image ${imageName} not found in uploads directory`);
      return false;
    }
  }

  // Update MDX content with new image paths
  updateImagePaths(content, images, ruleName) {
    let updatedContent = content;
    
    images.forEach(image => {
      // Create the new relative path
      const newSrc = `./${image.filename}`;
      
      // Replace the src attribute in the imageEmbed component
      const oldPattern = new RegExp(`src="${image.originalSrc}"`, 'g');
      updatedContent = updatedContent.replace(oldPattern, `src="${newSrc}"`);
    });
    
    return updatedContent;
  }

  // Process a single MDX file
  processMDXFile(filePath) {
    console.log(`Processing: ${filePath}`);
    
    // Read the MDX file
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Extract image references
    const images = this.extractImageReferences(content);
    
    if (images.length === 0) {
      console.log(`No images found in ${filePath}`);
      return;
    }
    
    // Get rule directory (directory containing the MDX file)
    const ruleDir = path.dirname(filePath);
    const ruleName = path.basename(ruleDir);
    
    console.log(`Found ${images.length} images in rule: ${ruleName}`);
    
    let contentChanged = false;
    const movedImages = [];
    
    // Process each image
    images.forEach(image => {
      const imageMoved = this.moveImageToRuleDir(image.filename, ruleDir);
      if (imageMoved) {
        movedImages.push(image);
        contentChanged = true;
      }
    });
    
    // Update MDX file if any images were moved
    if (contentChanged) {
      const updatedContent = this.updateImagePaths(content, movedImages, ruleName);
      fs.writeFileSync(filePath, updatedContent, 'utf8');
      console.log(`Updated ${filePath} with new image paths`);
    }
  }

  // Main execution method
  run() {
    console.log('Starting image organization process...');
    
    // Check if directories exist
    if (!fs.existsSync(this.rulesDir)) {
      console.error('Rules directory not found:', this.rulesDir);
      return;
    }
    
    if (!fs.existsSync(this.uploadsDir)) {
      console.log('Uploads directory not found, nothing to process');
      return;
    }
    
    // Get changed MDX files
    // const changedMDXFiles = this.getChangedMDXFiles();

    const changedMDXFiles = this.getChangedMDXFiles();
    
    if (changedMDXFiles.length === 0) {
      console.log('No changed MDX files found');
      return;
    }
    
    // Process each changed file
    changedMDXFiles.forEach(filePath => {
      this.processMDXFile(filePath);
    });
    
    console.log('Image organization complete!');
  }
}

// Create and run the organizer
const organizer = new ImageOrganizer();
organizer.run();