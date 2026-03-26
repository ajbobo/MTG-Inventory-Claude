# MTG-Inventory Specification

## Overview

MTG-Inventory is a web-based application (HTML5 and JavaScript) that helps users organize their Magic: The Gathering (MTG) card collection.

## Features

### Set Selection
- Dropdown list showing all published MTG sets
- Centered at the top of the screen
- Set icon appears on both left and right when a set is selected

### Card search
- Under the dropdown, and before the table, there is a text field for searching
- As the user types the name of the card in the field, a list of possible cards is shown until there is only 1 card left. The user can press Tab to select that card
- If a card is selected in this field, then it is the only card shown in the table
- There is a button next to the text field that is used to clear the field. This will also show all cards in the table again

### Filters
- Under the card search box, there are three dropdowns for filters:
  - Rarity
    - All
    - Common
    - Uncommon
    - Rare
    - Mythic
  - Count
    - All
    - =0
    - >=1
    - >=4
    - <4
  - Price
    - All
    - >= $1.00
    - >= $10.00
- The user can select one option from each of the dropdowns, but can make selections from up to all three at once
- The cards shown in the table will be the cards that match the selected filter(s)

### Card Display
- Table showing all cards in the selected set with:
  - Card number
  - Card name (with thumbnail)
  - Rarity
  - Casting cost (with mana symbols)
  - Current market price (USD)
  - Total quantity owned

### Detail View
- Click a card to expand inline detail row
- Shows front and back images (if applicable)
- Allows entry of quantities for each variant type:
  - Normal
  - Foil (🌟)
  - Prerelease (⭐)
  - Autographed (✨)
- Star emoji indicates special variants in the table view
- Click again to collapse

### Data Persistence
- The User's collection is stored in Microsoft CosmosDB
- The database name is MTG-Inventory
- The container name is Collection
- The database endpoint is https://mtg-inventory.documents.azure.com:443/
- The database key is YOUR_COSMOS_KEY_HERE (store in environment variable)
- Each document in the container is a record for a single card
- When a card's inventory count is changed (cards are added or removed from the inventory) the database should be updated to reflect the new count
- If a card's total count is reduced to 0, that card's document should be deleted from the database
- Example document for a card:
```json
{
    "Key": "2ed:216",
    "CollectorNumber": "216",
    "Name": "Scryb Sprites",
    "SetCode": "2ed",
    "TotalCount": 1,
    "id": "2ed:216",
    "CTCs": [
        {
            "CardType": "Standard",
            "Count": 1
        }
    ],
    "_rid": "8FhNAL+Di+YQAAAAAAAAAA==",
    "_self": "dbs/8FhNAA==/colls/8FhNAL+Di+Y=/docs/8FhNAL+Di+YQAAAAAAAAAA==/",
    "_etag": "\"7800f706-0000-0700-0000-652422f40000\"",
    "_attachments": "attachments/",
    "_ts": 1696867060
}
```
- Important fields:
  - Key - This is "<setCode>:<collectorNumber>"
  - id - This is the same as the Key
  - CollectorNumber - This is the collector number from Scryfall
  - Name - This is the card's name, from Scryfall
  - SetCode - This is the setcode that the card is in
  - TotalCount - This is the total number of this card in the inventory. It is the sum of the CTC counts
  - CTCs - Abbreviation for Card Type Counts; This is a list of the variants of the card that are in the list
    - Each CTC has two values: Type and Count
    - Type is one of the following:
      - Standard - A normal card
      - foil - A foiled card
      - foil | prerelease - A Prerelease card, which is also foiled
      - Autographed - A card with an authgraph on it
    - Count is the number of that CTC (variant)


## Scryfall API Integration

### Get Set Icon
```
GET https://api.scryfall.com/sets/<setcode>
```
Use the `icon_svg_uri` property from the response.

### Get Cards in Set
```
GET https://api.scryfall.com/cards/search?q=set:<setcode>&order=set
```
Handle pagination using the `next_page` field to load all cards.

### Get Mana Symbols
```
GET https://api.scryfall.com/symbology
```
Response format:
```json
{
  "object": "list",
  "has_more": false,
  "data": [
    {
      "object": "card_symbol",
      "symbol": "{T}",
      "svg_uri": "https://svgs.scryfall.io/card-symbols/T.svg",
      "loose_variant": null,
      "english": "tap this permanent",
      "transposable": false,
      "represents_mana": false,
      "appears_in_mana_costs": false,
      "mana_value": 0,
      "hybrid": false,
      "phyrexian": false,
      "cmc": 0,
      "funny": false,
      "colors": [],
      "gatherer_alternates": [
        "ocT",
        "oT"
      ]
    }
  ]
}
```
For each symbol, use the `svg_uri` property to get the image URL.

### Collectable Sets
- Not all of Scryfall's set types should be listed in the set dropdown
- The type is in a field called set_type
- The following set types should be considered collectable and put in the dropdown:
  - core
  - expansion
  - masterpiece
  - masters
  - commander
  - draft_innovation
  - funny (but only if there is no block and parent defined)

## Implementation Notes

- Mana cost strings (e.g., "{3}{W}{W}") are composed of multiple symbols
- Each symbol between curly braces is looked up in the symbol map
- Symbols without a matching URI are displayed as plain text
- The app uses optional chaining for safely accessing nested properties
