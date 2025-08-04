const Parser = require('rss-parser');

class RSSParser {
  constructor() {
    this.parser = new Parser({
      customFields: {
        item: [
          'guid', 
          'pubDate', 
          'description', 
          'content', 
          'content:encoded',
          'media:content',
          'media:thumbnail',
          'media:group',
          'bild:premium'
        ]
      }
    });
  }

  async fetchFeed(url) {
    try {
      console.log(`Fetching RSS feed: ${url}`);
      const feed = await this.parser.parseURL(url);
      
      const items = feed.items.map(item => ({
        title: item.title || '',
        link: item.link || '',
        guid: item.guid || item.link || '',
        pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
        description: item.description || item.summary || '',
        content: item['content:encoded'] || item.content || item.description || '',
        author: item.creator || item.author || '',
        categories: item.categories || [],
        mediaContent: this.extractMediaContent(item),
        mediaThumbnail: this.extractMediaThumbnail(item),
        isPremium: item['bild:premium'] === 'true',
        feedTitle: feed.title || '',
        feedUrl: url
      }));

      console.log(`Found ${items.length} items in feed`);
      return items;
    } catch (error) {
      console.error(`Error fetching RSS feed ${url}:`, error.message);
      throw error;
    }
  }

  extractMediaContent(item) {
    const mediaContent = [];
    
    // Handle single media:content
    if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) {
      mediaContent.push({
        url: item['media:content'].$.url,
        type: item['media:content'].$.type || 'image/jpeg',
        medium: item['media:content'].$.medium || 'image',
        credit: item['media:content']['media:credit'] || ''
      });
    }
    
    // Handle media:group with multiple media:content items
    if (item['media:group'] && item['media:group']['media:content']) {
      const groupContent = Array.isArray(item['media:group']['media:content']) 
        ? item['media:group']['media:content']
        : [item['media:group']['media:content']];
      
      groupContent.forEach(content => {
        if (content.$ && content.$.url) {
          mediaContent.push({
            url: content.$.url,
            type: content.$.type || 'image/jpeg',
            medium: content.$.medium || 'image',
            credit: content['media:credit'] || ''
          });
        }
      });
    }
    
    return mediaContent;
  }

  extractMediaThumbnail(item) {
    if (item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url) {
      return {
        url: item['media:thumbnail'].$.url,
        width: item['media:thumbnail'].$.width || '',
        height: item['media:thumbnail'].$.height || ''
      };
    }
    return null;
  }
}

module.exports = RSSParser;