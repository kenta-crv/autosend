const { simpleParser } = require('mailparser');
const net = require('net');
const tls = require('tls');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Mail configuration
const mailConfig = {
  email: 'mail@ebisu-hotel.tokyo',
  password: 'BTzjWLPcWFE6_',
  pop3Host: 'pop.lolipop.jp',
  pop3Port: 995
};

// Database path - root folder
const dbPath = path.join(__dirname, '../../result.sqlite');

let lastEmailCount = 0;
let db;

// Initialize database
function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log('✅ Connected to database:', dbPath);
        
        // Create emails table if it doesn't exist
        db.run(`
          CREATE TABLE IF NOT EXISTS emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_email TEXT,
            from_name TEXT,
            subject TEXT,
            date TEXT,
            text_content TEXT,
            html_content TEXT,
            raw_email TEXT,
            received_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log('✅ Database table ready\n');
            resolve();
          }
        });
      }
    });
  });
}

// Save email to database
function saveEmailToDatabase(parsed, rawEmail) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO emails (from_email, from_name, subject, date, text_content, html_content, raw_email)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const fromAddress = parsed.from?.value?.[0]?.address || parsed.from?.text || 'Unknown';
    const fromName = parsed.from?.value?.[0]?.name || '';
    
    stmt.run(
      fromAddress,
      fromName,
      parsed.subject || '(no subject)',
      parsed.date?.toISOString() || new Date().toISOString(),
      parsed.text || '',
      parsed.html || '',
      rawEmail,
      (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('💾 Email saved to database (ID:', stmt.lastID, ')');
          resolve(stmt.lastID);
        }
        stmt.finalize();
      }
    );
  });
}

// Simple POP3 client
class POP3Client {
  constructor(host, port, secure = true) {
    this.host = host;
    this.port = port;
    this.secure = secure;
    this.socket = null;
    this.buffer = '';
  }

  connect() {
    return new Promise((resolve, reject) => {
      const connectHandler = () => {
        this.socket.on('data', (data) => {
          this.buffer += data.toString();
        });

        this.socket.on('error', reject);

        // Wait for server greeting
        const checkGreeting = () => {
          if (this.buffer.includes('\r\n')) {
            resolve();
          } else {
            setTimeout(checkGreeting, 100);
          }
        };
        checkGreeting();
      };

      if (this.secure) {
        this.socket = tls.connect(this.port, this.host, { rejectUnauthorized: false }, connectHandler);
      } else {
        this.socket = net.connect(this.port, this.host, connectHandler);
      }
    });
  }

  send(command) {
    return new Promise((resolve, reject) => {
      this.buffer = '';
      this.socket.write(command + '\r\n', (err) => {
        if (err) reject(err);
      });

      const timeout = setTimeout(() => {
        reject(new Error('Command timeout'));
      }, 5000);

      const checkResponse = () => {
        // Look for complete POP3 response (single line ending with \r\n)
        if (this.buffer.includes('\r\n')) {
          clearTimeout(timeout);
          const response = this.buffer.split('\r\n')[0].trim();
          resolve(response);
        } else {
          setTimeout(checkResponse, 100);
        }
      };
      checkResponse();
    });
  }

  async auth(email, password) {
    const userResp = await this.send(`USER ${email}`);
    if (!userResp.startsWith('+OK')) throw new Error('USER command failed: ' + userResp);

    const passResp = await this.send(`PASS ${password}`);
    if (!passResp.startsWith('+OK')) throw new Error('PASS command failed: ' + passResp);
  }

  async stat() {
    const resp = await this.send('STAT');
    if (!resp.startsWith('+OK')) throw new Error('STAT failed: ' + resp);
    
    // Parse: +OK <count> <size>
    const parts = resp.split(' ');
    const count = parseInt(parts[1]);
    const size = parseInt(parts[2]);
    
    if (isNaN(count) || isNaN(size)) {
      console.error('❌ Failed to parse STAT response:', resp);
      throw new Error('Failed to parse STAT response');
    }
    
    return { count, size };
  }

  async retr(msgNum) {
    return new Promise((resolve, reject) => {
      this.buffer = '';
      this.socket.write(`RETR ${msgNum}\r\n`);

      const timeout = setTimeout(() => {
        reject(new Error('RETR timeout'));
      }, 10000);

      const checkComplete = () => {
        // POP3 ends message retrieval with \r\n.\r\n
        if (this.buffer.includes('\r\n.\r\n')) {
          clearTimeout(timeout);
          resolve(this.buffer);
        } else {
          setTimeout(checkComplete, 100);
        }
      };
      checkComplete();
    });
  }

  close() {
    return new Promise((resolve) => {
      this.send('QUIT').then(() => {
        this.socket.end(() => resolve());
      }).catch(() => {
        this.socket.end(() => resolve());
      });
    });
  }
}

// Setup email listener
async function setupEmailListener() {
  console.log('🚀 Starting POP3 Email Listener with SQLite Storage...\n');
  
  // Initialize database first
  try {
    await initDatabase();
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    process.exit(1);
  }

  console.log('✅ POP3 Email Listener Started');
  console.log('📧 Email:', mailConfig.email);
  console.log('🔗 Server:', mailConfig.pop3Host);
  console.log('🔌 Port:', mailConfig.pop3Port);
  
  // Initialize baseline - get current email count without processing
  try {
    const pop3 = new POP3Client(mailConfig.pop3Host, mailConfig.pop3Port, true);
    await pop3.connect();
    await pop3.auth(mailConfig.email, mailConfig.password);
    const stat = await pop3.stat();
    lastEmailCount = stat.count;
    await pop3.close();
    console.log(`📬 Current mailbox has ${lastEmailCount} existing email(s) (will be ignored)`);
  } catch (err) {
    console.error('❌ Failed to get initial email count:', err.message);
  }
  
  console.log('\n🎯 Checking for emails every 30 seconds...');
  console.log('💡 Send an email to mail@ebisu-hotel.tokyo and it will appear here!\n');

  // Check every 30 seconds (don't check immediately)
  setInterval(checkEmails, 30000);
}

async function checkEmails() {
  try {
    const pop3 = new POP3Client(mailConfig.pop3Host, mailConfig.pop3Port, true);
    
    console.log('🔌 Connecting to POP3 server...');
    await pop3.connect();
    console.log('✅ Connected');

    console.log('🔐 Authenticating...');
    await pop3.auth(mailConfig.email, mailConfig.password);
    console.log('✅ Authenticated');

    const stat = await pop3.stat();
    const emailCount = stat.count;
    console.log(`📬 Total emails: ${emailCount}`);

    // Check if new emails arrived
    if (emailCount > lastEmailCount) {
      console.log(`\n🆕 ${emailCount - lastEmailCount} new email(s)!\n`);
      
      // Retrieve all new emails
      for (let i = lastEmailCount + 1; i <= emailCount; i++) {
        try {
          const rawEmail = await pop3.retr(i);
          const parsed = await simpleParser(rawEmail);

          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(`📧 Email ${i} of ${emailCount}`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('👤 From:', parsed.from?.text || 'Unknown');
          console.log('📝 Subject:', parsed.subject || '(no subject)');
          console.log('⏰ Date:', parsed.date || 'Unknown');
          console.log('📄 Message:\n', parsed.text ? parsed.text.substring(0, 500) : '(no text)');
          
          // Save to database
          await saveEmailToDatabase(parsed, rawEmail);
          
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        } catch (parseErr) {
          console.error(`❌ Error processing email ${i}:`, parseErr.message);
        }
      }
      
      lastEmailCount = emailCount;
    } else {
      console.log('✓ No new emails\n');
    }

    await pop3.close();
    console.log('🔌 Disconnected\n');

  } catch (error) {
    console.error('❌ Error:', error.message, '\n');
  }
}

// Main execution
setupEmailListener();

// Keep the process running
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  if (db) {
    db.close(() => {
      console.log('✅ Database closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});