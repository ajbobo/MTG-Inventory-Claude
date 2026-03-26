# MTG-Inventory Specification

## Overview

MTG-Inventory is a web-based application (HTML5 and JavaScript) that helps users organize their Magic: The Gathering (MTG) card collection.

## Features

### Set Selection
- Dropdown list showing all published MTG sets
- Centered at the top of the screen
- Set icon appears on both left and right when a set is selected

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
- User quantities saved to localStorage
- Automatically loaded on page refresh

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

## Implementation Notes

- Mana cost strings (e.g., "{3}{W}{W}") are composed of multiple symbols
- Each symbol between curly braces is looked up in the symbol map
- Symbols without a matching URI are displayed as plain text
- The app uses optional chaining for safely accessing nested properties
