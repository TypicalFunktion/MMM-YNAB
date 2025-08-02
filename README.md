# MMM-YNAB

This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/) which can show remaining dollars in categories from budgets from YNAB (You Need A Budget).

![Example of MMM-YNAB](./screenshot.png)

## Features

- ✅ Display category balances from your YNAB budget
- ✅ Show category group totals (e.g., "Monthly Bills", "True Expenses")
- ✅ Track spending for today, this week, and last week
- ✅ Configurable update intervals
- ✅ Error handling with user-friendly messages
- ✅ Loading states and visual feedback
- ✅ Support for negative balances (red text)
- ✅ Responsive design for different screen sizes
- ✅ Configurable currency display
- ✅ Support for multiple budgets via budgetId
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
            position: "top_right",
            config: {
                token: "ADD_YNAB_TOKEN_HERE",
                budgetId: "3d894cb9-d783-4bd0-a9a6-f7a3c79becc1", // Optional
                categories: ["Household", "Pets", "Grocery", "Lunch", "Kids Clothes", "Restaurants", "Spontaneous Fun"],
                groups: ["Monthly Bills", "True Expenses", "Debt Payments"], // Optional: specific groups to show
                updateInterval: 90000, // 90 seconds (optional, default: 90000)
                showCurrency: true,    // Show $ symbol (optional, default: true)
                currencyFormat: "USD", // Currency format (optional, default: "USD")
                excludedCategories: ["IKEA Reimbursements", "Work Reimbursements"], // Optional: categories to exclude from spending
                excludedGroups: ["Monthly Bills", "Bills", "Fixed Expenses"], // Optional: category groups to exclude from spending
                recentExcludedCategories: ["Rent", "Mortgage"], // Optional: categories to exclude from recent transactions
                recentExcludedGroups: ["Monthly Bills", "Bills"], // Optional: category groups to exclude from recent transactions
                showGroupSummaries: true, // Show category group totals (optional, default: true)
                showUncleared: true, // Include uncleared transactions (optional, default: true)
                transactionAnimationDelay: 10000, // Animation delay for recent transactions (10 seconds)
                excludeNonBudgetAccounts: true, // Exclude tracking accounts like 401k, investment accounts, etc. (optional, default: true)
            }
        },
    ]
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `token` | String | `""` | **Required** Your YNAB API access token |
| `budgetId` | String | `null` | **Optional** Specific budget ID to use (if you have multiple budgets) |
| `categories` | Array | `["Household", "Pets", "Grocery", "Lunch", "Kids Clothes", "Restaurants", "Spontaneous Fun"]` | Array of category names to display |
| `groups` | Array | `[]` | **Optional** Array of category group names to display (e.g., ["Monthly Bills", "True Expenses"]) |
| `excludedCategories` | Array | `["Rent"]` | **Optional** Array of category names to exclude from spending calculations |
| `excludedGroups` | Array | `["Monthly Bills", "Bills", "Fixed Expenses"]` | **Optional** Array of category group names to exclude from spending calculations |
| `recentExcludedCategories` | Array | `[]` | **Optional** Array of category names to exclude from recent transactions |
| `recentExcludedGroups` | Array | `[]` | **Optional** Array of category group names to exclude from recent transactions |
| `updateInterval` | Number | `90000` | Update interval in milliseconds (90 seconds) |
| `showCurrency` | Boolean | `true` | Whether to show the $ symbol before amounts |
| `currencyFormat` | String | `"USD"` | Currency format (currently only USD is supported) |
| `showGroupSummaries` | Boolean | `true` | Whether to show category group totals |
| `showUncleared` | Boolean | `true` | Include uncleared transactions (optional, default: true) |
| `transactionAnimationDelay` | Number | `15000` | Animation delay for recent transactions in milliseconds (15 seconds) |
| `excludeNonBudgetAccounts` | Boolean | `true` | Exclude tracking accounts like 401k, investment accounts, etc. (optional, default: true) |

### Finding Your Budget ID

By default, the first budget found in your account will be used. To specify a specific budget, use the `budgetId` config option. Find your budget ID by navigating to your budget in YNAB and looking at the URL:

`https://app.youneedabudget.com/{{BUDGET_ID_AS_UUID}}/budget`

### Account Filtering

By default, the module excludes non-budget accounts (tracking accounts) like 401k, investment accounts, and other tracking accounts from spending calculations and recent transactions. This ensures that only transactions from your main budget accounts (checking, savings, credit cards) are included.

If you want to include all account types, set `excludeNonBudgetAccounts: false` in your configuration.

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

### v1.2.1
- ✅ Added configurable transaction animation delay (`transactionAnimationDelay`)

### v1.2.0
- ✅ Added recent transaction filters (`recentExcludedCategories`, `recentExcludedGroups`)
- ✅ Added rotating recent transactions display (10 transactions, showing 3 at a time)
- ✅ Added smooth scroll animation for recent transactions
- ✅ Added last updated timestamp display
- ✅ Improved compact spacing throughout module

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