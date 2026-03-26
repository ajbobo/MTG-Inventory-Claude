require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { init, toDatabaseDocument, toFrontendQuantities } = require('./cosmosClient');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health endpoint directly (no Cosmos needed)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database connection then start server
init()
  .then(({ container }) => {
    // Attach container to req via middleware
    app.use('/api/quantities', (req, res, next) => {
      console.log('Attaching container:', typeof container, container);
      req.container = container;
      next();
    });

    // GET /api/quantities/:cardId
    app.get('/api/quantities/:cardId', async (req, res) => {
      try {
        const { cardId } = req.params;
        const item = req.container.item(cardId, cardId);
        const { resource: doc } = await item.read().catch((err) => {
          if (err.code === 404) return null;
          throw err;
        });

        if (!doc) {
          return res.json({ normal: 0, foil: 0, prerelease: 0, autographed: 0 });
        }

        res.json(toFrontendQuantities(doc));
      }
      catch (error) {
        console.error('Error fetching quantities:', error);
        res.status(500).json({ error: 'Failed to fetch quantities' });
      }
    });

    // POST /api/quantities/bulk
    app.post('/api/quantities/bulk', async (req, res) => {
      try {
        const { cardKeys } = req.body;
        if (!Array.isArray(cardKeys) || cardKeys.length === 0) {
          return res.status(400).json({ error: 'cardKeys must be a non-empty array' });
        }

        const results = {};
        const batchSize = 100;
        for (let i = 0; i < cardKeys.length; i += batchSize) {
          const batch = cardKeys.slice(i, i + batchSize);
          await Promise.all(batch.map(async (key) => {
            try {
              const item = req.container.item(key, key);
              const { resource: doc } = await item.read();
              results[key] = toFrontendQuantities(doc);
            }
            catch (err) {
              if (err.code === 404) {
                results[key] = { normal: 0, foil: 0, prerelease: 0, autographed: 0 };
              }
              else {
                console.error(`Error fetching ${key}:`, err.message);
                results[key] = { normal: 0, foil: 0, prerelease: 0, autographed: 0 };
              }
            }
          }));
        }

        res.json(results);
      }
      catch (error) {
        console.error('Error bulk fetching quantities:', error);
        res.status(500).json({ error: 'Failed to bulk fetch quantities' });
      }
    });

    // POST /api/quantities (upsert)
    app.post('/api/quantities', async (req, res) => {
      try {
        console.log('POST /api/quantities - container?', !!req.container);
        if (!req.container) {
          throw new Error('Container not attached to request');
        }
        const { setId, collectorNumber, cardName, quantities } = req.body;
        if (!setId || !collectorNumber || !cardName || !quantities) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        const qt = {
          normal: Math.max(0, parseInt(quantities.normal) || 0),
          foil: Math.max(0, parseInt(quantities.foil) || 0),
          prerelease: Math.max(0, parseInt(quantities.prerelease) || 0),
          autographed: Math.max(0, parseInt(quantities.autographed) || 0)
        };

        const doc = toDatabaseDocument(qt, setId, collectorNumber, cardName);
        console.log('Upserting document:', doc.Key);
        const { resource: savedDoc } = await req.container.items.upsert(doc);
        console.log('Upsert success');

        // If total is 0, delete the document (per spec)
        const total = qt.normal + qt.foil + qt.prerelease + qt.autographed;
        if (total === 0) {
          try {
            await req.container.item(doc.id, doc.Key).delete();
            console.log('Deleted document:', doc.Key);
          }
          catch (deleteErr) {
            if (deleteErr.code !== 404) {
              console.warn('Failed to delete zero-count document:', deleteErr.message);
            }
          }
        }

        res.json({ success: true, data: toFrontendQuantities(savedDoc) });
      }
      catch (error) {
        console.error('Error saving quantities:', error);
        res.status(500).json({ error: 'Failed to save quantities' });
      }
    });

    // DELETE /api/quantities/:cardId
    app.delete('/api/quantities/:cardId', async (req, res) => {
      try {
        const { cardId } = req.params;
        const item = req.container.item(cardId, cardId);
        // Read first to get etag
        const { resource: doc } = await item.read().catch((err) => {
          if (err.code === 404) return null;
          throw err;
        });

        if (!doc) {
          return res.json({ success: true, deleted: true });
        }

        await item.delete({ accessCondition: { type: 'IfMatch', condition: doc._etag } });
        res.json({ success: true, deleted: true });
      }
      catch (error) {
        console.error('Error deleting quantities:', error);
        res.status(500).json({ error: 'Failed to delete quantities' });
      }
    });

    // Root endpoint
    app.get('/', (req, res) => {
      res.json({
        name: 'MTG Inventory API',
        version: '1.0.0',
        endpoints: {
          quantities: '/api/quantities',
          health: '/api/health'
        }
      });
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📖 API docs: http://localhost:${PORT}/`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
