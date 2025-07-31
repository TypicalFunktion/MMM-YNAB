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
                
                let errorMessage = "Failed to fetch budgets";
                if (error && error.response) {
                    if (error.response.status === 401) {
                        errorMessage = "Invalid YNAB token - please check your API token";
                    } else if (error.response.status === 403) {
                        errorMessage = "Access denied - check your YNAB token permissions";
                    } else {
                        errorMessage = `YNAB API error (${error.response.status}): ${error.response.data?.error?.detail || error.response.statusText}`;
                    }
                } else if (error && error.message) {
                    errorMessage = error.message;
                }
                
                this.handleError(error, errorMessage);
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
            this.sendSocketNotification("YNAB_UPDATE", {
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
            
            let errorMessage = "Failed to fetch YNAB data";
            if (error && error.response) {
                // YNAB API error
                if (error.response.status === 401) {
                    errorMessage = "Invalid YNAB token - please check your API token";
                } else if (error.response.status === 403) {
                    errorMessage = "Access denied - check your YNAB token permissions";
                } else if (error.response.status === 404) {
                    errorMessage = "Budget not found - check your budget ID";
                } else if (error.response.status === 429) {
                    // Calculate delay until top of next hour
                    const now = new Date();
                    const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
                    const delayMs = nextHour.getTime() - now.getTime();
                    
                    // Format the next attempt time
                    const nextAttemptTime = nextHour.toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit',
                        hour12: true 
                    });
                    
                    errorMessage = `Rate limit - retrying at ${nextAttemptTime}`;
                    
                    // Set a delay until the top of the next hour
                    setTimeout(() => {
                        console.log("MMM-YNAB: Retrying after rate limit delay...");
                        this.updateBudget();
                    }, delayMs);
                    return; // Don't send error notification, just wait
                } else {
                    errorMessage = `YNAB API error (${error.response.status}): ${error.response.data?.error?.detail || error.response.statusText}`;
                }
            } else if (error && error.message) {
                errorMessage = `Network error: ${error.message}`;
            } else if (error) {
                errorMessage = `Unknown error: ${JSON.stringify(error)}`;
            }
            
            this.handleError(error, errorMessage);
        });
    },

    calculateSpending: function (transactions) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
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
        const excludedGroups = this.config.excludedGroups || ["Monthly Bills", "Bills", "Fixed Expenses", "Recurring Bills"];
        
        transactions.forEach(transaction => {
            if (transaction.amount < 0) { // Only count spending (negative amounts)
                const transactionDate = new Date(transaction.date);
                
                // Check if we should exclude uncleared transactions
                if (!this.config.showUncleared && !transaction.cleared) {
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
                                if (this.config.excludedCategories && this.config.excludedCategories.includes(category.name)) {
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
        console.log("Filtering recent transactions with config:", {
            recentExcludedCategories: this.config.recentExcludedCategories,
            recentExcludedGroups: this.config.recentExcludedGroups
        });

        const spendingTransactions = transactions.filter(transaction => {
            if (transaction.amount >= 0) return false; // Exclude positive amounts (income)
            if (transaction.transfer_account_id || transaction.transfer_transaction_id) return false; // Exclude transfers
            if (!this.config.showUncleared && !transaction.cleared) { return false; } // Exclude uncleared
            
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
            if (this.config.recentExcludedGroups && this.config.recentExcludedGroups.length > 0) {
                const categoryId = transaction.category_id;
                if (categoryId) {
                    const category = this.categories.find(cat => cat.id === categoryId);
                    if (category) {
                        const categoryGroup = this.categoryGroups.find(group => group.id === category.category_group_id);
                        if (categoryGroup && this.config.recentExcludedGroups.includes(categoryGroup.name)) {
                            console.log("Excluding recent transaction from excluded group:", categoryGroup.name, transaction.payee_name);
                            isExcludedGroupTransaction = true;
                        }
                    }
                }
            }

            // Check if transaction belongs to excluded categories for recent transactions
            let isExcludedCategory = false;
            if (this.config.recentExcludedCategories && this.config.recentExcludedCategories.length > 0) {
                const categoryId = transaction.category_id;
                if (categoryId) {
                    const category = this.categories.find(cat => cat.id === categoryId);
                    if (category && this.config.recentExcludedCategories.includes(category.name)) {
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

        return recentTransactions.map(transaction => {
            // Find the category name for this transaction
            let categoryName = null;
            if (transaction.category_id) {
                const category = this.categories.find(cat => cat.id === transaction.category_id);
                if (category) {
                    categoryName = category.name;
                }
            }
            
            return {
                payee: transaction.payee_name || 'Unknown',
                amount: Math.abs(transaction.amount) / 1000, // Make positive for display
                date: transaction.date,
                category: categoryName
            };
        });
    },

    calculateGroupSummaries: function (categoryGroups) {
        const summaries = [];
        const requestedGroups = this.config.groups || [];
        
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
        
        let errorMessage = context;
        if (error) {
            if (error.message) {
                errorMessage = `${context}: ${error.message}`;
            } else if (typeof error === 'string') {
                errorMessage = `${context}: ${error}`;
            } else {
                errorMessage = `${context}: ${JSON.stringify(error)}`;
            }
        }
        
        this.sendError(errorMessage);
    },

    sendError: function (message) {
        this.sendSocketNotification("YNAB_ERROR", {
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
