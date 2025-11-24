const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../config/logger');

class DatabaseLogger {
  constructor() {
    // Database is in the main project directory (form-submission-system)
    this.dbPath = path.join(__dirname, '..', '..', 'result.sqlite');
    this.db = null;
    this.initDatabase();
  }

  /**
   * Initialize database connection and create table
   */
  async initDatabase() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Failed to connect to database:', { error: err.message });
          reject(err);
          return;
        }
        
        logger.info('Connected to SQLite database:', { path: this.dbPath });
        
        // Create results table if not exists
        this.createTable()
          .then(resolve)
          .catch(reject);
      });
    });
  }

  /**
   * Create results table
   */
  async createTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        homepage TEXT,
        contact_form_url TEXT,
        contact_form_detected INTEGER DEFAULT 0,
        bot_detected INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    return new Promise((resolve, reject) => {
      this.db.run(createTableQuery, (err) => {
        if (err) {
          logger.error('Failed to create table:', { error: err.message });
          reject(err);
          return;
        }
        logger.info('Results table ready');
        resolve();
      });
    });
  }

  /**
   * Log result to database (insert or update)
   */
  async logResult(result) {
    console.log(result.id);
    
    try {
      // Check if record exists
      const exists = await this.recordExists(result.id);

      if (exists) {
        await this.updateResult(result);
      } else {
        await this.insertResult(result);
      }

      logger.debug('Result logged to database:', { contact_id: result.id, name: result.name });
    } catch (error) {
      logger.error('Failed to log result to database:', { 
        id: result.id,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Check if record exists
   */
  async recordExists(contactId) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT id FROM results WHERE contact_id = ?';
      
      this.db.get(query, [contactId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(!!row);
      });
    });
  }

  /**
   * Insert new result
   */
  async insertResult(result) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO results (
          contact_id, name, homepage, contact_form_url, 
          contact_form_detected, bot_detected, status, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        result.id,
        result.name,
        result.homepage || null,
        result.contact_form_url || null,
        result.contact_form_detected ? 1 : 0,
        result.bot_detected ? 1 : 0,
        result.status,
        result.message || null
      ];

      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        logger.info('Result inserted into database:', { contact_id: result.id });
        resolve(this.lastID);
      });
    });
  }

  /**
   * Update existing result
   */
  async updateResult(result) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE results 
        SET 
          name = ?,
          homepage = ?,
          contact_form_url = ?,
          contact_form_detected = ?,
          bot_detected = ?,
          status = ?,
          message = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE contact_id = ?
      `;

      const params = [
        result.name,
        result.homepage || null,
        result.contact_form_url || null,
        result.contact_form_detected ? 1 : 0,
        result.bot_detected ? 1 : 0,
        result.status,
        result.message || null,
        result.id
      ];

      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        logger.info('Result updated in database:', { contact_id: result.id, changes: this.changes });
        resolve(this.changes);
      });
    });
  }

  /**
   * Get result by contact ID
   */
  async getResultByContactId(contactId) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM results WHERE contact_id = ?';
      
      this.db.get(query, [contactId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    });
  }

  /**
   * Get all results
   */
  async getAllResults() {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM results ORDER BY created_at DESC';
      
      this.db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  }

  /**
   * Get statistics from database
   */
  async getStatistics() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          COUNT(*) as total_companies,
          SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as successful_submissions,
          SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_submissions,
          SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END) as errors,
          SUM(CASE WHEN contact_form_detected = 1 THEN 1 ELSE 0 END) as contact_forms_detected,
          SUM(CASE WHEN homepage IS NOT NULL THEN 1 ELSE 0 END) as websites_found,
          SUM(CASE WHEN bot_detected = 1 THEN 1 ELSE 0 END) as bot_captcha_detected
        FROM results
      `;
      
      this.db.get(query, [], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Calculate success rate
        const successRate = row.total_companies > 0 
          ? ((row.successful_submissions / row.total_companies) * 100).toFixed(2)
          : '0.00';
        
        resolve({
          ...row,
          success_rate_percentage: successRate
        });
      });
    });
  }

  /**
   * Delete result by contact ID
   */
  async deleteResult(contactId) {
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM results WHERE contact_id = ?';
      
      this.db.run(query, [contactId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        logger.info('Result deleted from database:', { contact_id: contactId, changes: this.changes });
        resolve(this.changes);
      });
    });
  }

  /**
   * Clear all results
   */
  async clearAllResults() {
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM results';
      
      this.db.run(query, [], function(err) {
        if (err) {
          reject(err);
          return;
        }
        logger.info('All results cleared from database');
        resolve(this.changes);
      });
    });
  }

  /**
   * Close database connection
   */
  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            logger.error('Failed to close database:', { error: err.message });
            reject(err);
            return;
        }
          logger.info('Database connection closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = DatabaseLogger;