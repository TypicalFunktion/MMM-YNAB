const ynab = require('ynab');
const NodeHelper = require("node_helper");

let ynabBudgetId;
let config;
let self;
let interval;

module.exports = NodeHelper.create({

    start: function () {
        this.config = {};
        this.categories = [];
        this.categoryGroups = [];
        this.loading = false;
        this.error = null;
        
        // Initialize with defaults to prevent undefined errors
        this.config.recentExcludedCategories = [];
        this.config.recentExcludedGroups = [];
        this.config.excludedCategories = [];
        this.config.excludedGroups = [];
        this.config.showUncleared = true;
        
        console.log("MMM-YNAB node helper started");
    },

    socketNotificationReceived: function (notification, payload) {
        const self = this;
        
        switch (notification) {
            case "YNAB_SET_CONFIG":
                // Merge the configuration with defaults to ensure all properties exist
                this.config = {
                    recentExcludedCategories: [],
                    recentExcludedGroups: [],
                    excludedCategories: [],
                    excludedGroups: [],
                    showUncleared: true,
                    ...payload
                };
                
                console.log("MMM-YNAB config received:", this.config);
                
                // Initialize the budget
                this.initializeBudget();
                break;
            case "YNAB_CLEANUP":
                this.cleanup();
                break;
        }
    },

    initializeBudget: function () {
        console.log("MMM-YNAB: Starting budget initialization...");
        
        if (!this.config.token) {
            console.log("MMM-YNAB: No token provided");
            this.sendError("YNAB token is required");
            return;
        }

        console.log("MMM-YNAB: Creating YNAB API instance...");
        const ynabAPI = new ynab.API(this.config.token);

        if (this.config.budgetId) {
            console.log(`MMM-YNAB: Using provided budget ID: ${this.config.budgetId}`);
            ynabBudgetId = this.config.budgetId;
            this.updateBudget();
            this.setInterval();
            return;
        }

        console.log("MMM-YNAB: No budget ID provided, fetching first available budget...");
        // Get first budget if no specific budget ID provided
        ynabAPI.budgets.getBudgets()
            .then(budgetsResponse => {
                console.log(`MMM-YNAB: Found ${budgetsResponse.data.budgets.length} budgets`);
                
                if (!budgetsResponse.data.budgets || budgetsResponse.data.budgets.length === 0) {
                    throw new Error("No budgets found in YNAB account");
                }
                
                ynabBudgetId = budgetsResponse.data.budgets[0].id;
                console.log(`MMM-YNAB: Using first budget: ${ynabBudgetId}`);
                
                this.updateBudget();
                this.setInterval();
            })
            .catch(error => {
                console.error("MMM-YNAB: Error fetching budgets:", error);
                this.handleError(error, "Failed to fetch budgets");
            });
    },

    setInterval: function () {
        if (interval) {
            clearInterval(interval);
        }
        
        const updateInterval = this.config.updateInterval || 90000;
        interval = setInterval(() => {
            this.updateBudget();
        }, updateInterval);
    },

    updateBudget: function () {
        console.log("MMM-YNAB: Starting updateBudget...");
        
        if (!ynabBudgetId) {
            console.log("MMM-YNAB: No budget ID available");
            this.sendError("No budget ID available");
            return;
        }

        if (!this.config.token) {
            console.log("MMM-YNAB: No token available");
            this.sendError("YNAB token is required");
            return;
        }

        console.log("MMM-YNAB: Making API calls to YNAB...");
        const ynabAPI = new ynab.API(this.config.token);

        Promise.all([
            ynabAPI.categories.getCategories(ynabBudgetId),
            ynabAPI.transactions.getTransactions(ynabBudgetId)
        ])
        .then(([categoriesResponse, transactionsResponse]) => {
            console.log("MMM-YNAB: API calls successful, processing data...");
            const categories = categoriesResponse.data.category_groups;
            const transactions = transactionsResponse.data.transactions;
            
            console.log(`MMM-YNAB: Found ${categories.length} category groups and ${transactions.length} transactions`);
            
            // Store category groups for use in filtering
            this.categoryGroups = categories;
            
            // Get all categories from all groups
            const allCategories = categories.flatMap(group => group.categories);
            this.categories = allCategories;
            
            console.log(`MMM-YNAB: Total categories available: ${allCategories.length}`);
            
            // Filter categories based on config
            const filteredCategories = allCategories.filter(category => {
                return this.config.categories.includes(category.name);
            });

            console.log(`MMM-YNAB: Filtered to ${filteredCategories.length} categories`);

            if (filteredCategories.length === 0) {
                console.log("MMM-YNAB: No matching categories found. Available categories:", allCategories.map(c => c.name));
            }

            // Calculate spending data
            console.log("MMM-YNAB: Calculating spending data...");
            const spendingData = this.calculateSpending(transactions);
            
            // Calculate group summaries
            console.log("MMM-YNAB: Calculating group summaries...");
            const groupSummaries = this.calculateGroupSummaries(categories);
            
            // Get last 10 transactions
            console.log("MMM-YNAB: Getting recent transactions...");
            const lastTransactions = this.getLastTransactions(transactions, 10);

            console.log("MMM-YNAB: Sending data to frontend...");
            self.sendSocketNotification("YNAB_UPDATE", {
                items: filteredCategories,
                spending: spendingData,
                groupSummaries: groupSummaries,
                lastTransactions: lastTransactions,
                loading: false,
                error: null
            });
            
            console.log("MMM-YNAB: Update complete!");
        })
        .catch(error => {
            console.error("MMM-YNAB: Error in updateBudget:", error);
            this.handleError(error, "Failed to fetch YNAB data");
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
            if (transaction.amount < 0) { // Only count spending (negative amounts)
                const transactionDate = new Date(transaction.date);
                
                // Check if we should exclude uncleared transactions
                if (!config.showUncleared && !transaction.cleared) {
                    return; // Skip uncleared transactions
                }
                
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
                        todaySpending += Math.abs(transaction.amount);
                    }
                    
                    // This week's spending
                    if (transactionDate >= startOfWeek) {
                        thisWeekSpending += Math.abs(transaction.amount);
                    }
                    
                    // Last week's spending
                    if (transactionDate >= startOfLastWeek && transactionDate < startOfWeek) {
                        lastWeekSpending += Math.abs(transaction.amount);
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
        const self = this;
        const config = this.config;
        
        console.log("Filtering recent transactions with config:", {
            recentExcludedCategories: config.recentExcludedCategories,
            recentExcludedGroups: config.recentExcludedGroups
        });

        const spendingTransactions = transactions.filter(transaction => {
            if (transaction.amount >= 0) return false; // Exclude positive amounts (income)
            if (transaction.transfer_account_id || transaction.transfer_transaction_id) return false; // Exclude transfers
            if (!config.showUncleared && !transaction.cleared) { return false; } // Exclude uncleared
            
            // Check for income-related keywords in payee or memo
            const payeeLower = (transaction.payee_name || '').toLowerCase();
            const memoLower = (transaction.memo || '').toLowerCase();
            const isIncome = payeeLower.includes('deposit') || 
                           payeeLower.includes('direct deposit') || 
                           payeeLower.includes('payroll') || 
                           payeeLower.includes('income') || 
                           payeeLower.includes('salary') || 
                           payeeLower.includes('paycheck') ||
                           memoLower.includes('deposit') || 
                           memoLower.includes('direct deposit') || 
                           memoLower.includes('payroll') || 
                           memoLower.includes('income') || 
                           memoLower.includes('salary') || 
                           memoLower.includes('paycheck') ||
                           payeeLower.includes('refund') ||
                           payeeLower.includes('credit') ||
                           memoLower.includes('refund') ||
                           memoLower.includes('credit');
            
            if (isIncome) {
                console.log("Excluding income transaction:", transaction.payee_name, transaction.memo);
                return false;
            }

            // Check if transaction belongs to excluded groups for recent transactions
            let isExcludedGroupTransaction = false;
            if (config.recentExcludedGroups && config.recentExcludedGroups.length > 0) {
                const categoryId = transaction.category_id;
                if (categoryId) {
                    const category = this.categories.find(cat => cat.id === categoryId);
                    if (category) {
                        const categoryGroup = this.categoryGroups.find(group => group.id === category.category_group_id);
                        if (categoryGroup && config.recentExcludedGroups.includes(categoryGroup.name)) {
                            console.log("Excluding recent transaction from excluded group:", categoryGroup.name, transaction.payee_name);
                            isExcludedGroupTransaction = true;
                        }
                    }
                }
            }

            // Check if transaction belongs to excluded categories for recent transactions
            let isExcludedCategory = false;
            if (config.recentExcludedCategories && config.recentExcludedCategories.length > 0) {
                const categoryId = transaction.category_id;
                if (categoryId) {
                    const category = this.categories.find(cat => cat.id === categoryId);
                    if (category && config.recentExcludedCategories.includes(category.name)) {
                        console.log("Excluding recent transaction from excluded category:", category.name, transaction.payee_name);
                        isExcludedCategory = true;
                    }
                }
            }

            return !isExcludedGroupTransaction && !isExcludedCategory;
        });

        console.log(`Filtered ${spendingTransactions.length} recent transactions from ${transactions.length} total transactions`);

        // Sort by date (most recent first) and take the specified count
        const sortedTransactions = spendingTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        const recentTransactions = sortedTransactions.slice(0, count);

        return recentTransactions.map(transaction => ({
            payee: transaction.payee_name || 'Unknown',
            amount: Math.abs(transaction.amount) / 1000, // Make positive for display
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

    handleError: function (error, context) {
        console.error(`MMM-YNAB ${context}:`, error);
        this.sendError(`${context}: ${error.message}`);
    },

    sendError: function (message) {
        self.sendSocketNotification("YNAB_ERROR", {
            message: message
        });
    },

    cleanup: function () {
        if (interval) {
            clearInterval(interval);
            interval = null;
        }
    }
});
