#!/usr/bin/env node

import puppeteer from 'puppeteer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { program } from 'commander';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PDF_OPTIONS = {
  format: 'A4',
  margin: { 
    top: '15mm', 
    bottom: '15mm', 
    left: '10mm', 
    right: '10mm' 
  },
  printBackground: true,
  displayHeaderFooter: false, // Disable headers/footers to preserve layout
  scale: 1, // Keep original scale
  preferCSSPageSize: true, // Respect page CSS if defined
  width: '210mm', // A4 width
  height: '297mm' // A4 height
};

class BlogArchiver {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    // Support 'auto' for automatic width detection
    this.viewportWidth = options.width === 'auto' ? 'auto' : (parseInt(options.width) || 'auto');
    this.fullPage = options.fullPage || false;
  }

  async init() {
    console.log(chalk.blue('🚀 Launching headless browser...'));
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    this.page = await this.browser.newPage();
    
    // Set initial viewport (will be adjusted if auto-width is enabled)
    const initialWidth = this.viewportWidth === 'auto' ? 1280 : this.viewportWidth;
    await this.page.setViewport({
      width: initialWidth,
      height: 720,
      deviceScaleFactor: 1
    });
    
    // Emulate print media type for better CSS handling
    await this.page.emulateMediaType('print');

    // Set user agent to avoid bot detection
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  }

  async detectOptimalViewport(url) {
    console.log(chalk.blue('🔍 Detecting optimal viewport width...'));
    
    // First load with a wide viewport to see actual content width
    await this.page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1
    });
    
    await this.page.goto(url, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: 60000
    });
    
    // Wait for content to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Detect the actual content width
    const dimensions = await this.page.evaluate(() => {
      // Find the main content container
      const selectors = [
        'article', 'main', '.content', '.post', '.entry-content',
        '.article-content', '.blog-post', '.post-content', '#content',
        '[role="main"]', '.container', '.wrapper'
      ];
      
      let contentElement = null;
      let maxWidth = 0;
      
      // Try to find the main content area
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          const rect = element.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(element);
          const totalWidth = rect.width + 
            parseFloat(computedStyle.marginLeft) + 
            parseFloat(computedStyle.marginRight);
          
          if (totalWidth > maxWidth) {
            maxWidth = totalWidth;
            contentElement = element;
          }
        }
      }
      
      // If no content container found, check body
      if (!contentElement) {
        const bodyRect = document.body.getBoundingClientRect();
        maxWidth = bodyRect.width;
      }
      
      // Also check for any overflowing elements
      const allElements = document.querySelectorAll('*');
      let documentWidth = maxWidth;
      
      allElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.right > documentWidth) {
          documentWidth = rect.right;
        }
      });
      
      // Get the scroll width as well
      const scrollWidth = Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth
      );
      
      return {
        contentWidth: Math.ceil(maxWidth),
        documentWidth: Math.ceil(documentWidth),
        scrollWidth: scrollWidth,
        recommendedWidth: Math.min(1400, Math.max(768, Math.ceil(documentWidth * 1.05))) // Add 5% padding, min 768, max 1400
      };
    });
    
    console.log(chalk.gray(`  Content width: ${dimensions.contentWidth}px`));
    console.log(chalk.gray(`  Document width: ${dimensions.documentWidth}px`));
    console.log(chalk.green(`  ✓ Optimal width: ${dimensions.recommendedWidth}px`));
    
    return dimensions.recommendedWidth;
  }
  
  async checkForOverflow() {
    return await this.page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      
      // Check if there's horizontal overflow
      const hasHorizontalOverflow = body.scrollWidth > body.clientWidth || 
                                   html.scrollWidth > html.clientWidth;
      
      // Check for elements that might be cut off
      const viewportWidth = window.innerWidth;
      const problematicElements = [];
      
      document.querySelectorAll('img, table, pre, .code-block, figure').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.right > viewportWidth || rect.left < 0) {
          problematicElements.push({
            tag: el.tagName,
            class: el.className,
            overflow: rect.right - viewportWidth
          });
        }
      });
      
      return {
        hasOverflow: hasHorizontalOverflow || problematicElements.length > 0,
        problematicElements
      };
    });
  }
  
  async extractHeadings(url) {
    console.log(chalk.blue('📑 Extracting headings for TOC...'));
    
    await this.page.goto(url, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: 60000
    });

    // Scroll to trigger lazy loading
    await this.autoScroll();

    // Wait for any dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract headings
    const headings = await this.page.evaluate(() => {
      const elements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const headingsList = [];
      
      elements.forEach((element, index) => {
        const level = parseInt(element.tagName.substring(1));
        const text = element.textContent.trim();
        const id = element.id || `heading-${index}`;
        
        // Add ID if missing for linking
        if (!element.id) {
          element.id = id;
        }
        
        headingsList.push({
          level,
          text,
          id,
          pageNumber: null // Will be estimated
        });
      });
      
      return headingsList;
    });

    return headings;
  }

  async autoScroll() {
    await this.page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if(totalHeight >= scrollHeight){
            clearInterval(timer);
            window.scrollTo(0, 0); // Scroll back to top
            resolve();
          }
        }, 100);
      });
    });
  }

  async generatePDFWithTOC(url, outputPath) {
    try {
      // Auto-detect optimal viewport if not manually specified
      if (this.viewportWidth === 1280 || this.viewportWidth === 'auto') {
        const optimalWidth = await this.detectOptimalViewport(url);
        this.viewportWidth = optimalWidth;
        
        // Update viewport with detected width
        await this.page.setViewport({
          width: this.viewportWidth,
          height: 720,
          deviceScaleFactor: 1
        });
      }
      
      // Extract headings
      const headings = await this.extractHeadings(url);
      const pageTitle = await this.page.title();

      // Wait for fonts to load
      await this.page.evaluateHandle('document.fonts.ready');
      
      // Inject custom styles for better PDF rendering and offline reading
      await this.page.addStyleTag({
        content: `
          @media print, screen {
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            
            /* Ensure links are visible */
            a {
              color: #0066cc !important;
              text-decoration: underline !important;
            }
            
            /* Better code block rendering with boundary control */
            pre, code {
              white-space: pre-wrap !important;
              word-wrap: break-word !important;
              overflow-wrap: break-word !important;
              max-width: 100% !important;
            }
            
            pre {
              max-width: 100% !important;
              overflow-x: auto !important;
              box-sizing: border-box !important;
            }
            
            /* Preserve original code styling */
            pre code {
              background: inherit !important;
              border: inherit !important;
              padding: inherit !important;
              display: block !important;
              max-width: 100% !important;
            }
            
            /* Prevent page breaks in important elements */
            h1, h2, h3, h4, h5, h6 {
              page-break-after: avoid;
            }
            
            p {
              orphans: 3;
              widows: 3;
            }
            
            /* Optimize images for offline reading */
            img {
              max-width: 100% !important;
              height: auto !important;
              page-break-inside: avoid !important;
            }
            
            /* Hide unnecessary elements for offline reading */
            .no-print, 
            nav:not(.article-nav),
            .navigation:not(.post-navigation),
            .sidebar:not(.article-sidebar),
            .advertisement,
            .cookie-banner,
            .popup,
            .modal,
            .comments-section,
            .social-share,
            .newsletter-signup,
            .related-posts:not(.essential),
            [class*="cookie"],
            [class*="banner"]:not(.content-banner),
            [class*="popup"]:not(.content-popup),
            [class*="social"],
            [class*="share"]:not(.content-share),
            [id*="cookie"],
            [id*="popup"]:not(.content-popup),
            iframe[src*="youtube"],
            iframe[src*="vimeo"],
            .video-container {
              display: none !important;
            }
            
            /* Strict boundary control to prevent overflow */
            * {
              max-width: 100% !important;
              box-sizing: border-box !important;
            }
            
            /* Ensure content fits within boundaries */
            body {
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow-x: hidden !important;
            }
            
            /* Content containers with boundary enforcement */
            article, .post-content, .entry-content, main, .content {
              width: auto !important;
              max-width: 100% !important;
              margin: 0 auto !important;
              overflow-x: hidden !important;
              word-wrap: break-word !important;
              overflow-wrap: break-word !important;
            }
            
            /* Paragraph text wrapping */
            p, li, dd, dt, blockquote {
              max-width: 100% !important;
              word-wrap: break-word !important;
              overflow-wrap: break-word !important;
              hyphens: auto !important;
            }
            
            /* Fix table overflow with scroll */
            table {
              max-width: 100% !important;
              width: auto !important;
              display: block !important;
              overflow-x: auto !important;
            }
            
            /* Responsive table cells */
            td, th {
              word-wrap: break-word !important;
              overflow-wrap: break-word !important;
              max-width: 300px !important;
            }
            
            /* Image boundary control */
            img, figure, picture, video, iframe, embed, object {
              max-width: 100% !important;
              height: auto !important;
              display: block !important;
              margin: 0 auto !important;
            }
            
            /* Figure captions */
            figcaption {
              max-width: 100% !important;
              word-wrap: break-word !important;
            }
            
            /* Long URLs and strings */
            a {
              word-wrap: break-word !important;
              overflow-wrap: break-word !important;
            }
          }
        `
      });

      // Scroll page to actual content height to ensure proper rendering
      await this.page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        const height = Math.max(
          body.scrollHeight, body.offsetHeight,
          html.clientHeight, html.scrollHeight, html.offsetHeight
        );
        window.scrollTo(0, height);
        window.scrollTo(0, 0);
      });
      
      // Wait a bit for layout to settle
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check for overflow after CSS injection
      const overflowCheck = await this.checkForOverflow();
      if (overflowCheck.hasOverflow) {
        console.log(chalk.yellow('⚠️  Content overflow detected, adjusting...'));
        if (overflowCheck.problematicElements.length > 0) {
          console.log(chalk.gray('  Problematic elements:'));
          overflowCheck.problematicElements.forEach(el => {
            console.log(chalk.gray(`    - ${el.tag}: ${el.overflow}px overflow`));
          });
        }
        
        // Try to fix with additional CSS
        await this.page.addStyleTag({
          content: `
            @media print, screen {
              /* Force all content to fit */
              * {
                max-width: 100% !important;
                overflow-x: hidden !important;
              }
              body {
                overflow-x: hidden !important;
              }
            }
          `
        });
      }
      
      console.log(chalk.blue('📄 Generating PDF for offline reading...'));
      
      // Adjust PDF options based on settings
      const pdfOptions = { ...DEFAULT_PDF_OPTIONS };
      if (this.fullPage) {
        // For full page capture, remove fixed height
        delete pdfOptions.height;
        pdfOptions.format = undefined;
        pdfOptions.width = '210mm';
      }
      
      // Generate the main content PDF
      const pdfBuffer = await this.page.pdf(pdfOptions);

      // Create TOC if headings exist
      if (headings.length > 0) {
        console.log(chalk.blue('📚 Adding interactive table of contents...'));
        const finalPdf = await this.addTOC(pdfBuffer, headings, pageTitle, url);
        await fs.writeFile(outputPath, finalPdf);
      } else {
        await fs.writeFile(outputPath, pdfBuffer);
      }

      // Get file size for reporting
      const stats = await fs.stat(outputPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      console.log(chalk.green(`✅ Blog archived: ${outputPath} (${fileSizeMB} MB)`));
      return outputPath;
    } catch (error) {
      console.error(chalk.red('❌ Error archiving blog:'), error);
      throw error;
    }
  }

  async addTOC(pdfBuffer, headings, title, url) {
    const existingPdfDoc = await PDFDocument.load(pdfBuffer);
    const pdfDoc = await PDFDocument.create();
    
    // Embed font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Create TOC page
    const tocPage = pdfDoc.addPage();
    const { width, height } = tocPage.getSize();
    const margin = 50;
    let yPosition = height - margin;
    
    // Title
    tocPage.drawText('Table of Contents', {
      x: margin,
      y: yPosition,
      size: 24,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    
    yPosition -= 40;
    
    // Document title
    tocPage.drawText(title, {
      x: margin,
      y: yPosition,
      size: 14,
      font: font,
      color: rgb(0.3, 0.3, 0.3)
    });
    
    yPosition -= 10;
    
    // URL
    tocPage.drawText(url.substring(0, 70) + (url.length > 70 ? '...' : ''), {
      x: margin,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0.4, 0.4, 0.7)
    });
    
    yPosition -= 10;
    
    // Archive date
    tocPage.drawText(`Archived: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, {
      x: margin,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0.5, 0.5, 0.5)
    });
    
    yPosition -= 30;
    
    // TOC entries
    const pageEstimate = existingPdfDoc.getPageCount();
    let currentPage = 2; // Starting after TOC page
    
    for (const heading of headings) {
      if (yPosition < margin + 50) {
        // Add new TOC page if needed
        const newTocPage = pdfDoc.addPage();
        yPosition = height - margin;
      }
      
      const indent = (heading.level - 1) * 20;
      const fontSize = heading.level === 1 ? 12 : 10;
      const textFont = heading.level === 1 ? boldFont : font;
      
      // Estimate page number (rough calculation)
      const estimatedPage = Math.min(
        currentPage + Math.floor(headings.indexOf(heading) * pageEstimate / headings.length),
        currentPage + pageEstimate - 1
      );
      
      // Draw heading text
      tocPage.drawText(heading.text.substring(0, 60) + (heading.text.length > 60 ? '...' : ''), {
        x: margin + indent,
        y: yPosition,
        size: fontSize,
        font: textFont,
        color: rgb(0, 0, 0)
      });
      
      // Draw page number
      tocPage.drawText(estimatedPage.toString(), {
        x: width - margin - 30,
        y: yPosition,
        size: fontSize,
        font: font,
        color: rgb(0.5, 0.5, 0.5)
      });
      
      yPosition -= fontSize + 8;
    }
    
    // Copy all pages from original PDF
    const pages = await pdfDoc.copyPages(existingPdfDoc, existingPdfDoc.getPageIndices());
    pages.forEach(page => pdfDoc.addPage(page));
    
    // Add metadata
    pdfDoc.setTitle(`${title} - Offline Archive`);
    pdfDoc.setAuthor('Blog Archiver');
    pdfDoc.setSubject(`Archived from: ${url}`);
    pdfDoc.setKeywords(['blog', 'archive', 'offline', title.split(' ').slice(0, 5).join(', ')]);
    pdfDoc.setCreationDate(new Date());
    pdfDoc.setModificationDate(new Date());
    
    return await pdfDoc.save();
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// CLI Interface
program
  .name('blog-archiver')
  .description('Archive blogs for offline reading - converts to beautiful PDFs with interactive TOC')
  .version('1.0.0')
  .argument('[urls...]', 'URL(s) of blog posts to archive')
  .option('-o, --output <path>', 'Output directory for PDFs', './archive')
  .option('-f, --file <path>', 'Read URLs from a text file (one per line)')
  .option('--batch', 'Enable batch mode for processing multiple URLs')
  .option('--delay <ms>', 'Delay between processing URLs in batch mode', '2000')
  .option('--width <pixels>', 'Viewport width for rendering (default: auto)', 'auto')
  .option('--full-page', 'Capture full page height without pagination')
  .action(async (urls, options) => {
    const archiver = new BlogArchiver({
      width: options.width,
      fullPage: options.fullPage
    });
    
    try {
      // Collect URLs from various sources
      let urlsToProcess = [...urls];
      
      // Read URLs from file if specified
      if (options.file) {
        try {
          const fileContent = await fs.readFile(options.file, 'utf-8');
          const fileUrls = fileContent.split('\n').filter(line => line.trim());
          urlsToProcess = [...urlsToProcess, ...fileUrls];
        } catch (err) {
          console.error(chalk.red(`❌ Failed to read file: ${options.file}`));
          process.exit(1);
        }
      }
      
      // If no URLs provided, show help
      if (urlsToProcess.length === 0) {
        console.log(chalk.yellow('ℹ️  No URLs provided. Use --help for usage information.'));
        program.help();
      }
      
      // Validate all URLs
      const validUrls = [];
      for (const url of urlsToProcess) {
        try {
          new URL(url);
          validUrls.push(url);
        } catch {
          console.error(chalk.red(`❌ Invalid URL: ${url}`));
        }
      }
      
      if (validUrls.length === 0) {
        console.error(chalk.red('❌ No valid URLs to process'));
        process.exit(1);
      }
      
      console.log(chalk.blue(`\n📚 Archiving ${validUrls.length} blog${validUrls.length > 1 ? 's' : ''} for offline reading...\n`));
      
      // Ensure output directory exists
      const outputDir = options.output || './archive';
      await fs.mkdir(outputDir, { recursive: true });
      
      // Initialize archiver
      await archiver.init();
      
      const results = [];
      const delay = parseInt(options.delay) || 2000;
      
      // Process each URL
      for (let i = 0; i < validUrls.length; i++) {
        const url = validUrls[i];
        console.log(chalk.blue(`\n[${i + 1}/${validUrls.length}] Processing: ${url}`));
        
        try {
          // Generate output filename with blog title if possible
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
          const hostname = new URL(url).hostname.replace(/\./g, '_');
          const outputPath = path.join(outputDir, `${hostname}_${timestamp}.pdf`);
          
          // Generate PDF
          await archiver.generatePDFWithTOC(url, outputPath);
          results.push({ url, status: 'success', path: outputPath });
          
          // Add delay between requests in batch mode
          if (i < validUrls.length - 1 && validUrls.length > 1) {
            console.log(chalk.gray(`⏳ Waiting ${delay}ms before next request...`));
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (error) {
          console.error(chalk.red(`❌ Failed to archive: ${error.message}`));
          results.push({ url, status: 'failed', error: error.message });
        }
      }
      
      // Summary
      console.log(chalk.green('\n✨ Archive complete!\n'));
      const successful = results.filter(r => r.status === 'success');
      const failed = results.filter(r => r.status === 'failed');
      
      console.log(chalk.cyan(`📊 Summary:`));
      console.log(chalk.green(`   ✅ Successfully archived: ${successful.length}`));
      if (failed.length > 0) {
        console.log(chalk.red(`   ❌ Failed: ${failed.length}`));
        failed.forEach(f => {
          console.log(chalk.red(`      - ${f.url}: ${f.error}`));
        });
      }
      console.log(chalk.cyan(`\n📁 Archive location: ${path.resolve(outputDir)}\n`));
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to archive blogs:'), error.message);
      process.exit(1);
    } finally {
      await archiver.close();
    }
  });

program.parse();