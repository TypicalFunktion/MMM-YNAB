const ynab = require('ynab');
const NodeHelper = require("node_helper");

let ynabBudgetId;
let config;
let self;
let interval;

module.exports = NodeHelper.create({

    socketNotificationReceived: function (notification, payload) {
        switch (notification) {
            case "YNAB_SET_CONFIG":
                this.initialize(payload);
                break;
            case "YNAB_CLEANUP":
                this.cleanup();
                break;
        }
    },

    initialize: function (payload) {
        config = payload;
        self = this;
        
        if (!config.token) {
            this.sendError("YNAB token is required");
            return;
        }

        const ynabAPI = new ynab.API(config.token);

        if (config.budgetId) {
            ynabBudgetId = config.budgetId;
            this.updateBudget();
            this.setInterval();
            return;
        }

        // Get first budget if no specific budget ID provided
        ynabAPI.budgets.getBudgets()
            .then(budgetsResponse => {
                if (!budgetsResponse.data.budgets || budgetsResponse.data.budgets.length === 0) {
                    throw new Error("No budgets found in YNAB account");
                }
                ynabBudgetId = budgetsResponse.data.budgets[0].id;
                this.updateBudget();
                this.setInterval();
            })
            .catch(error => {
                this.handleError(error, "Failed to fetch budgets");
            });
    },

    setInterval: function () {
        if (interval) {
            clearInterval(interval);
        }
        
        const updateInterval = config.updateInterval || 90000;
        interval = setInterval(() => {
            self.updateBudget();
        }, updateInterval);
    },

    updateBudget: function () {
        if (!ynabBudgetId) {
            this.sendError("No budget ID available");
            return;
        }

        self.sendSocketNotification("YNAB_LOADING");
        
        const ynabAPI = new ynab.API(config.token);
        
        // Fetch both categories and transactions
        Promise.all([
            ynabAPI.categories.getCategories(ynabBudgetId),
            ynabAPI.transactions.getTransactions(ynabBudgetId)
        ])
        .then(([categoriesResponse, transactionsResponse]) => {
            const categoryGroups = categoriesResponse.data.category_groups || [];
            const allCategories = categoryGroups.flatMap(group => group.categories || []);
            const transactions = transactionsResponse.data.transactions || [];
            
            // Store category groups for spending calculation
            this.categoryGroups = categoryGroups;
            
            // Create a map for quick lookup
            const categoryMap = new Map();
            allCategories.forEach(category => {
                categoryMap.set(category.name, category);
            });

            // Filter categories based on config
            const requestedCategories = config.categories || [];
            const filteredCategories = requestedCategories
                .map(categoryName => categoryMap.get(categoryName))
                .filter(category => category !== undefined);

            if (filteredCategories.length === 0) {
                console.log("MMM-YNAB: No matching categories found. Available categories:", 
                    Array.from(categoryMap.keys()).join(", "));
            }

            // Calculate category group summaries
            const groupSummaries = this.calculateGroupSummaries(categoryGroups);

            // Calculate spending for different time periods
            const spendingData = this.calculateSpending(transactions);

            // Get last 3 transactions
            const lastTransactions = this.getLastTransactions(transactions, 3);

            self.sendSocketNotification("YNAB_UPDATE", {
                items: filteredCategories,
                spending: spendingData,
                groupSummaries: groupSummaries,
                lastTransactions: lastTransactions,
                totalCategories: allCategories.length,
                matchedCategories: filteredCategories.length
            });
        })
        .catch(error => {
            this.handleError(error, "Failed to fetch budget data");
        });
    },

    calculateSpending: function (transactions) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay()); // Start of current week (Sunday)
        const startOfLastWeek = new Date(startOfWeek);
        startOfLastWeek.setDate(startOfWeek.getDate() - 7);
        const endOfLastWeek = new Date(startOfWeek);
        endOfLastWeek.setDate(startOfWeek.getDate() - 1);

        let todaySpending = 0;
        let thisWeekSpending = 0;
        let lastWeekSpending = 0;

        // Get excluded groups from config, with fallback to common bill groups
        const excludedGroups = config.excludedGroups || ["Monthly Bills", "Bills", "Fixed Expenses", "Recurring Bills"];
        
        transactions.forEach(transaction => {
            if (transaction.amount > 0) { // Only count spending (positive amounts)
                const transactionDate = new Date(transaction.date);
                
                // Check if this transaction belongs to an excluded category group
                let isExcludedGroupTransaction = false;
                let isExcludedCategory = false;
                let transactionCategoryName = null;
                
                if (transaction.category_id) {
                    // Find the category group for this transaction
                    for (const group of this.categoryGroups || []) {
                        if (group.categories) {
                            const category = group.categories.find(cat => cat.id === transaction.category_id);
                            if (category) {
                                transactionCategoryName = category.name;
                                // Check if this category belongs to an excluded group
                                if (excludedGroups.includes(group.name)) {
                                    isExcludedGroupTransaction = true;
                                }
                                // Check if this category is in the excluded list
                                if (config.excludedCategories && config.excludedCategories.includes(category.name)) {
                                    isExcludedCategory = true;
                                }
                                break;
                            }
                        }
                    }
                }
                
                // Only count non-excluded group and non-excluded category transactions
                if (!isExcludedGroupTransaction && !isExcludedCategory) {
                    // Today's spending
                    if (transactionDate >= today) {
                        todaySpending += transaction.amount;
                    }
                    
                    // This week's spending
                    if (transactionDate >= startOfWeek) {
                        thisWeekSpending += transaction.amount;
                    }
                    
                    // Last week's spending
                    if (transactionDate >= startOfLastWeek && transactionDate < startOfWeek) {
                        lastWeekSpending += transaction.amount;
                    }
                }
            }
        });

        return {
            today: todaySpending / 1000, // Convert from millidollars
            thisWeek: thisWeekSpending / 1000,
            lastWeek: lastWeekSpending / 1000
        };
    },

    getLastTransactions: function (transactions, count) {
        // Filter out transfers and get only spending transactions
        const spendingTransactions = transactions.filter(transaction => {
            // Only include positive amounts (spending)
            if (transaction.amount <= 0) return false;
            
            // Exclude transfers
            if (transaction.transfer_account_id || transaction.transfer_transaction_id) return false;
            
            // Exclude income-related transactions
            const isIncome = (transaction.payee_name && (
                transaction.payee_name.toLowerCase().includes('deposit') ||
                transaction.payee_name.toLowerCase().includes('direct deposit') ||
                transaction.payee_name.toLowerCase().includes('payroll') ||
                transaction.payee_name.toLowerCase().includes('income') ||
                transaction.payee_name.toLowerCase().includes('salary') ||
                transaction.payee_name.toLowerCase().includes('paycheck') ||
                transaction.payee_name.toLowerCase().includes('refund') ||
                transaction.payee_name.toLowerCase().includes('credit')
            )) || (transaction.memo && (
                transaction.memo.toLowerCase().includes('deposit') ||
                transaction.memo.toLowerCase().includes('income') ||
                transaction.memo.toLowerCase().includes('salary') ||
                transaction.memo.toLowerCase().includes('paycheck') ||
                transaction.memo.toLowerCase().includes('refund') ||
                transaction.memo.toLowerCase().includes('credit')
            ));
            
            if (isIncome) {
                console.log("MMM-YNAB: Excluding income transaction:", {
                    date: transaction.date,
                    payee: transaction.payee_name,
                    memo: transaction.memo,
                    amount: transaction.amount / 1000
                });
                return false;
            }
            
            // Exclude transactions from excluded groups
            const excludedGroups = config.excludedGroups || ["Monthly Bills", "Bills", "Fixed Expenses", "Recurring Bills"];
            if (transaction.category_id) {
                for (const group of this.categoryGroups || []) {
                    if (group.categories) {
                        const category = group.categories.find(cat => cat.id === transaction.category_id);
                        if (category && excludedGroups.includes(group.name)) {
                            console.log("MMM-YNAB: Excluding bill transaction:", {
                                date: transaction.date,
                                payee: transaction.payee_name,
                                category: category.name,
                                group: group.name,
                                amount: transaction.amount / 1000
                            });
                            return false;
                        }
                    }
                }
            }
            
            // Exclude specific categories
            if (config.excludedCategories && transaction.category_id) {
                for (const group of this.categoryGroups || []) {
                    if (group.categories) {
                        const category = group.categories.find(cat => cat.id === transaction.category_id);
                        if (category && config.excludedCategories.includes(category.name)) {
                            console.log("MMM-YNAB: Excluding category transaction:", {
                                date: transaction.date,
                                payee: transaction.payee_name,
                                category: category.name,
                                amount: transaction.amount / 1000
                            });
                            return false;
                        }
                    }
                }
            }
            
            console.log("MMM-YNAB: Including transaction:", {
                date: transaction.date,
                payee: transaction.payee_name,
                amount: transaction.amount / 1000
            });
            
            return true;
        });
        
        // Sort by date (most recent first) and take the last 'count' transactions
        const sortedTransactions = spendingTransactions
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, count);
        
        // Format the transactions
        return sortedTransactions.map(transaction => ({
            payee: transaction.payee_name || 'Unknown',
            amount: transaction.amount / 1000, // Convert from millidollars
            date: transaction.date
        }));
    },

    calculateGroupSummaries: function (categoryGroups) {
        const summaries = [];
        const requestedGroups = config.groups || [];
        
        categoryGroups.forEach(group => {
            if (group.categories && group.categories.length > 0) {
                // Calculate total available for this group
                const totalAvailable = group.categories.reduce((sum, category) => {
                    return sum + (category.balance || 0);
                }, 0);
                
                // If specific groups are requested, only include those that are in the list
                if (requestedGroups.length === 0) {
                    // No groups specified - show all groups with positive amounts
                    if (totalAvailable > 0) {
                        summaries.push({
                            name: group.name,
                            totalAvailable: totalAvailable / 1000, // Convert from millidollars
                            categoryCount: group.categories.length
                        });
                    }
                } else {
                    // Groups are specified - only show requested groups (regardless of amount)
                    if (requestedGroups.includes(group.name)) {
                        summaries.push({
                            name: group.name,
                            totalAvailable: totalAvailable / 1000, // Convert from millidollars
                            categoryCount: group.categories.length
                        });
                    }
                }
            }
        });
        
        // Sort alphabetically by group name
        summaries.sort((a, b) => a.name.localeCompare(b.name));
        
        return summaries;
    },

    handleError: function (error, defaultMessage) {
        console.error("MMM-YNAB Error:", error);
        
        let errorMessage = defaultMessage;
        if (error.response && error.response.data && error.response.data.error) {
            errorMessage = error.response.data.error.detail || error.response.data.error.title || defaultMessage;
        } else if (error.message) {
            errorMessage = error.message;
        }

        this.sendError(errorMessage);
    },

    sendError: function (message) {
        self.sendSocketNotification("YNAB_ERROR", {
            message: message,
            timestamp: new Date().toISOString()
        });
    },

    cleanup: function () {
        if (interval) {
            clearInterval(interval);
            interval = null;
        }
        console.log("MMM-YNAB: Cleanup completed");
    }
});
