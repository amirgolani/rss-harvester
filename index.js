require('dotenv').config();
const Database = require('./db');
const RSSParser = require('./rssParser');

class RSSHarvester {
  constructor() {
    this.db = new Database();
    this.parser = new RSSParser();
    this.feeds = process.env.RSS_FEEDS ? process.env.RSS_FEEDS.split(',') : [
      'https://feeds.feedburner.com/TechCrunch',
      'https://rss.cnn.com/rss/edition.rss'
    ];
    this.interval = parseInt(process.env.CHECK_INTERVAL) || 300000; // 1 hour default
    this.isRunning = false;
  }

  async start() {
    try {
      await this.db.connect();
      this.isRunning = true;
      
      console.log(`Starting RSS harvester...`);
      console.log(`Monitoring ${this.feeds.length} feeds every ${this.interval / 1000} seconds`);
      
      // Initial fetch
      await this.checkFeeds();
      
      // Set up periodic checking
      this.intervalId = setInterval(async () => {
        if (this.isRunning) {
          await this.checkFeeds();
        }
      }, this.interval);

      // Handle graceful shutdown
      process.on('SIGINT', () => this.stop());
      process.on('SIGTERM', () => this.stop());

    } catch (error) {
      console.error('Failed to start RSS harvester:', error);
      process.exit(1);
    }
  }

  async checkFeeds() {
    console.log('\n--- Checking RSS feeds ---');
    
    for (const feedUrl of this.feeds) {
      try {
        const items = await this.parser.fetchFeed(feedUrl);
        let savedCount = 0;

        for (const item of items) {
          const result = await this.db.saveItem(item);
          if (result) {
            savedCount++;
          }
        }

        console.log(`${feedUrl}: ${savedCount} new items saved out of ${items.length} total`);
      } catch (error) {
        console.error(`Error processing feed ${feedUrl}:`, error.message);
      }
    }
    
    console.log('--- Feed check complete ---\n');
  }

  async stop() {
    console.log('\nShutting down RSS harvester...');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    await this.db.close();
    process.exit(0);
  }
}

// Start the harvester
const harvester = new RSSHarvester();
harvester.start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});