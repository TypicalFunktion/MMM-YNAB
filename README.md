# MMM-YNAB

This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/) which can show remaining dollars in categories from budgets from YNAB (You Need A Budget).

![Example of MMM-YNAB](./screenshot.png)

## Features

- ✅ Display category balances from your YNAB budget
- ✅ Configurable update intervals
- ✅ Error handling with user-friendly messages
- ✅ Loading states and visual feedback
- ✅ Support for negative balances (red text)
- ✅ Responsive design for different screen sizes
- ✅ Configurable currency display
- ✅ Automatic cleanup when module is stopped

## Installation

1. Run `git clone https://github.com/thesoftwarejedi/MMM-YNAB.git` in the directory `~/MagicMirror/modules`
2. Change directories to the new folder `cd MMM-YNAB` and then run `npm install`

## Configuration

To use this module, get a YNAB access token for your YNAB account from https://api.youneedabudget.com/, then add the following configuration block to the modules array in the `config/config.js` file:

```js
var config = {
    modules: [
        {
            module: "MMM-YNAB",
            position: "top_bar",
            config: {
                token: "ADD_YNAB_TOKEN_HERE",
                categories: ["Household", "Pets", "Grocery", "Kids Clothes", "Restaurants", "Lunch", "Spontaneous Fun"],
                updateInterval: 90000, // 90 seconds (optional, default: 90000)
                showCurrency: true,    // Show $ symbol (optional, default: true)
                currencyFormat: "USD", // Currency format (optional, default: "USD")
                // budgetId: "3d894cb9-d783-4bd0-a9a6-f7a3c79becc1", // Optional
            }
        },
    ]
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `token` | String | `""` | **Required** Your YNAB API access token |
| `categories` | Array | `["Household", "Pets", "Grocery", "Lunch", "Kids Clothes", "Restaurants", "Spontaneous Fun"]` | Array of category names to display |
| `updateInterval` | Number | `90000` | Update interval in milliseconds (90 seconds) |
| `showCurrency` | Boolean | `true` | Whether to show the $ symbol before amounts |
| `currencyFormat` | String | `"USD"` | Currency format (currently only USD is supported) |
| `budgetId` | String | `null` | Specific budget ID to use (optional) |

### Finding Your Budget ID

By default, the first budget found in your account will be used. To specify a specific budget, use the `budgetId` config option. Find your budget ID by navigating to your budget in YNAB and looking at the URL:

`https://app.youneedabudget.com/{{BUDGET_ID_AS_UUID}}/budget`

## Troubleshooting

### Common Issues

1. **"YNAB token is required"** - Make sure you've added your YNAB API token to the configuration
2. **"No budgets found in YNAB account"** - Ensure your YNAB account has at least one budget
3. **"No matching categories found"** - Check the console logs to see available categories and update your `categories` array accordingly
4. **API rate limiting** - The module respects YNAB's API limits. If you see rate limit errors, the module will retry automatically

### Debug Information

The module provides detailed logging in the MagicMirror console. Look for messages starting with "MMM-YNAB" to troubleshoot issues.

## Security Note

Your YNAB API token is stored in the MagicMirror configuration file. Ensure this file is properly secured and not shared publicly.

## Changelog

### v1.1.0
- ✅ Added comprehensive error handling
- ✅ Implemented loading states and visual feedback
- ✅ Added support for negative balances (red text)
- ✅ Made update interval configurable
- ✅ Added proper module cleanup
- ✅ Improved code structure with modern JavaScript
- ✅ Enhanced CSS with responsive design
- ✅ Added better logging and debugging information

### v1.0.0
- Initial release with basic YNAB category display functionality

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
