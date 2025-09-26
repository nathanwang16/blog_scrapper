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
    this.viewportWidth = parseInt(options.width) || 1280;
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
    
    // Set viewport to match content width for better layout preservation
    await this.page.setViewport({
      width: this.viewportWidth,
      height: 720,
      deviceScaleFactor: 1
    });
    
    // Emulate print media type for better CSS handling
    await this.page.emulateMediaType('print');

    // Set user agent to avoid bot detection
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
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
      // Extract headings first
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
            
            /* Better code block rendering */
            pre, code {
              white-space: pre-wrap !important;
              word-wrap: break-word !important;
              overflow-x: auto !important;
            }
            
            pre {
              max-width: 100% !important;
              overflow-x: auto !important;
            }
            
            /* Preserve original code styling */
            pre code {
              background: inherit !important;
              border: inherit !important;
              padding: inherit !important;
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
            
            /* Preserve original layout */
            * {
              max-width: 100% !important;
              box-sizing: border-box !important;
            }
            
            /* Ensure content fits */
            body {
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            
            /* Keep original article width but ensure it fits */
            article, .post-content, .entry-content, main {
              width: auto !important;
              max-width: 100% !important;
              margin: 0 auto !important;
            }
            
            /* Fix table overflow */
            table {
              max-width: 100% !important;
              width: auto !important;
            }
            
            /* Fix image sizing */
            img, figure, picture {
              max-width: 100% !important;
              height: auto !important;
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
  .option('--width <pixels>', 'Viewport width for rendering (default: 1280)', '1280')
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