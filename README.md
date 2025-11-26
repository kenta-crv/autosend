# Contact Form Automation

Automated system that finds and fills contact forms on company websites with intelligent detection, multi-language support, and comprehensive email tracking.

## Table of Contents

- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Running the System](#running-the-system)
- [Output & Results](#output--results)
- [Features](#features)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)

## How It Works

The system processes companies through 4 main stages:

### 1. Contact Page Finder (ContactPageFinder)

Locates the contact page using two methods:

**Method A: Homepage Link Analysis (Primary)**
- Loads the company homepage
- Extracts all links with their text content (including nested spans)
- Searches for contact keywords in 11+ languages:
  - English: "contact", "get in touch", "reach us"
  - Hebrew: "צור קשר"
  - Japanese: "お問い合わせ"
  - Spanish: "contacto", and more
- Excludes non-contact pages (careers, blog, press)
- Returns the first matching contact link

**Method B: Direct URL Patterns (Fallback)**
- Tests common contact page paths: `/contact/`, `/contact-us/`, `/contactus/`, `/get-in-touch/`, `/inquiry/`, `/support/`
- Checks if each URL returns HTTP 200
- Returns first valid URL found

### 2. Form Analyzer (FormAnalyzer)

Identifies and scores contact forms on the page:

- Finds all `<form>` elements on the page
- Scores each form based on:
  - Email fields (+15 points)
  - Message/textarea fields (+10 points)
  - Name fields (+5 points)
  - Phone fields (+5 points)
  - Submit buttons (+5 points)
- Selects the form with highest score (best contact form)
- Extracts all input fields with metadata (type, name, ID, labels, placeholders, required status)

### 3. Form Submitter (FormSubmitter)

Fills and submits the form:

**Field Filling:**
- Maps fields to test data based on name/type:
  - Email fields → TEST_EMAIL
  - Phone fields → TEST_PHONE
  - Name fields → "Test User"
  - Message fields → TEST_MESSAGE
  - Company fields → "Test Company Inc."
- Fills fields using 3 strategies (tries in order):
  1. Fill by ID attribute
  2. Fill by name attribute
  3. Fill by CSS selector
- Triggers change events for validation

**Pre-Submission:**
- Auto-checks ALL unchecked checkboxes (terms, privacy, newsletter)
- Detects CAPTCHA/bot protection (reCAPTCHA, hCaptcha, Cloudflare Turnstile)
- Skips submission if CAPTCHA detected

**Submission:**
- Finds submit button using multi-language keywords
- Clicks the submit button
- Waits 3 seconds for response

**Success Detection:**
- Checks for success keywords in page content (11+ languages)
- Checks if URL changed (often redirects to thank-you page)
- Checks for `/thank-you`, `/success` in final URL

### 4. Contact Form Processor (ContactFormProcessor)

Orchestrates the entire workflow:

```
Start
  ↓
Initialize Browser (Puppeteer)
  ↓
For each company:
  ↓
  Get Homepage URL
  ↓
  Find Contact Page
  ↓
  Analyze Form
  ↓
  Fill & Submit Form
  ↓
  Save Results
  ↓
  Wait delay (2 seconds default)
  ↓
Next company
  ↓
Generate Final Report
  ↓
Close Browser
```

## Prerequisites

- Node.js 18 or higher
- Redis (for queue processing only, optional for direct processing)
- POP3 email account (for email tracking, optional)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file in the root directory:

```env
# Browser Configuration
HEADLESS=true
BROWSER_TIMEOUT=30000
PAGE_LOAD_TIMEOUT=30000

# Redis Configuration (for Bull queue)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Queue Configuration
QUEUE_CONCURRENCY=3
QUEUE_DELAY_BETWEEN_JOBS=2000

# Form Submission Configuration
TEST_EMAIL=test@example.com
TEST_PHONE=+1234567890
TEST_WEBSITE=mail@ebisu-hotel.tokyo
TEST_MESSAGE=This is a test submission from automated form filler.

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs

# Results
RESULTS_OUTPUT_PATH=./results
```

### 3. Prepare Your Data

Create a `companies.csv` file with the following columns:

```csv
id,name,url,contact_url
1,Company Name,https://example.com,
2,Another Company,https://example2.com,https://example2.com/contact
3,Third Company,https://example3.com,
```

**Column Definitions:**
- `id` - Unique identifier for each company
- `name` - Company name
- `url` - Homepage URL
- `contact_url` - (Optional) Direct contact page URL. Leave empty to auto-detect

### 4. Run

Choose one of three processing methods:

**Direct Processing (processes immediately):**
```bash
npm start direct companies.csv
```

**Queue Processing (for large batches):**
```bash
npm start queue companies.csv
```

Then in another terminal, start the worker:
```bash
npm run worker
```

**Test Mode:**
```bash
npm start test
```

## Configuration

### Environment Variables (.env)

| Variable | Description | Example |
|----------|-------------|---------|
| `HEADLESS` | Run browser in headless mode | `true` or `false` |
| `BROWSER_TIMEOUT` | Browser operation timeout in ms | `30000` |
| `PAGE_LOAD_TIMEOUT` | Page load timeout in ms | `30000` |
| `REDIS_HOST` | Redis server host | `localhost` |
| `REDIS_PORT` | Redis server port | `6379` |
| `REDIS_PASSWORD` | Redis server password (leave empty if none) | `` |
| `QUEUE_CONCURRENCY` | Number of concurrent jobs | `3` |
| `QUEUE_DELAY_BETWEEN_JOBS` | Delay between processing jobs in ms | `2000` |
| `TEST_EMAIL` | Email address submitted in forms | `test@example.com` |
| `TEST_PHONE` | Phone number submitted in forms | `+1234567890` |
| `TEST_WEBSITE` | Website/company email submitted in forms | `mail@example.com` |
| `TEST_MESSAGE` | Message text submitted in forms | `This is a test submission...` |
| `LOG_LEVEL` | Logging level | `info`, `debug`, `warn`, `error` |
| `LOG_FILE_PATH` | Path for log files | `./logs` |
| `RESULTS_OUTPUT_PATH` | Path for output results | `./results` |

### Email Monitoring Configuration

Edit `src/email/mailTool.js` lines 6-11 to configure POP3 email monitoring:

```javascript
const mailConfig = {
  email: 'your-email@example.com',
  password: 'your-password',
  pop3Host: 'pop.example.com',
  pop3Port: 995
};
```

The email monitor will:
- Run continuously in a separate background process
- Check for new emails every 30 seconds
- Parse sender, subject, date, and body
- Display results in console
- Save to emails table in SQLite database

## Running the System

### System Components

**Results Manager (ResultsManager)**
- Saves simplified results to JSON batch files
- Logs results to SQLite database (`result.sqlite`)
- Generates statistics (success rate, forms detected, etc.)
- Tracks processed companies to prevent duplicates

**Email Monitor (mailTool.js)**
- Monitors email responses automatically in background
- Connects to POP3 email server
- Detects new messages every 30 seconds
- Displays and stores all received emails

## Output & Results

### Results Files

All results are saved in the `results/` folder:

- `batch_TIMESTAMP.json` - All results in a single file

Each entry contains:

```json
{
  "id": "1",
  "name": "Company Name",
  "homepage": "https://example.com",
  "contact_form_url": "https://example.com/contact",
  "contact_form_detected": true,
  "bot_detected": false,
  "status": "SUCCESS",
  "message": "Form submitted successfully"
}
```

### Result Statuses

- `SUCCESS` - Form submitted successfully
- `FAILED` - Form submission failed (CAPTCHA, validation errors)
- `SKIPPED` - No contact page or form found
- `ERROR` - Processing error occurred

### Database Storage

- `result.sqlite` - Stored in root folder
- Two tables:
  - `results` - Form submission results
  - `emails` - Received email responses

### Console Output

Real-time logs showing:
- Current company being processed
- Contact page detection progress
- Form analysis (fields found, scores)
- Submission status
- Final statistics

## Features

- **Multi-language Support** - Works with forms in 11+ languages
- **Smart Detection** - Auto-finds contact pages using intelligent link analysis
- **CAPTCHA Detection** - Identifies bot protection and skips submission
- **Duplicate Prevention** - Tracks processed companies in database
- **Email Tracking** - Monitors responses automatically via POP3
- **Comprehensive Logging** - JSON files + SQLite database
- **Error Recovery** - Continues processing even if one company fails
- **Single Browser Instance** - Efficient resource usage across all companies
- **Flexible Processing** - Direct, queue-based, or test modes

## Limitations

The system cannot handle:

1. **Websites with Bot/AI CAPTCHA** - Forms with reCAPTCHA, hCaptcha, Cloudflare Turnstile cannot be automated (marked as `bot_detected: true`)

2. **Sites without Contact Forms** - If no contact page exists, submission is impossible (marked as `SKIPPED`)

3. **Complex Forms** - Multi-step forms or forms requiring file uploads are not supported

4. **JavaScript-heavy Forms** - Some modern React/Vue forms may not be detected properly (SPA forms that load dynamically)

5. **Unreachable Sites** - Sites that are down or block automated browsers

## Troubleshooting

### Browser not launching?

- Ensure all Puppeteer dependencies are installed
- Try setting `HEADLESS=false` to see browser in action
- Check that you have sufficient disk space for Chrome/Chromium

### Contact pages not found?

- Check if website has obvious contact links in navigation
- Try providing direct `contact_url` in CSV file
- Some sites may block automated browsers - this is expected

### Forms not submitting?

- Check if `bot_detected: true` in results (CAPTCHA present)
- Verify test data in `.env` file is valid
- Check console logs for specific field errors
- Ensure required fields are being filled correctly

### Queue not working?

- Ensure Redis is running: `redis-server`
- Check Redis connection in logs
- Verify `QUEUE_DELAY_BETWEEN_JOBS` is set appropriately

### Email not being received?

- Configure POP3 credentials in `src/email/mailTool.js`
- Ensure POP3 access is enabled on your email account
- Check if email listener shows "Connected" in console
- Verify firewall isn't blocking POP3 connections (port 995)

---

For issues or feature requests, please check the console output for detailed error messages and verify your configuration settings.