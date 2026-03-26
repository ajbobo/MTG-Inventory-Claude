const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { CosmosClient } = require('@azure/cosmos');

// CosmosDB configuration from environment variables
const endpoint = process.env.COSMOS_ENDPOINT || 'https://mtg-inventory.documents.azure.com:443/';
const key = process.env.COSMOS_KEY || '';
const databaseId = process.env.COSMOS_DATABASE || 'MTG-Inventory';
const containerId = process.env.COSMOS_CONTAINER || 'Collection';

// Validate configuration
if (!key) {
  console.error('ERROR: COSMOS_KEY environment variable is required');
  process.exit(1);
}

// Create Cosmos client
const client = new CosmosClient({ endpoint, key });

// Get database and container references
let database, container;

async function init() {
  try {
    // Create or get database
    const { database: db } = await client.databases.createIfNotExists({ id: databaseId });
    database = db;
    module.exports.database = db; // Update export

    // Create or get container
    // Partition key: /Key (format: "<setCode>:<collectorNumber>")
    const { container: cont } = await database.containers.createIfNotExists({
      id: containerId,
      partitionKey: {
        paths: ['/Key'],
        version: 1,
        kind: 'Hash'
      }
    });
    container = cont;
    module.exports.container = cont; // Update export

    console.log(`✅ Connected to Cosmos DB: database="${databaseId}", container="${containerId}"`);
    console.log(`Container object keys:`, Object.keys(cont));
    console.log(`Container has items?`, typeof cont.items);
    return { database, container };
  }
  catch (error) {
    console.error('❌ Failed to initialize Cosmos DB:', error.message);
    throw error;
  }
}

/**
 * Transform frontend quantity format to database document
 * @param {Object} qt - Frontend format: { normal, foil, prerelease, autographed }
 * @param {string} setId - Set code
 * @param {string} collectorNumber - Collector number
 * @param {string} cardName - Card name
 * @returns {Object} Database document
 */
function toDatabaseDocument(qt, setId, collectorNumber, cardName) {
  const Key = `${setId}:${collectorNumber}`;
  const TotalCount = (qt.normal || 0) + (qt.foil || 0) + (qt.prerelease || 0) + (qt.autographed || 0);

  // Build CTCs array - only include non-zero counts
  const CTCs = [];
  if (qt.normal > 0) CTCs.push({ CardType: 'Standard', Count: qt.normal });
  if (qt.foil > 0) CTCs.push({ CardType: 'foil', Count: qt.foil });
  if (qt.prerelease > 0) CTCs.push({ CardType: 'foil | prerelease', Count: qt.prerelease });
  if (qt.autographed > 0) CTCs.push({ CardType: 'Autographed', Count: qt.autographed });

  return {
    Key,
    id: Key,
    CollectorNumber: collectorNumber,
    Name: cardName,
    SetCode: setId,
    TotalCount,
    CTCs
  };
}

/**
 * Transform database document to frontend quantity format
 * @param {Object} doc - Database document
 * @returns {Object} Frontend format: { normal, foil, prerelease, autographed }
 */
function toFrontendQuantities(doc) {
  const ctcs = doc.CTCs || [];
  const result = {
    normal: 0,
    foil: 0,
    prerelease: 0,
    autographed: 0
  };

  ctcs.forEach((item) => {
    switch (item.CardType) {
      case 'Standard':
        result.normal = item.Count;
        break;
      case 'foil':
        result.foil = item.Count;
        break;
      case 'foil | prerelease':
        result.prerelease = item.Count;
        break;
      case 'Autographed':
        result.autographed = item.Count;
        break;
    }
  });

  return result;
}

module.exports = {
  init,
  client,
  database,
  container,
  toDatabaseDocument,
  toFrontendQuantities
};
