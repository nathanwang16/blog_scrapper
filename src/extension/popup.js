// Get current tab info and display URL
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    const url = tabs[0].url;
    document.getElementById('current-url').textContent = url;
  }
});

// Handle PDF generation
document.getElementById('generate-btn').addEventListener('click', async () => {
  const button = document.getElementById('generate-btn');
  const statusDiv = document.getElementById('status');
  
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab) {
    showStatus('No active tab found', 'error');
    return;
  }
  
  // Check if URL is valid
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    showStatus('Cannot generate PDF for this page', 'error');
    return;
  }
  
  // Update UI to show generating state
  button.classList.add('generating');
  button.disabled = true;
  showStatus('Preparing PDF generation...', 'info');
  
  try {
    // Send message to background script
    chrome.runtime.sendMessage(
      { 
        action: 'generatePDF', 
        url: tab.url,
        title: tab.title 
      },
      (response) => {
        button.classList.remove('generating');
        button.disabled = false;
        
        if (response.success) {
          showStatus('PDF generated successfully! Check your downloads.', 'success');
          
          // Optional: Close popup after successful generation
          setTimeout(() => {
            window.close();
          }, 2000);
        } else {
          showStatus(response.error || 'Failed to generate PDF', 'error');
        }
      }
    );
  } catch (error) {
    button.classList.remove('generating');
    button.disabled = false;
    showStatus('An error occurred: ' + error.message, 'error');
  }
});

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
  
  // Auto-hide error and info messages
  if (type !== 'success') {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 5000);
  }
}