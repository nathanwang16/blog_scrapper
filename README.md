# Blog Archiver - Save Blogs for Offline Reading

A powerful tool for archiving blogs and articles for offline reading. Perfect for saving your favorite blog posts, technical documentation, and JavaScript-heavy websites as beautiful, searchable PDFs with interactive table of contents.

## 🎯 Purpose

In an era where content can disappear at any moment, **Blog Archiver** helps you:
- **Preserve valuable content**: Save blog posts before they're deleted or paywalled
- **Read offline**: Access your favorite articles without internet connection
- **Build a personal library**: Create a searchable archive of technical knowledge
- **Archive JavaScript-heavy sites**: Capture content from React, Vue, and other SPA blogs
- **Batch processing**: Archive entire blog series or multiple articles at once

## ✨ Features

- 📄 **Beautiful PDF Output**: Professional A4 formatting optimized for reading
- 🎯 **Auto-Width Detection**: Automatically detects optimal viewport width for each website
- 📚 **Interactive Table of Contents**: Auto-generated clickable TOC from document structure
- 🎨 **Full Content Preservation**: Maintains original styling, code blocks, and images
- 🚫 **Overflow Prevention**: Ensures images and text don't exceed page boundaries
- 🔗 **Functional Links**: All hyperlinks remain clickable in the PDF
- 📸 **Smart Content Loading**: Handles lazy-loaded images and dynamic JavaScript content
- 📝 **Clean Reading Experience**: Automatically removes ads, popups, and distractions
- ⚡ **Batch Processing**: Archive multiple blog posts in one command
- 🏷️ **Rich Metadata**: Includes archive date, source URL, and searchable keywords

## 🚀 Installation

### Node.js CLI Tool

1. Clone this repository:
```bash
git clone https://github.com/nathanwang16/blog_scrapper.git
cd blog_scrapper
```

2. Install dependencies:
```bash
npm install
```

3. Make the CLI tool executable:
```bash
chmod +x src/cli/blog-archiver.js
```

### Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `src/extension` directory from this project
5. The Blog Archiver icon will appear in your browser toolbar

## 📖 Usage

### CLI Tool - Single Blog Post

```bash
# Archive a single blog post
node src/cli/blog-archiver.js https://example.com/blog/post

# Using npm script
npm run archive https://example.com/blog/post

# Specify output directory
node src/cli/blog-archiver.js https://example.com/blog/post -o my-archive/
```

### CLI Tool - Batch Processing

```bash
# Archive multiple blog posts
node src/cli/blog-archiver.js \
  https://blog1.com/post1 \
  https://blog2.com/post2 \
  https://blog3.com/post3

# Read URLs from a text file (one URL per line)
node src/cli/blog-archiver.js -f blog-urls.txt

# Batch mode with custom delay between requests
node src/cli/blog-archiver.js -f blog-urls.txt --batch --delay 3000

# Combine command line URLs with file input
node src/cli/blog-archiver.js https://blog.com/post -f more-urls.txt
```

### Example: Archiving a Blog Series

Create a file `blog-series.txt`:
```
https://overreacted.io/a-complete-guide-to-useeffect/
https://overreacted.io/how-are-function-components-different-from-classes/
https://overreacted.io/why-do-hooks-rely-on-call-order/
```

Then archive them all:
```bash
node src/cli/blog-archiver.js -f blog-series.txt -o react-hooks-archive/
```

### Chrome Extension

1. **Quick Archive**:
   - Navigate to any blog post
   - Click the Blog Archiver extension icon
   - Click "Generate PDF"
   - PDF downloads automatically to your Downloads folder

2. **Right-Click Archive**:
   - Right-click anywhere on a blog post
   - Select "Generate PDF of this page"
   - PDF downloads automatically

## 📁 Output Structure

PDFs are saved with descriptive filenames:
```
archive/
├── overreacted_io_2024-09-25T14-30-45.pdf
├── medium_com_2024-09-25T14-35-12.pdf
└── dev_to_2024-09-25T14-40-23.pdf
```

Each PDF includes:
- **Table of Contents**: First page with clickable navigation
- **Metadata**: Archive date, source URL, and keywords
- **Full Content**: Complete blog post with preserved formatting
- **Page Numbers**: Professional footer with page numbers

## 🎨 PDF Features

### Optimized for Offline Reading
- Removes advertisements and tracking scripts
- Hides social media widgets and comment sections
- Eliminates newsletter popups and cookie banners
- Preserves only the essential content

### Enhanced Typography
- Clean, readable font sizing (11pt)
- Optimized line spacing (1.6)
- Professional margins for comfortable reading
- Code blocks with syntax-appropriate formatting

### Smart Content Handling
- Auto-scrolls to load lazy images
- Waits for JavaScript rendering
- Captures dynamically loaded content
- Preserves code snippets with proper formatting

## 🛠️ Use Cases

### Personal Knowledge Base
Archive technical tutorials and documentation for offline reference:
```bash
node src/cli/blog-archiver.js \
  https://react.dev/learn/thinking-in-react \
  https://vuejs.org/guide/essentials/reactivity-fundamentals \
  -o technical-docs/
```

### Research Archive
Save academic articles and research papers:
```bash
node src/cli/blog-archiver.js -f research-papers.txt -o research-archive/
```

### Blog Backup
Archive your own blog posts as backup:
```bash
node src/cli/blog-archiver.js -f my-blog-posts.txt -o blog-backup/
```

### Tutorial Collections
Build offline tutorial collections for learning:
```bash
node src/cli/blog-archiver.js -f python-tutorials.txt -o python-learning/
```

## ⚙️ Configuration

### Auto-Width Detection (New!)
The tool now automatically detects the optimal viewport width for each website:
- **Automatic by default**: No need to specify width manually
- **Smart detection**: Analyzes content containers and actual document width
- **Overflow prevention**: Ensures all content fits within page boundaries
- **Manual override**: Still possible with `--width` option if needed

### PDF Generation Options
```bash
# Auto-detect width (default)
node src/cli/blog-archiver.js https://blog.com/post

# Manual width override
node src/cli/blog-archiver.js https://blog.com/post --width 1920

# Full page capture without pagination
node src/cli/blog-archiver.js https://blog.com/post --full-page
```

### Default PDF Settings
- **Format**: A4 (210mm × 297mm)
- **Margins**: 15mm top/bottom, 10mm left/right
- **Scale**: 1.0 (preserves original dimensions)
- **Width detection**: Automatic (768px min, 1400px max)
- **Backgrounds**: Preserves background colors and images

### Batch Processing Options
- **Default delay**: 2000ms between requests
- **Output directory**: `./archive` (customizable with `-o`)
- **Timeout**: 60 seconds per page
- **Viewport width**: Auto-detected per URL

## 🔧 Troubleshooting

### CLI Tool Issues

**Error: "Failed to launch browser"**
```bash
# Install Puppeteer dependencies
npm install

# On Linux, install system dependencies:
sudo apt-get install -y libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 libnss3 libcups2 libxss1 libxrandr2 libasound2 libpangocairo-1.0-0 libatk1.0-0 libcairo-gobject2 libgtk-3-0
```

**Error: "Timeout waiting for page load"**
- Some blogs may take longer to load
- Check your internet connection
- Try increasing the delay between batch requests

### Chrome Extension Issues

**Extension doesn't appear**
- Ensure Developer mode is enabled
- Reload the extension in chrome://extensions/
- Check browser console for errors (F12)

**PDF generation fails**
- Some Chrome-internal pages cannot be converted
- Ensure the page is fully loaded before generating
- Check if the site blocks extensions

## 📚 Project Structure

```
blog_scrapper/
├── package.json            # Node.js dependencies and scripts
├── README.md              # Documentation
├── src/
│   ├── cli/
│   │   ├── blog-archiver.js    # Main CLI tool for batch archiving
│   │   └── pdf-generator.js    # Legacy single PDF generator
│   └── extension/
│       ├── manifest.json       # Chrome extension configuration
│       ├── popup.html         # Extension UI
│       ├── popup.js          # UI logic
│       └── background.js     # Service worker for PDF generation
├── archive/              # Default output directory for PDFs
└── output/              # Legacy output directory
```

## 🤝 Contributing

Contributions are welcome! Some ideas for improvements:
- Add support for other browsers (Firefox, Safari)
- Implement full-text search across archived PDFs
- Add support for archiving to other formats (EPUB, Markdown)
- Create a web interface for managing archives
- Add automatic RSS feed monitoring and archiving

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built with [Puppeteer](https://pptr.dev/) for headless browser automation
- Uses [pdf-lib](https://pdf-lib.js.org/) for PDF manipulation
- Styled with [Chalk](https://github.com/chalk/chalk) for beautiful CLI output
- Powered by Chrome Extension Manifest V3

---

**Note**: This tool is intended for personal use and respecting content creators' rights. Always check the website's terms of service and robots.txt before archiving content. Consider supporting creators whose content you find valuable.