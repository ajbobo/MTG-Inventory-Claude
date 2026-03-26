# MTG Inventory

A web-based application for organizing Magic: The Gathering card collections, with data persistence in Azure Cosmos DB.

## Features

- Browse all MTG sets from Scryfall
- View card details with mana costs and prices
- Track collection quantities by variant type:
  - Normal
  - Foil (🌟)
  - Prerelease (⭐)
  - Autographed (✨)
- Data stored securely in Azure Cosmos DB

## Architecture

The application consists of:

- **Frontend:** Static HTML/CSS/JavaScript (HTML5)
- **Backend:** Node.js + Express API server
- **Database:** Azure Cosmos DB (SQL API)

> **Security Note:** Cosmos DB credentials are stored server-side only. The backend API acts as a secure proxy for all database operations.

## Quick Start

### 1. Set up the Backend

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env` with your Cosmos DB credentials:

```env
COSMOS_ENDPOINT=https://mtg-inventory.documents.azure.com:443/
COSMOS_KEY=your-primary-key-here
COSMOS_DATABASE=MTG-Inventory
COSMOS_CONTAINER=Collection
PORT=3000
```

Start the server:

```bash
npm start
```

The API will run at http://localhost:3000

### 2. Open the Frontend

Open `src/index.html` in your web browser. You can use a local HTTP server for better compatibility:

```bash
# If you have Python installed:
cd src
python -m http.server 8080

# Or with Node.js http-server:
npx http-server src/ -p 8080
```

Then open http://localhost:8080 in your browser.

### 3. Use the App

1. Select an MTG set from the dropdown
2. Click on a card to expand its details
3. Enter quantities for each variant type
4. Changes are automatically saved to Cosmos DB

## API Reference

Base URL: `http://localhost:3000/api/quantities`

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/:cardId` | Get quantities for a card (cardId = `${setCode}:${collectorNumber}`) |
| `POST` | `/` | Create or update card quantities |
| `DELETE` | `/:cardId` | Delete card from inventory |

### Request Body (POST)

```json
{
  "setId": "one",
  "collectorNumber": "216",
  "cardName": "Scryb Sprites",
  "quantities": {
    "normal": 1,
    "foil": 0,
    "prerelease": 0,
    "autographed": 0
  }
}
```

### Response (Success)

```json
{
  "success": true,
  "data": {
    "normal": 1,
    "foil": 0,
    "prerelease": 0,
    "autographed": 0
  }
}
```

### Database Document Structure

```json
{
  "Key": "one:216",
  "id": "one:216",
  "CollectorNumber": "216",
  "Name": "Scryb Sprites",
  "SetCode": "one",
  "TotalCount": 1,
  "CTCs": [
    { "CardType": "Standard", "Count": 1 }
  ]
}
```

**CTCs (Card Type Counts)** represent the variant types:
- `Standard` = Normal
- `Foil` = Foil
- `Prerelease \| foil` = Prerelease (also foiled)
- `Autographed` = Autographed

When TotalCount reaches 0, the document is automatically deleted.

## Configuration

### Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COSMOS_ENDPOINT` | (required) | Cosmos DB endpoint URL |
| `COSMOS_KEY` | (required) | Cosmos DB primary key |
| `COSMOS_DATABASE` | `MTG-Inventory` | Database name |
| `COSMOS_CONTAINER` | `Collection` | Container name |
| `PORT` | `3000` | Server port |

### Frontend API URL

Edit `src/js/script.js` line 4 to change the backend API URL:

```javascript
const BACKEND_API = "http://localhost:3000/api/quantities"; // Change for production
```

## Development

### Project Structure

```
.
├── src/
│   ├── index.html       # Main HTML page
│   ├── js/
│   │   └── script.js    # Frontend logic
│   └── css/
│       └── style.css    # Styles
├── server/
│   ├── index.js         # Express server entry point
│   ├── cosmosClient.js  # Cosmos DB client & utilities
│   ├── routes/
│   │   └── quantities.js # API routes
│   ├── package.json
│   └── .env.example
├── docs/
│   └── spec.md          # Technical specification
├── .gitignore
└── README.md
```

### Cosmos DB Schema

- **Partition Key:** `/Key` (format: `<setCode>:<collectorNumber>`)
- **Auto-indexing:** Cosmos DB default indexing policy works
- **TTL:** Not configured

## Production Deployment

1. Deploy the `server/` directory to your Node.js hosting (Azure App Service, Heroku, etc.)
2. Set environment variables in your hosting platform
3. Update `BACKEND_API` in `script.js` to point to your production backend
4. Serve `src/` directory as static files (same domain recommended to avoid CORS)

For best security:
- Enable CORS only for your frontend domain
- Use Azure AD authentication or API keys for additional protection
- Consider rate limiting to prevent abuse
- Enable HTTPS only

## Tech Stack

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend:** Node.js, Express, @azure/cosmos SDK
- **Database:** Azure Cosmos DB (SQL API)
- **External APIs:** Scryfall API (card data, images, sets, symbology)

## License

ISC
