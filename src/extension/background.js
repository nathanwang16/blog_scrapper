// Background service worker for PDF generation

// Fixed PDF settings for beautiful output
const PDF_SETTINGS = {
  landscape: false,
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
  printBackground: true,
  scale: 0.95,
  paperWidth: 8.27,  // A4 width in inches
  paperHeight: 11.69, // A4 height in inches
  marginTop: 0.79,    // ~20mm in inches
  marginBottom: 0.79,
  marginLeft: 0.59,   // ~15mm in inches
  marginRight: 0.59,
  preferCSSPageSize: false
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generatePDF') {
    handlePDFGeneration(request.url, request.title)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    // Return true to indicate async response
    return true;
  }
});

async function handlePDFGeneration(url, title) {
  try {
    // First, we need to inject a content script to prepare the page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    // Inject CSS for better PDF rendering
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      css: `
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
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
            overflow-wrap: break-word !important;
          }
          
          /* Prevent page breaks in headings */
          h1, h2, h3, h4, h5, h6 {
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          
          /* Better paragraph handling */
          p {
            orphans: 3;
            widows: 3;
          }
          
          /* Hide unnecessary elements */
          .no-print, 
          nav:not(.toc),
          .navigation,
          .sidebar:not(.toc),
          .advertisement,
          .cookie-banner,
          .popup,
          .modal,
          .chat-widget,
          [class*="cookie"],
          [class*="banner"]:not(.content-banner),
          [id*="cookie"],
          [id*="popup"]:not(.content-popup) {
            display: none !important;
          }
          
          /* Ensure images fit properly */
          img {
            max-width: 100% !important;
            height: auto !important;
          }
          
          /* Table improvements */
          table {
            border-collapse: collapse !important;
          }
          
          th, td {
            border: 1px solid #ddd !important;
            padding: 8px !important;
          }
        }
      `
    });
    
    // Execute script to prepare page and extract TOC
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: preparePageForPDF
    });
    
    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const hostname = new URL(url).hostname.replace(/\./g, '_');
    const filename = `${hostname}_${timestamp}.pdf`;
    
    // Use Chrome's printing API to generate PDF
    // Note: This requires Chrome 99+ for full PDF options support
    if (chrome.printing) {
      // Use Chrome printing API if available
      await generateWithPrintingAPI(tab.id, filename);
    } else {
      // Fallback: trigger print dialog
      await chrome.tabs.printToPDF(
        PDF_SETTINGS,
        (pdfData) => {
          if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message);
          }
          
          // Convert array buffer to blob and download
          const blob = new Blob([pdfData], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          
          chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: false
          }, (downloadId) => {
            if (chrome.runtime.lastError) {
              console.error('Download error:', chrome.runtime.lastError);
            } else {
              console.log('PDF downloaded with ID:', downloadId);
            }
            
            // Clean up blob URL after download starts
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          });
        }
      );
    }
    
    return { success: true, filename: filename };
    
  } catch (error) {
    console.error('PDF generation error:', error);
    return { success: false, error: error.message };
  }
}

// Function to be injected into the page
function preparePageForPDF() {
  // Scroll to load all lazy content
  let scrollPromise = new Promise((resolve) => {
    let totalHeight = 0;
    const distance = 100;
    const timer = setInterval(() => {
      const scrollHeight = document.body.scrollHeight;
      window.scrollBy(0, distance);
      totalHeight += distance;

      if(totalHeight >= scrollHeight){
        clearInterval(timer);
        window.scrollTo(0, 0); // Scroll back to top
        setTimeout(resolve, 1000); // Wait for content to settle
      }
    }, 100);
  });
  
  // Extract headings for potential TOC
  const extractHeadings = () => {
    const headings = [];
    const elements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    elements.forEach((element, index) => {
      const level = parseInt(element.tagName.substring(1));
      const text = element.textContent.trim();
      const id = element.id || `heading-${index}`;
      
      // Add ID if missing for potential linking
      if (!element.id) {
        element.id = id;
      }
      
      headings.push({
        level,
        text,
        id
      });
    });
    
    return headings;
  };
  
  return scrollPromise.then(() => {
    return {
      headings: extractHeadings(),
      title: document.title,
      url: window.location.href
    };
  });
}

// Alternative: Use Chrome Printing API if available
async function generateWithPrintingAPI(tabId, filename) {
  if (!chrome.printing) {
    throw new Error('Chrome Printing API not available');
  }
  
  try {
    // Get print job ticket
    const ticket = {
      version: '1.0',
      print: {
        color: { type: 'STANDARD_COLOR' },
        duplex: { type: 'NO_DUPLEX' },
        page_orientation: { type: 'PORTRAIT' },
        copies: { copies: 1 },
        dpi: { horizontal_dpi: 300, vertical_dpi: 300 },
        media_size: {
          width_microns: 210000,  // A4 width
          height_microns: 297000, // A4 height
          is_continuous_feed: false,
          vendor_id: 'A4'
        },
        collate: { collate: false },
        reverse_order: { reverse_order: false }
      }
    };
    
    // Submit print job
    const job = await chrome.printing.submitJob({
      job: {
        printerId: 'Save as PDF',
        title: filename,
        ticket: JSON.stringify(ticket),
        contentType: 'application/pdf',
        document: {
          tabId: tabId
        }
      }
    });
    
    return job;
  } catch (error) {
    console.error('Printing API error:', error);
    throw error;
  }
}

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('PDF Generator Extension installed');
  
  // Create context menu item
  chrome.contextMenus.create({
    id: 'generate-pdf',
    title: 'Generate PDF of this page',
    contexts: ['page']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'generate-pdf') {
    try {
      const result = await handlePDFGeneration(tab.url, tab.title);
      if (result.success) {
        // Show notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon-128.png',
          title: 'PDF Generated',
          message: `PDF saved as ${result.filename}`
        });
      }
    } catch (error) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon-128.png',
        title: 'PDF Generation Failed',
        message: error.message
      });
    }
  }
});