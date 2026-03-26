const express = require('express');
const router = express.Router();
const cosmosClient = require('../cosmosClient');
const { toDatabaseDocument, toFrontendQuantities } = cosmosClient;

// Debug: check if container is available
console.log('Routes loaded. container available:', !!cosmosClient.container);

/**
 * GET /api/quantities/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /api/quantities/bulk
 * Bulk fetch quantities for multiple cards
 * Body: { cardKeys: ["set:num1", "set:num2", ...] }
 * Returns map: { "set:num": { normal, foil, prerelease, autographed }, ... }
 */
router.post('/bulk', async (req, res) => {
  try {
    const { cardKeys } = req.body;

    if (!Array.isArray(cardKeys) || cardKeys.length === 0) {
      return res.status(400).json({ error: 'cardKeys must be a non-empty array' });
    }

    // Batch fetch using point reads (CosmosDB supports parallel operations)
    // For better performance with large sets, consider a query with WHERE Key IN (...)
    const results = {};

    // Process in batches of 100 to avoid oversized requests
    const batchSize = 100;
    for (let i = 0; i < cardKeys.length; i += batchSize) {
      const batch = cardKeys.slice(i, i + batchSize);

      await Promise.all(batch.map(async (key) => {
        try {
          const { resource: doc } = await cosmosClient.container.items.read(key, key);
          results[key] = toFrontendQuantities(doc);
        }
        catch (err) {
          if (err.code === 404) {
            // Not in inventory - return empty quantities
            results[key] = { normal: 0, foil: 0, prerelease: 0, autographed: 0 };
          } else {
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

/**
 * GET /api/quantities/:cardId
 * Retrieve quantities for a specific card
 * cardId format: "<setCode>:<collectorNumber>"
 */
router.get('/:cardId', async (req, res) => {
  try {
    const { cardId } = req.params;
    console.log('GET /:cardId - container exists?', !!cosmosClient.container);
    if (!cosmosClient.container) {
      throw new Error('Container not initialized');
    }

    const { resource: doc } = await cosmosClient.container.items
      .read(cardId, cardId)
      .catch(async (err) => {
        if (err.code === 404) {
          // Card not found in inventory - return empty quantities
          return null;
        }
        throw err;
      });

    if (!doc) {
      return res.json({
        normal: 0,
        foil: 0,
        prerelease: 0,
        autographed: 0
      });
    }

    const quantities = toFrontendQuantities(doc);
    res.json(quantities);
  }
  catch (error) {
    console.error('Error fetching quantities:', error);
    res.status(500).json({ error: 'Failed to fetch quantities' });
  }
});

/**
 * POST /api/quantities
 * Create or update card quantities
 * Body: { setId, collectorNumber, cardName, quantities: { normal, foil, prerelease, autographed } }
 */
router.post('/', async (req, res) => {
  try {
    const { setId, collectorNumber, cardName, quantities } = req.body;

    if (!setId || !collectorNumber || !cardName || !quantities) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('POST / - container exists?', !!cosmosClient.container);
    if (!cosmosClient.container) {
      throw new Error('Container not initialized');
    }

    // Validate quantities are numbers >= 0
    const qt = {
      normal: Math.max(0, parseInt(quantities.normal) || 0),
      foil: Math.max(0, parseInt(quantities.foil) || 0),
      prerelease: Math.max(0, parseInt(quantities.prerelease) || 0),
      autographed: Math.max(0, parseInt(quantities.autographed) || 0)
    };

    // Transform to database format
    const doc = toDatabaseDocument(qt, setId, collectorNumber, cardName);

    console.log('Upserting doc:', doc.Key);

    // Upsert the document
    const { resource: savedDoc } = await cosmosClient.container.items.upsert(doc);

    // Return the saved document
    res.json({
      success: true,
      data: toFrontendQuantities(savedDoc)
    });
  }
  catch (error) {
    console.error('Error saving quantities:', error);
    res.status(500).json({ error: 'Failed to save quantities' });
  }
});

/**
 * DELETE /api/quantities/:cardId
 * Delete card document when total count reaches zero
 * cardId format: "<setCode>:<collectorNumber>"
 */
router.delete('/:cardId', async (req, res) => {
  try {
    const { cardId } = req.params;

    await cosmosClient.container.items
      .read(cardId, cardId)
      .then(({ resource: doc }) => {
        return cosmosClient.container.items.destroy(cardId, cardId, { accessCondition: { type: 'IfMatch', condition: doc._etag } });
      })
      .catch(async (err) => {
        if (err.code === 404) {
          // Already deleted, not an error
          return null;
        }
        throw err;
      });

    res.json({ success: true, deleted: true });
  }
  catch (error) {
    console.error('Error deleting quantities:', error);
    res.status(500).json({ error: 'Failed to delete quantities' });
  }
});

module.exports = router;
