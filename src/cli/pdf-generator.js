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
    top: '20mm', 
    bottom: '20mm', 
    left: '15mm', 
    right: '15mm' 
  },
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: `
    <div style="font-size: 10px; text-align: center; width: 100%; color: #666;">
      <span class="title"></span>
    </div>
  `,
  footerTemplate: `
    <div style="font-size: 10px; text-align: center; width: 100%; color: #666;">
      Page <span class="pageNumber"></span> of <span class="totalPages"></span>
    </div>
  `,
  scale: 0.95,
  preferCSSPageSize: false
};

class PDFGenerator {
  constructor() {
    this.browser = null;
    this.page = null;
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
    
    // Set viewport for consistent rendering
    await this.page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2
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
      // Extract headings first
      const headings = await this.extractHeadings(url);
      const pageTitle = await this.page.title();

      // Inject custom styles for better PDF rendering
      await this.page.addStyleTag({
        content: `
          @media print {
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
            }
            
            /* Prevent page breaks in important elements */
            h1, h2, h3, h4, h5, h6 {
              page-break-after: avoid;
            }
            
            p {
              orphans: 3;
              widows: 3;
            }
            
            /* Hide unnecessary elements */
            .no-print, 
            nav,
            .navigation,
            .sidebar,
            .advertisement,
            .cookie-banner {
              display: none !important;
            }
          }
        `
      });

      console.log(chalk.blue('📄 Generating initial PDF...'));
      
      // Generate the main content PDF
      const pdfBuffer = await this.page.pdf(DEFAULT_PDF_OPTIONS);

      // Create TOC if headings exist
      if (headings.length > 0) {
        console.log(chalk.blue('📚 Adding interactive table of contents...'));
        const finalPdf = await this.addTOC(pdfBuffer, headings, pageTitle, url);
        await fs.writeFile(outputPath, finalPdf);
      } else {
        await fs.writeFile(outputPath, pdfBuffer);
      }

      console.log(chalk.green(`✅ PDF saved to: ${outputPath}`));
      return outputPath;
    } catch (error) {
      console.error(chalk.red('❌ Error generating PDF:'), error);
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
    tocPage.drawText(url, {
      x: margin,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0.4, 0.4, 0.7)
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
    pdfDoc.setTitle(title);
    pdfDoc.setAuthor('PDF Generator');
    pdfDoc.setSubject(`Generated from: ${url}`);
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
  .name('pdf-generator')
  .description('Generate high-fidelity PDFs from JavaScript-rendered webpages')
  .version('1.0.0')
  .argument('<url>', 'URL of the webpage to convert')
  .option('-o, --output <path>', 'Output PDF file path', null)
  .action(async (url, options) => {
    const generator = new PDFGenerator();
    
    try {
      // Validate URL
      try {
        new URL(url);
      } catch {
        console.error(chalk.red('❌ Invalid URL provided'));
        process.exit(1);
      }
      
      // Generate output filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const hostname = new URL(url).hostname.replace(/\./g, '_');
      const outputPath = options.output || 
        path.join(__dirname, '..', '..', 'output', `${hostname}_${timestamp}.pdf`);
      
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      await fs.mkdir(outputDir, { recursive: true });
      
      // Generate PDF
      await generator.init();
      await generator.generatePDFWithTOC(url, outputPath);
      
      console.log(chalk.green('\n✨ PDF generation complete!'));
      console.log(chalk.cyan(`📁 File location: ${outputPath}`));
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to generate PDF:'), error.message);
      process.exit(1);
    } finally {
      await generator.close();
    }
  });

program.parse();